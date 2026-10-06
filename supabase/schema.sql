-- ================================================================
--  AudiStock — supabase/schema.sql
--  Esquema do banco (PostgreSQL 15+ no Supabase): tabelas, visões,
--  funções, gatilhos e permissões por perfil (RLS).
--
--  Reconstruído a partir do que o código lê e grava. Num projeto novo,
--  rode este arquivo inteiro no SQL Editor do Supabase. Num projeto que
--  já existe, compare antes (veja docs/teste-real.md) e aplique só o
--  que faltar: ele não apaga nada, mas os CREATE TABLE falham se a
--  tabela já existir.
--
--  Perfis, do maior para o menor:
--    supremo        tudo, inclusive excluir auditorias e criar administradores
--    administrador  cadastros, criar e cancelar auditorias
--    auditor        registra a contagem e faz o fechamento
--    visualizador   só consulta
--  Quem tem empresa_id só enxerga a própria empresa; empresa_id nulo
--  enxerga todas.
--
--  Regra geral: o que conta como registro de auditoria (número, autor,
--  horários, histórico de correções) é definido pelo banco, nunca pelo
--  que o navegador envia.
-- ================================================================

-- ── Tabelas ─────────────────────────────────────────────────────

create table public.empresas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (length(trim(nome)) > 0),
  cnpj         text unique,
  endereco     text,
  cidade       text,
  estado       text check (estado is null or estado ~ '^[A-Z]{2}$'),
  observacoes  text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

-- O perfil de cada pessoa. A senha não fica aqui: fica no Supabase Auth.
-- empresa_id nulo dá acesso a todas as empresas; por isso apagar uma
-- empresa com usuários é recusado (on delete restrict), em vez de
-- transformar esses usuários em usuários de todas as empresas.
create table public.usuarios (
  id             uuid primary key references auth.users (id) on delete cascade,
  nome           text not null check (length(trim(nome)) > 0),
  email          text not null unique,
  role           text not null check (role in ('supremo', 'administrador', 'auditor', 'visualizador')),
  empresa_id     uuid references public.empresas (id) on delete restrict,
  ativo          boolean not null default true,
  senha_hash     text default 'auth-supabase',   -- legado: nunca guarda senha
  criado_em      timestamptz not null default now(),
  ultimo_acesso  timestamptz
);

create table public.produtos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  codigo_produto  text not null check (length(trim(codigo_produto)) > 0),
  nome_produto    text not null check (length(trim(nome_produto)) > 0),
  unidade_medida  text,
  codigo_barras   text,
  observacoes     text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  unique (empresa_id, codigo_produto)
);
-- Um código de barras aponta para um só produto ativo da empresa: com dois,
-- o leitor não saberia qual contar.
create unique index produtos_barras_unico_idx on public.produtos (empresa_id, codigo_barras)
  where codigo_barras is not null and ativo;

create table public.auditorias (
  id                   uuid primary key default gen_random_uuid(),
  numero_auditoria     text not null unique check (numero_auditoria ~ '^AUD-[0-9]{4}-[0-9]{4,}$'),
  empresa_id           uuid not null references public.empresas (id) on delete restrict,
  criado_por           uuid references public.usuarios (id) on delete set null,
  auditoria_cega       boolean not null default true,
  status               text not null default 'em_andamento' check (status in ('em_andamento', 'finalizada', 'cancelada')),
  data_inicio          timestamptz not null default now(),
  data_fim             timestamptz,
  observacoes          text,
  cancelado_por        uuid references public.usuarios (id) on delete set null,
  cancelado_em         timestamptz,
  motivo_cancelamento  text,
  criado_em            timestamptz not null default now()
);
-- Uma auditoria em andamento por empresa
create unique index auditorias_uma_em_andamento_idx on public.auditorias (empresa_id) where status = 'em_andamento';

create table public.auditoria_itens (
  id                  uuid primary key default gen_random_uuid(),
  auditoria_id        uuid not null references public.auditorias (id) on delete cascade,
  produto_id          uuid not null references public.produtos (id) on delete restrict,
  quantidade_contada  numeric(14, 3) not null check (quantidade_contada >= 0),
  estoque_sistema     numeric(14, 3) check (estoque_sistema is null or estoque_sistema >= 0),
  diferenca           numeric(14, 3) generated always as (quantidade_contada - estoque_sistema) stored,
  registrado_por      uuid references public.usuarios (id) on delete set null,
  data_registro       timestamptz not null default now(),
  atualizado_em       timestamptz,
  unique (auditoria_id, produto_id)
);

-- Gravado só pelo gatilho itens_historico (ninguém escreve aqui direto)
create table public.auditoria_itens_historico (
  id                   uuid primary key default gen_random_uuid(),
  auditoria_item_id    uuid not null references public.auditoria_itens (id) on delete cascade,
  usuario_id           uuid references public.usuarios (id) on delete set null,
  quantidade_anterior  numeric(14, 3),
  quantidade_nova      numeric(14, 3),
  motivo               text,
  criado_em            timestamptz not null default now()
);
create index historico_item_idx on public.auditoria_itens_historico (auditoria_item_id);

-- Cada envio de contagem traz um id gerado no aparelho. Um envio que já
-- foi aplicado (resposta perdida na rede, a mesma fila em duas abas) não
-- soma de novo.
create table public.contagens_aplicadas (
  id_cliente         uuid primary key,
  auditoria_item_id  uuid not null references public.auditoria_itens (id) on delete cascade,
  aplicado_em        timestamptz not null default now()
);

-- Retrato tirado ao finalizar ou cancelar: o relatório de uma auditoria
-- encerrada não muda quando o cadastro de produtos muda depois.
create table public.auditoria_retratos (
  auditoria_id    uuid primary key references public.auditorias (id) on delete cascade,
  total_produtos  integer not null,
  nao_contados    jsonb not null default '[]',
  criado_em       timestamptz not null default now()
);

-- Cópia da auditoria antes da exclusão (só o supremo exclui)
create table public.auditoria_exclusoes_log (
  id            uuid primary key default gen_random_uuid(),
  auditoria_id  uuid not null,
  numero        text,
  empresa_id    uuid,
  excluido_por  uuid references public.usuarios (id) on delete set null,
  snapshot      jsonb,
  excluido_em   timestamptz not null default now()
);

create table public.importacoes_produtos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid references public.empresas (id) on delete cascade,
  usuario_id    uuid references public.usuarios (id) on delete set null,
  total_linhas  integer not null default 0,
  criados       integer not null default 0,
  atualizados   integer not null default 0,
  erros         integer not null default 0,
  detalhes      jsonb,
  criado_em     timestamptz not null default now()
);

-- Contador da numeração AUD-AAAA-NNNN, um por ano
create table public.auditoria_numeracao (
  ano     integer primary key,
  ultimo  integer not null
);

-- ── Quem está chamando ──────────────────────────────────────────
-- SECURITY DEFINER: leem usuarios sem passar pelo RLS da própria tabela
-- (senão a política de usuarios chamaria a si mesma).

create or replace function public.nivel_papel(p_papel text) returns integer
language sql immutable as $$
  select case p_papel when 'supremo' then 4 when 'administrador' then 3
                      when 'auditor' then 2 when 'visualizador' then 1 else 0 end
$$;

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select role from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.tem_papel(p_minimo text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.nivel_papel(public.meu_papel()) >= public.nivel_papel(p_minimo), false)
$$;

-- Usuário ativo, e a empresa está no alcance dele
create or replace function public.alcanca_empresa(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and ativo and (empresa_id is null or empresa_id = p_empresa)
  )
$$;

-- ── Visões do relatório ─────────────────────────────────────────
-- security_invoker: a visão respeita o RLS de quem consulta.

create or replace view public.vw_relatorio_divergencias with (security_invoker = true) as
select
  i.auditoria_id,
  i.id               as item_id,
  i.produto_id,
  p.codigo_produto,
  p.nome_produto,
  p.unidade_medida,
  i.quantidade_contada,
  i.estoque_sistema,
  i.diferenca,
  case when i.diferenca > 0 then 'sobra' when i.diferenca < 0 then 'falta' else 'ok' end as status_divergencia,
  i.data_registro
from public.auditoria_itens i
join public.produtos p on p.id = i.produto_id;

-- Em andamento: os produtos ativos de hoje que ainda não foram contados.
-- Encerrada: o retrato tirado no encerramento (ou o cadastro de hoje, para
-- auditorias encerradas antes de existir o retrato).
create or replace view public.vw_produtos_nao_auditados with (security_invoker = true) as
select a.id as auditoria_id, p.id as produto_id, p.codigo_produto, p.nome_produto, p.unidade_medida
from public.auditorias a
join public.produtos p on p.empresa_id = a.empresa_id and p.ativo
where not exists (select 1 from public.auditoria_retratos r where r.auditoria_id = a.id)
  and not exists (select 1 from public.auditoria_itens i where i.auditoria_id = a.id and i.produto_id = p.id)
union all
select r.auditoria_id, x.produto_id, x.codigo_produto, x.nome_produto, x.unidade_medida
from public.auditoria_retratos r
cross join lateral jsonb_to_recordset(r.nao_contados)
  as x(produto_id uuid, codigo_produto text, nome_produto text, unidade_medida text);

-- ── Numeração das auditorias ────────────────────────────────────

-- Próximo AUD-AAAA-NNNN. O contador é atualizado de forma atômica: dois
-- administradores ao mesmo tempo nunca recebem o mesmo número. Só o
-- gatilho abaixo chama esta função.
create or replace function public.proximo_numero_auditoria() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ano integer := extract(year from (now() at time zone 'America/Sao_Paulo'))::integer;
  v_seq integer;
begin
  insert into public.auditoria_numeracao as n (ano, ultimo)
  values (v_ano, coalesce((
    select max(split_part(numero_auditoria, '-', 3)::integer)
    from public.auditorias where numero_auditoria ~ ('^AUD-' || v_ano || '-[0-9]+$')
  ), 0) + 1)
  on conflict (ano) do update set ultimo = n.ultimo + 1
  returning ultimo into v_seq;
  return 'AUD-' || v_ano || '-' || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
end $$;

-- O número enviado pelo navegador é ignorado: quem usa o app recebe sempre
-- o próximo da sequência. (Sem usuário, no SQL Editor, um número informado
-- é mantido; serve para importar dados antigos.)
create or replace function public.numerar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null or new.numero_auditoria is null then
    new.numero_auditoria := public.proximo_numero_auditoria();
  end if;
  return new;
end $$;

create trigger auditorias_numeradas
  before insert on public.auditorias
  for each row execute function public.numerar_auditoria();

-- ── Contagem ────────────────────────────────────────────────────

-- Registra a contagem de um produto numa só transação. Leituras seguidas
-- do leitor, ou dois aparelhos no mesmo produto, nunca perdem unidades.
--   p_acao 'somar'        soma ao que já existe
--          'sobrescrever' troca o valor (escolha explícita de quem conta)
--          'novo'         só grava se o produto ainda não foi contado; se
--                         já foi, recusa com o código AS001, e a tela pergunta
--                         se soma ou substitui
--   p_id_cliente          id do envio, gerado no aparelho: repetido, não soma
-- O histórico das mudanças é gravado pelo gatilho itens_historico.
create or replace function public.registrar_contagem(
  p_auditoria_id uuid, p_produto_id uuid, p_quantidade numeric,
  p_acao text default 'somar', p_id_cliente uuid default null
) returns public.auditoria_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_anterior numeric;
  v_item     public.auditoria_itens;
begin
  if p_id_cliente is not null then
    select i.* into v_item from public.contagens_aplicadas c
      join public.auditoria_itens i on i.id = c.auditoria_item_id
     where c.id_cliente = p_id_cliente;
    if found then return v_item; end if;
  end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade não pode ser negativa.' using errcode = '22023';
  end if;
  if p_acao not in ('novo', 'somar', 'sobrescrever') then
    raise exception 'Ação inválida: %', p_acao using errcode = '22023';
  end if;

  select quantidade_contada into v_anterior
  from public.auditoria_itens
  where auditoria_id = p_auditoria_id and produto_id = p_produto_id
  for update;

  if not found then
    begin
      insert into public.auditoria_itens (auditoria_id, produto_id, quantidade_contada)
      values (p_auditoria_id, p_produto_id, p_quantidade)
      returning * into v_item;
    exception when unique_violation then
      -- Outro aparelho gravou o mesmo produto neste instante
      if p_acao = 'novo' then
        raise exception 'Este produto já foi contado nesta auditoria.' using errcode = 'AS001';
      end if;
      update public.auditoria_itens
         set quantidade_contada = case when p_acao = 'somar' then quantidade_contada + p_quantidade else p_quantidade end
       where auditoria_id = p_auditoria_id and produto_id = p_produto_id
      returning * into v_item;
    end;
  else
    if p_acao = 'novo' then
      raise exception 'Este produto já foi contado nesta auditoria.' using errcode = 'AS001', detail = v_anterior::text;
    end if;
    update public.auditoria_itens
       set quantidade_contada = case when p_acao = 'somar' then quantidade_contada + p_quantidade else p_quantidade end
     where auditoria_id = p_auditoria_id and produto_id = p_produto_id
    returning * into v_item;
  end if;

  if p_id_cliente is not null then
    insert into public.contagens_aplicadas (id_cliente, auditoria_item_id) values (p_id_cliente, v_item.id);
  end if;
  return v_item;
end $$;

-- Correção manual com motivo: o motivo segue para o histórico pelo gatilho
create or replace function public.corrigir_contagem(p_item_id uuid, p_quantidade numeric, p_motivo text default null)
returns public.auditoria_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_item public.auditoria_itens;
begin
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade não pode ser negativa.' using errcode = '22023';
  end if;
  perform set_config('audistock.motivo', coalesce(nullif(trim(p_motivo), ''), ''), true);
  update public.auditoria_itens set quantidade_contada = p_quantidade where id = p_item_id
  returning * into v_item;
  perform set_config('audistock.motivo', '', true);
  if v_item.id is null then   -- o RLS escondeu o item: auditoria encerrada ou fora do alcance
    raise exception 'A auditoria não está em andamento: a contagem não pode mais mudar.' using errcode = '42501';
  end if;
  return v_item;
end $$;

-- ── Regras que o RLS sozinho não cobre ──────────────────────────

-- Ninguém muda o próprio perfil de acesso; só o supremo cria ou promove
-- administradores e supremos, e só ele troca e-mails (o e-mail do perfil
-- precisa continuar igual ao do login). Chamadas sem usuário (SQL Editor,
-- chave de serviço) passam livres.
create or replace function public.proteger_usuarios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'UPDATE' and new.id = auth.uid() and not public.tem_papel('supremo') and (
       new.role is distinct from old.role or new.empresa_id is distinct from old.empresa_id
    or new.ativo is distinct from old.ativo or new.email is distinct from old.email) then
    raise exception 'Você não pode alterar o próprio perfil de acesso.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.email is distinct from old.email and not public.tem_papel('supremo') then
    raise exception 'O e-mail é o login da pessoa e não pode ser alterado aqui.' using errcode = '42501';
  end if;

  if not public.tem_papel('supremo') and new.role in ('supremo', 'administrador')
     and (tg_op = 'INSERT' or new.role is distinct from old.role) then
    raise exception 'Só o supremo cria ou promove administradores.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger usuarios_protegidos
  before insert or update on public.usuarios
  for each row execute function public.proteger_usuarios();

-- Número, empresa, autor e início de uma auditoria não mudam. Quem
-- finaliza ou cancela, e quando, é gravado pelo banco. O auditor só
-- finaliza: não mexe no tipo de contagem, nas observações nem no
-- cancelamento.
create or replace function public.proteger_auditorias() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.numero_auditoria is distinct from old.numero_auditoria or new.empresa_id is distinct from old.empresa_id
     or new.criado_por is distinct from old.criado_por or new.data_inicio is distinct from old.data_inicio then
    raise exception 'Número, empresa, autor e início da auditoria não podem mudar.' using errcode = '42501';
  end if;
  if not public.tem_papel('administrador') and (
       new.auditoria_cega is distinct from old.auditoria_cega or new.observacoes is distinct from old.observacoes
    or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Seu perfil só pode finalizar a auditoria.' using errcode = '42501';
  end if;

  if new.status = 'finalizada' and old.status <> 'finalizada' then
    new.data_fim := now();
  else
    new.data_fim := old.data_fim;
  end if;
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    new.cancelado_por := auth.uid();
    new.cancelado_em  := now();
  else
    new.cancelado_por := old.cancelado_por;
    new.cancelado_em  := old.cancelado_em;
  end if;
  return new;
end $$;

create trigger auditorias_protegidas
  before update on public.auditorias
  for each row execute function public.proteger_auditorias();

-- Ao encerrar, guarda o retrato dos produtos que ficaram sem contar
create or replace function public.retratar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria_retratos (auditoria_id, total_produtos, nao_contados)
  select new.id, count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', p.id, 'codigo_produto', p.codigo_produto,
           'nome_produto', p.nome_produto, 'unidade_medida', p.unidade_medida) order by p.nome_produto)
           filter (where not exists (select 1 from public.auditoria_itens i where i.auditoria_id = new.id and i.produto_id = p.id)),
         '[]'::jsonb)
  from public.produtos p
  where p.empresa_id = new.empresa_id and p.ativo
  on conflict (auditoria_id) do nothing;
  return null;
end $$;

create trigger auditorias_retratadas
  after update of status on public.auditorias
  for each row when (old.status = 'em_andamento' and new.status <> 'em_andamento')
  execute function public.retratar_auditoria();

-- Itens contados:
-- * só mudam com a auditoria em andamento (também para a chave de serviço);
-- * o produto precisa ser da empresa da auditoria;
-- * quem registrou e quando é definido pelo banco, não pelo navegador;
-- * a única mudança aceita fora disso é a do Supabase ao apagar um usuário
--   (registrado_por vira nulo), para a exclusão de dados pessoais funcionar.
create or replace function public.proteger_itens() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is null and new.registrado_por is null and old.registrado_por is not null
     and new.quantidade_contada = old.quantidade_contada and new.estoque_sistema is not distinct from old.estoque_sistema
     and new.auditoria_id = old.auditoria_id and new.produto_id = old.produto_id then
    return new;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null then
    new.auditoria_id   := old.auditoria_id;
    new.produto_id     := old.produto_id;
    new.registrado_por := old.registrado_por;
    new.data_registro  := old.data_registro;
    new.atualizado_em  := case when new.quantidade_contada is distinct from old.quantidade_contada then now() else old.atualizado_em end;
  elsif tg_op = 'INSERT' and auth.uid() is not null then
    new.registrado_por := auth.uid();
    new.data_registro  := now();
    new.atualizado_em  := null;
  end if;

  if not exists (select 1 from public.auditorias where id = new.auditoria_id and status = 'em_andamento') then
    raise exception 'A auditoria não está em andamento: a contagem não pode mais mudar.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.produtos p join public.auditorias a on a.empresa_id = p.empresa_id
                  where p.id = new.produto_id and a.id = new.auditoria_id) then
    raise exception 'O produto não é da empresa desta auditoria.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger itens_so_em_andamento
  before insert or update on public.auditoria_itens
  for each row execute function public.proteger_itens();

-- Toda mudança de quantidade fica no histórico, por qualquer caminho
-- (função, atualização direta, outro aparelho). O motivo vem da função
-- corrigir_contagem.
create or replace function public.historiar_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria_itens_historico (auditoria_item_id, usuario_id, quantidade_anterior, quantidade_nova, motivo)
  values (new.id, auth.uid(), old.quantidade_contada, new.quantidade_contada,
          nullif(current_setting('audistock.motivo', true), ''));
  return null;
end $$;

create trigger itens_historico
  after update of quantidade_contada on public.auditoria_itens
  for each row when (old.quantidade_contada is distinct from new.quantidade_contada)
  execute function public.historiar_item();

-- ── Permissões por perfil (RLS) ─────────────────────────────────

alter table public.empresas                  enable row level security;
alter table public.usuarios                  enable row level security;
alter table public.produtos                  enable row level security;
alter table public.auditorias                enable row level security;
alter table public.auditoria_itens           enable row level security;
alter table public.auditoria_itens_historico enable row level security;
alter table public.contagens_aplicadas       enable row level security;
alter table public.auditoria_retratos        enable row level security;
alter table public.auditoria_exclusoes_log   enable row level security;
alter table public.importacoes_produtos      enable row level security;
alter table public.auditoria_numeracao       enable row level security;   -- sem política: só pela função

-- Empresas. O administrador de uma empresa não cria outras nem desativa
-- a própria (ficaria sem acesso a nada).
create policy empresas_ver on public.empresas for select to authenticated
  using (public.alcanca_empresa(id));
create policy empresas_criar on public.empresas for insert to authenticated
  with check (public.tem_papel('administrador') and public.minha_empresa() is null);
create policy empresas_editar on public.empresas for update to authenticated
  using (public.tem_papel('administrador') and public.alcanca_empresa(id))
  with check (public.tem_papel('administrador') and public.alcanca_empresa(id)
              and (public.minha_empresa() is null or ativo));

-- Usuários: cada um vê a si e às pessoas do seu alcance (para mostrar
-- "Criada por", "Contado por"); administradores cuidam de auditores e
-- visualizadores da sua empresa; o supremo, de todos.
create policy usuarios_ver on public.usuarios for select to authenticated
  using (id = auth.uid() or (public.tem_papel('visualizador')
         and (empresa_id is null or public.alcanca_empresa(empresa_id))));
create policy usuarios_criar on public.usuarios for insert to authenticated
  with check (public.tem_papel('supremo') or (public.tem_papel('administrador')
              and role in ('auditor', 'visualizador') and empresa_id is not distinct from coalesce(public.minha_empresa(), empresa_id)));
create policy usuarios_editar on public.usuarios for update to authenticated
  using (id = auth.uid() or public.tem_papel('supremo') or (public.tem_papel('administrador')
         and role in ('auditor', 'visualizador') and public.alcanca_empresa(empresa_id)))
  with check (id = auth.uid() or public.tem_papel('supremo') or (public.tem_papel('administrador')
              and role in ('auditor', 'visualizador') and public.alcanca_empresa(empresa_id)));

-- Produtos
create policy produtos_ver on public.produtos for select to authenticated
  using (public.alcanca_empresa(empresa_id));
create policy produtos_criar on public.produtos for insert to authenticated
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id));
create policy produtos_editar on public.produtos for update to authenticated
  using (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id))
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id));

-- Auditorias: administrador cria e cancela; auditor só finaliza;
-- só o supremo exclui.
create policy auditorias_ver on public.auditorias for select to authenticated
  using (public.alcanca_empresa(empresa_id));
create policy auditorias_criar on public.auditorias for insert to authenticated
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id)
              and status = 'em_andamento' and criado_por = auth.uid());
create policy auditorias_editar on public.auditorias for update to authenticated
  using (status = 'em_andamento' and public.tem_papel('auditor') and public.alcanca_empresa(empresa_id))
  with check (public.alcanca_empresa(empresa_id) and (status in ('em_andamento', 'finalizada')
              or (status = 'cancelada' and public.tem_papel('administrador'))));
create policy auditorias_excluir on public.auditorias for delete to authenticated
  using (public.tem_papel('supremo'));

-- Itens contados
create policy itens_ver on public.auditoria_itens for select to authenticated
  using (exists (select 1 from public.auditorias a where a.id = auditoria_id and public.alcanca_empresa(a.empresa_id)));
create policy itens_criar on public.auditoria_itens for insert to authenticated
  with check (public.tem_papel('auditor') and exists (select 1 from public.auditorias a
              where a.id = auditoria_id and a.status = 'em_andamento' and public.alcanca_empresa(a.empresa_id)));
create policy itens_editar on public.auditoria_itens for update to authenticated
  using (public.tem_papel('auditor') and exists (select 1 from public.auditorias a
         where a.id = auditoria_id and a.status = 'em_andamento' and public.alcanca_empresa(a.empresa_id)))
  with check (public.tem_papel('auditor') and exists (select 1 from public.auditorias a
              where a.id = auditoria_id and a.status = 'em_andamento' and public.alcanca_empresa(a.empresa_id)));

-- Histórico de correções: só leitura (quem grava é o gatilho)
create policy historico_ver on public.auditoria_itens_historico for select to authenticated
  using (exists (select 1 from public.auditoria_itens i join public.auditorias a on a.id = i.auditoria_id
                 where i.id = auditoria_item_id and public.alcanca_empresa(a.empresa_id)));

-- Envios de contagem já aplicados (usado pela função registrar_contagem)
create policy envios_ver on public.contagens_aplicadas for select to authenticated
  using (public.tem_papel('auditor'));
create policy envios_criar on public.contagens_aplicadas for insert to authenticated
  with check (public.tem_papel('auditor'));

-- Retratos: leitura de quem vê a auditoria (quem grava é o gatilho)
create policy retratos_ver on public.auditoria_retratos for select to authenticated
  using (exists (select 1 from public.auditorias a where a.id = auditoria_id and public.alcanca_empresa(a.empresa_id)));

-- Registros de exclusão e de importação
create policy exclusoes_ver on public.auditoria_exclusoes_log for select to authenticated
  using (public.tem_papel('supremo'));
create policy exclusoes_criar on public.auditoria_exclusoes_log for insert to authenticated
  with check (public.tem_papel('supremo') and excluido_por = auth.uid());
create policy importacoes_ver on public.importacoes_produtos for select to authenticated
  using (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id));
create policy importacoes_criar on public.importacoes_produtos for insert to authenticated
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id) and usuario_id = auth.uid());

-- ── Acesso das chaves do Supabase ───────────────────────────────
-- Sem login (anon) nada é visível; com login, o RLS acima decide.

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.auditoria_numeracao from authenticated;
revoke insert, update, delete on public.auditoria_itens_historico, public.auditoria_retratos from authenticated;
revoke all on function public.proximo_numero_auditoria(), public.numerar_auditoria(), public.proteger_usuarios(),
  public.proteger_auditorias(), public.retratar_auditoria(), public.proteger_itens(), public.historiar_item()
  from anon, authenticated, public;
revoke all on function public.registrar_contagem(uuid, uuid, numeric, text, uuid), public.corrigir_contagem(uuid, numeric, text)
  from anon, public;
grant execute on function public.registrar_contagem(uuid, uuid, numeric, text, uuid), public.corrigir_contagem(uuid, numeric, text)
  to authenticated;
