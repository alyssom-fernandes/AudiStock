-- ================================================================
--  AudiStock — supabase/schema.sql
--  Esquema do banco (PostgreSQL 15+ no Supabase): tabelas, visões,
--  funções, gatilhos e permissões por perfil (RLS).
--
--  Reconstruído a partir do que o código lê e grava. Rode o arquivo
--  inteiro no SQL Editor do Supabase, num projeto novo ou num que já
--  existe: ele pode ser rodado de novo e não apaga dados. Num banco
--  criado por uma versão anterior, a seção "Ajustes de versões
--  anteriores" troca o que mudou de definição e remove o que ficou
--  velho (veja docs/teste-real.md). Depois, rode
--  supabase/testes/permissoes.sql para conferir.
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

create table if not exists public.empresas (
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
create table if not exists public.usuarios (
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

create table if not exists public.produtos (
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

create table if not exists public.auditorias (
  id                   uuid primary key default gen_random_uuid(),
  numero_auditoria     text not null unique,
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

create table if not exists public.auditoria_itens (
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
create table if not exists public.auditoria_itens_historico (
  id                   uuid primary key default gen_random_uuid(),
  auditoria_item_id    uuid not null references public.auditoria_itens (id) on delete cascade,
  usuario_id           uuid references public.usuarios (id) on delete set null,
  quantidade_anterior  numeric(14, 3),
  quantidade_nova      numeric(14, 3),
  motivo               text,
  criado_em            timestamptz not null default now()
);

-- Cada envio de contagem traz um id gerado no aparelho. Um envio que já
-- foi aplicado (resposta perdida na rede, a mesma fila em duas abas) não
-- soma de novo.
create table if not exists public.contagens_aplicadas (
  id_cliente         uuid primary key,
  auditoria_item_id  uuid not null references public.auditoria_itens (id) on delete cascade,
  aplicado_em        timestamptz not null default now()
);

-- Retrato tirado ao finalizar ou cancelar: o relatório de uma auditoria
-- encerrada não muda quando o cadastro de produtos muda depois.
--   nao_contados  produtos ativos que ficaram sem contar
--   contados      código, nome e unidade dos produtos contados, por produto_id
create table if not exists public.auditoria_retratos (
  auditoria_id    uuid primary key references public.auditorias (id) on delete cascade,
  total_produtos  integer not null,
  nao_contados    jsonb not null default '[]',
  contados        jsonb,
  criado_em       timestamptz not null default now()
);

-- Cópia da auditoria antes da exclusão (só o supremo exclui)
create table if not exists public.auditoria_exclusoes_log (
  id            uuid primary key default gen_random_uuid(),
  auditoria_id  uuid not null,
  numero        text,
  empresa_id    uuid,
  excluido_por  uuid references public.usuarios (id) on delete set null,
  snapshot      jsonb,
  excluido_em   timestamptz not null default now()
);

create table if not exists public.importacoes_produtos (
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
create table if not exists public.auditoria_numeracao (
  ano     integer primary key,
  ultimo  integer not null
);

-- ── Ajustes de versões anteriores ───────────────────────────────
-- Num banco novo, nada aqui muda coisa alguma. Num banco antigo, troca
-- definições que mudaram (o CREATE TABLE acima não mexe em tabela que já
-- existe) e remove objetos que deixaram de existir.

alter table public.auditoria_retratos add column if not exists contados jsonb;

-- Apagar uma empresa com usuários é recusado (antes os usuários dela
-- passavam a enxergar todas as empresas)
alter table public.usuarios drop constraint if exists usuarios_empresa_id_fkey;
alter table public.usuarios add constraint usuarios_empresa_id_fkey
  foreign key (empresa_id) references public.empresas (id) on delete restrict;

-- Formato do número: quem dá é o gatilho numerar_auditoria. Sem check na
-- tabela: mesmo NOT VALID, ele é conferido em toda atualização e travaria
-- (sem finalizar nem cancelar) uma auditoria antiga com outro formato.
alter table public.auditorias drop constraint if exists auditorias_numero_auditoria_check;
alter table public.auditorias drop constraint if exists auditorias_numero_formato;

-- Índices. Um código de barras aponta para um só produto ativo da empresa
-- (com dois, o leitor não saberia qual contar); uma auditoria em andamento
-- por empresa; um e-mail por pessoa, sem diferença de maiúsculas. Se os
-- dados já tiverem repetição, o índice não é criado e aparece um aviso
-- (NOTICE) dizendo o que corrigir; o permissoes.sql também acusa a falta
-- de cada um dos três.
drop index if exists public.produtos_empresa_barras_idx;
do $$ begin
  create unique index if not exists produtos_barras_unico_idx on public.produtos (empresa_id, codigo_barras)
    where codigo_barras is not null and ativo;
exception when unique_violation then
  raise notice 'AudiStock: há códigos de barras repetidos entre produtos ativos da mesma empresa. Corrija (select empresa_id, codigo_barras, count(*) from produtos where ativo and codigo_barras is not null group by 1, 2 having count(*) > 1) e rode este arquivo de novo.';
end $$;
do $$ begin
  create unique index if not exists auditorias_uma_em_andamento_idx on public.auditorias (empresa_id) where status = 'em_andamento';
exception when unique_violation then
  raise notice 'AudiStock: há empresa com mais de uma auditoria em andamento. Finalize ou cancele as sobrando e rode este arquivo de novo.';
end $$;
do $$ begin
  create unique index if not exists usuarios_email_minusculo_idx on public.usuarios (lower(email));
exception when unique_violation then
  raise notice 'AudiStock: há o mesmo e-mail em dois perfis (com maiúsculas diferentes). Corrija e rode este arquivo de novo.';
end $$;
create index if not exists historico_item_idx on public.auditoria_itens_historico (auditoria_item_id);

-- Objetos de versões anteriores. A trilha de correções era gravável pelo
-- navegador (política historico_criar); a numeração e a contagem antigas
-- ficavam abertas como funções avulsas.
drop policy if exists historico_criar on public.auditoria_itens_historico;
drop function if exists public.gerar_numero_auditoria(uuid);
drop function if exists public.registrar_contagem(uuid, uuid, numeric, text);

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

-- Encerrada: código, nome e unidade como estavam no encerramento (retrato);
-- em andamento: os do cadastro de hoje.
drop view if exists public.vw_relatorio_divergencias;
create view public.vw_relatorio_divergencias with (security_invoker = true) as
select
  i.auditoria_id,
  i.id               as item_id,
  i.produto_id,
  case when r.contados ? i.produto_id::text then r.contados -> i.produto_id::text ->> 'codigo_produto' else p.codigo_produto end as codigo_produto,
  case when r.contados ? i.produto_id::text then r.contados -> i.produto_id::text ->> 'nome_produto'   else p.nome_produto   end as nome_produto,
  case when r.contados ? i.produto_id::text then r.contados -> i.produto_id::text ->> 'unidade_medida' else p.unidade_medida end as unidade_medida,
  i.quantidade_contada,
  i.estoque_sistema,
  i.diferenca,
  case when i.diferenca > 0 then 'sobra' when i.diferenca < 0 then 'falta' else 'ok' end as status_divergencia,
  i.data_registro
from public.auditoria_itens i
join public.produtos p on p.id = i.produto_id
left join public.auditoria_retratos r on r.auditoria_id = i.auditoria_id;

-- Em andamento: os produtos ativos de hoje que ainda não foram contados.
-- Encerrada: o retrato tirado no encerramento (ou o cadastro de hoje, para
-- auditorias encerradas antes de existir o retrato).
drop view if exists public.vw_produtos_nao_auditados;
create view public.vw_produtos_nao_auditados with (security_invoker = true) as
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
-- administradores ao mesmo tempo nunca recebem o mesmo número, e um número
-- de auditoria excluída não volta. Só o gatilho abaixo chama esta função.
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

drop trigger if exists auditorias_numeradas on public.auditorias;
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
--                         (dois envios com o mesmo id esperam um pelo outro)
-- O histórico das mudanças é gravado pelo gatilho itens_historico.
drop function if exists public.registrar_contagem(uuid, uuid, numeric, text, uuid);
create function public.registrar_contagem(
  p_auditoria_id uuid, p_produto_id uuid, p_quantidade numeric,
  p_acao text default 'somar', p_id_cliente uuid default null
) returns public.auditoria_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_anterior numeric;
  v_item     public.auditoria_itens;
begin
  if p_id_cliente is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_id_cliente::text, 0));
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

-- Correção manual com motivo: o motivo segue para o histórico pelo gatilho.
-- Cada recusa tem a sua mensagem.
drop function if exists public.corrigir_contagem(uuid, numeric, text);
create function public.corrigir_contagem(p_item_id uuid, p_quantidade numeric, p_motivo text default null)
returns public.auditoria_itens
language plpgsql security invoker set search_path = public as $$
declare
  v_item   public.auditoria_itens;
  v_status text;
begin
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'Quantidade não pode ser negativa.' using errcode = '22023';
  end if;
  if not public.tem_papel('auditor') then
    raise exception 'Seu perfil não pode corrigir contagens.' using errcode = '42501';
  end if;
  select a.status into v_status
    from public.auditoria_itens i join public.auditorias a on a.id = i.auditoria_id
   where i.id = p_item_id;
  if v_status is null then
    raise exception 'Item não encontrado. Ele pode ter sido excluído, ou é de uma empresa fora do seu acesso.' using errcode = '42501';
  end if;
  if v_status <> 'em_andamento' then
    raise exception 'A auditoria não está em andamento: a contagem não pode mais mudar.' using errcode = '42501';
  end if;
  perform set_config('audistock.motivo', coalesce(nullif(trim(p_motivo), ''), ''), true);
  update public.auditoria_itens set quantidade_contada = p_quantidade where id = p_item_id
  returning * into v_item;
  perform set_config('audistock.motivo', '', true);
  if v_item.id is null then
    raise exception 'A contagem não pode mais mudar.' using errcode = '42501';
  end if;
  return v_item;
end $$;

-- Fechamento: grava o saldo do sistema de todos os itens e finaliza, numa
-- só transação.
--   p_saldos    {item_id: saldo ou null} de cada item que a tela mostrou
--   p_contados  {item_id: quantidade contada que a tela mostrou} (opcional)
-- Recusa com AS002 (detalhe: quantos) se algum item contado não estiver em
-- p_saldos (contado depois que a tela abriu), com AS004 se a quantidade de
-- algum item mudou desde então (recontado: a diferença revisada não vale
-- mais) e com AS003 (detalhe: o status) se a auditoria já não estiver em
-- andamento.
drop function if exists public.finalizar_auditoria(uuid, jsonb);
drop function if exists public.finalizar_auditoria(uuid, jsonb, jsonb);
create function public.finalizar_auditoria(p_auditoria_id uuid, p_saldos jsonb, p_contados jsonb default null)
returns public.auditorias
language plpgsql security invoker set search_path = public as $$
declare
  v_aud     public.auditorias;
  v_status  text;
  v_faltam  integer;
  v_mudaram integer;
begin
  if not public.tem_papel('auditor') then
    raise exception 'Seu perfil não finaliza auditorias.' using errcode = '42501';
  end if;
  select status into v_status from public.auditorias where id = p_auditoria_id;
  if v_status is null then
    raise exception 'Auditoria não encontrada.' using errcode = '42501';
  end if;
  if v_status <> 'em_andamento' then
    raise exception 'A auditoria já foi finalizada ou cancelada.' using errcode = 'AS003', detail = v_status;
  end if;
  -- Travas, nesta ordem: os itens, depois a auditoria. Quem está gravando
  -- uma contagem agora termina antes (e o item novo entra na conferência
  -- abaixo); quem chega depois encontra a auditoria finalizada.
  perform 1 from public.auditoria_itens where auditoria_id = p_auditoria_id for update;
  select * into v_aud from public.auditorias where id = p_auditoria_id for update;
  if v_aud.id is null or v_aud.status <> 'em_andamento' then
    raise exception 'A auditoria já foi finalizada ou cancelada.' using errcode = 'AS003', detail = coalesce(v_aud.status, '');
  end if;
  select count(*) into v_faltam from public.auditoria_itens
   where auditoria_id = p_auditoria_id and not (coalesce(p_saldos, '{}'::jsonb) ? id::text);
  if v_faltam > 0 then
    raise exception 'Há itens contados que a tela de fechamento ainda não mostrava.' using errcode = 'AS002', detail = v_faltam::text;
  end if;
  if p_contados is not null then
    select count(*) into v_mudaram from public.auditoria_itens
     where auditoria_id = p_auditoria_id
       and case when jsonb_typeof(p_contados -> id::text) = 'number'
                then quantidade_contada is distinct from (p_contados ->> id::text)::numeric
                else true end;
    if v_mudaram > 0 then
      raise exception 'Há itens recontados depois que a tela de fechamento abriu.' using errcode = 'AS004', detail = v_mudaram::text;
    end if;
  end if;
  update public.auditoria_itens
     set estoque_sistema = case when jsonb_typeof(p_saldos -> id::text) = 'number' then (p_saldos ->> id::text)::numeric end
   where auditoria_id = p_auditoria_id;
  update public.auditorias set status = 'finalizada' where id = p_auditoria_id
  returning * into v_aud;
  return v_aud;
end $$;

-- Exclusão (só o supremo, pela política auditorias_excluir). Trava os
-- itens antes da auditoria, na mesma ordem da contagem e do fechamento:
-- apagar direto travaria a auditoria primeiro, e uma contagem gravando
-- naquele instante podia terminar em deadlock.
drop function if exists public.excluir_auditoria(uuid);
create function public.excluir_auditoria(p_auditoria_id uuid)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.auditoria_itens where auditoria_id = p_auditoria_id for update;
  delete from public.auditorias where id = p_auditoria_id;
  if not found then
    raise exception 'Auditoria não encontrada, ou o seu perfil não exclui auditorias.' using errcode = '42501';
  end if;
end $$;

-- ── Regras que o RLS sozinho não cobre ──────────────────────────

-- Ninguém muda o próprio perfil de acesso; só o supremo cria ou promove
-- administradores e supremos, e só ele troca e-mails (o e-mail do perfil
-- precisa continuar igual ao do login). Num cadastro, o e-mail do perfil
-- é o do login. Chamadas sem usuário (SQL Editor, chave de serviço)
-- passam livres.
create or replace function public.proteger_usuarios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_login text;
begin
  if tg_op = 'INSERT' or new.email is distinct from old.email then
    new.email := lower(trim(new.email));
  end if;
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    select lower(email) into v_login from auth.users where id = new.id;
    if v_login is not null then new.email := v_login; end if;
  end if;

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

drop trigger if exists usuarios_protegidos on public.usuarios;
create trigger usuarios_protegidos
  before insert or update on public.usuarios
  for each row execute function public.proteger_usuarios();

-- Auditoria nova: autor, situação e horários são do banco (o relógio do
-- computador de quem cria não entra no relatório). Depois: número,
-- empresa, autor e início não mudam; quem finaliza ou cancela, e quando,
-- é gravado pelo banco; o auditor só finaliza, sem mexer no tipo de
-- contagem, nas observações nem no cancelamento.
create or replace function public.proteger_auditorias() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    new.criado_por          := auth.uid();
    new.status              := 'em_andamento';
    new.data_inicio         := now();
    new.criado_em           := now();
    new.data_fim            := null;
    new.cancelado_por       := null;
    new.cancelado_em        := null;
    new.motivo_cancelamento := null;
    return new;
  end if;

  if new.numero_auditoria is distinct from old.numero_auditoria or new.empresa_id is distinct from old.empresa_id
     or new.criado_por is distinct from old.criado_por or new.data_inicio is distinct from old.data_inicio then
    raise exception 'Número, empresa, autor e início da auditoria não podem mudar.' using errcode = '42501';
  end if;
  if not public.tem_papel('administrador') and (
       new.auditoria_cega is distinct from old.auditoria_cega or new.observacoes is distinct from old.observacoes
    or new.motivo_cancelamento is distinct from old.motivo_cancelamento) then
    raise exception 'Seu perfil só pode finalizar a auditoria.' using errcode = '42501';
  end if;

  new.criado_em := old.criado_em;
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

drop trigger if exists auditorias_protegidas on public.auditorias;
create trigger auditorias_protegidas
  before insert or update on public.auditorias
  for each row execute function public.proteger_auditorias();

-- Ao encerrar, guarda o retrato: os produtos que ficaram sem contar e o
-- código, o nome e a unidade dos contados
create or replace function public.retratar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria_retratos (auditoria_id, total_produtos, nao_contados, contados)
  select new.id, count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', p.id, 'codigo_produto', p.codigo_produto,
           'nome_produto', p.nome_produto, 'unidade_medida', p.unidade_medida) order by p.nome_produto)
           filter (where not exists (select 1 from public.auditoria_itens i where i.auditoria_id = new.id and i.produto_id = p.id)),
         '[]'::jsonb),
         (select coalesce(jsonb_object_agg(c.id::text, jsonb_build_object(
                   'codigo_produto', c.codigo_produto, 'nome_produto', c.nome_produto, 'unidade_medida', c.unidade_medida)), '{}'::jsonb)
            from public.auditoria_itens i join public.produtos c on c.id = i.produto_id
           where i.auditoria_id = new.id)
  from public.produtos p
  where p.empresa_id = new.empresa_id and p.ativo
  on conflict (auditoria_id) do nothing;
  return null;
end $$;

drop trigger if exists auditorias_retratadas on public.auditorias;
create trigger auditorias_retratadas
  after update of status on public.auditorias
  for each row when (old.status = 'em_andamento' and new.status <> 'em_andamento')
  execute function public.retratar_auditoria();

-- Itens contados:
-- * só mudam com a auditoria em andamento (também para a chave de serviço),
--   e a trava na auditoria faz o fechamento esperar quem está gravando;
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

  perform 1 from public.auditorias where id = new.auditoria_id and status = 'em_andamento' for share;
  if not found then
    raise exception 'A auditoria não está em andamento: a contagem não pode mais mudar.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.produtos p join public.auditorias a on a.empresa_id = p.empresa_id
                  where p.id = new.produto_id and a.id = new.auditoria_id) then
    raise exception 'O produto não é da empresa desta auditoria.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists itens_so_em_andamento on public.auditoria_itens;
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

drop trigger if exists itens_historico on public.auditoria_itens;
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
drop policy if exists empresas_ver on public.empresas;
create policy empresas_ver on public.empresas for select to authenticated
  using (public.alcanca_empresa(id));
drop policy if exists empresas_criar on public.empresas;
create policy empresas_criar on public.empresas for insert to authenticated
  with check (public.tem_papel('administrador') and public.minha_empresa() is null);
drop policy if exists empresas_editar on public.empresas;
create policy empresas_editar on public.empresas for update to authenticated
  using (public.tem_papel('administrador') and public.alcanca_empresa(id))
  with check (public.tem_papel('administrador') and public.alcanca_empresa(id)
              and (public.minha_empresa() is null or ativo));

-- Usuários: cada um vê a si e às pessoas do seu alcance (para mostrar
-- "Criada por", "Contado por"); administradores cuidam de auditores e
-- visualizadores da sua empresa; o supremo, de todos.
drop policy if exists usuarios_ver on public.usuarios;
create policy usuarios_ver on public.usuarios for select to authenticated
  using (id = auth.uid() or (public.tem_papel('visualizador')
         and (empresa_id is null or public.alcanca_empresa(empresa_id))));
drop policy if exists usuarios_criar on public.usuarios;
create policy usuarios_criar on public.usuarios for insert to authenticated
  with check (public.tem_papel('supremo') or (public.tem_papel('administrador')
              and role in ('auditor', 'visualizador') and empresa_id is not distinct from coalesce(public.minha_empresa(), empresa_id)));
drop policy if exists usuarios_editar on public.usuarios;
create policy usuarios_editar on public.usuarios for update to authenticated
  using (id = auth.uid() or public.tem_papel('supremo') or (public.tem_papel('administrador')
         and role in ('auditor', 'visualizador') and public.alcanca_empresa(empresa_id)))
  with check (id = auth.uid() or public.tem_papel('supremo') or (public.tem_papel('administrador')
              and role in ('auditor', 'visualizador') and public.alcanca_empresa(empresa_id)));

-- Produtos
drop policy if exists produtos_ver on public.produtos;
create policy produtos_ver on public.produtos for select to authenticated
  using (public.alcanca_empresa(empresa_id));
drop policy if exists produtos_criar on public.produtos;
create policy produtos_criar on public.produtos for insert to authenticated
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id));
drop policy if exists produtos_editar on public.produtos;
create policy produtos_editar on public.produtos for update to authenticated
  using (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id))
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id));

-- Auditorias: administrador cria e cancela; auditor só finaliza;
-- só o supremo exclui.
drop policy if exists auditorias_ver on public.auditorias;
create policy auditorias_ver on public.auditorias for select to authenticated
  using (public.alcanca_empresa(empresa_id));
drop policy if exists auditorias_criar on public.auditorias;
create policy auditorias_criar on public.auditorias for insert to authenticated
  with check (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id)
              and status = 'em_andamento' and criado_por = auth.uid());
drop policy if exists auditorias_editar on public.auditorias;
create policy auditorias_editar on public.auditorias for update to authenticated
  using (status = 'em_andamento' and public.tem_papel('auditor') and public.alcanca_empresa(empresa_id))
  with check (public.alcanca_empresa(empresa_id) and (status in ('em_andamento', 'finalizada')
              or (status = 'cancelada' and public.tem_papel('administrador'))));
drop policy if exists auditorias_excluir on public.auditorias;
create policy auditorias_excluir on public.auditorias for delete to authenticated
  using (public.tem_papel('supremo'));

-- Itens contados
drop policy if exists itens_ver on public.auditoria_itens;
create policy itens_ver on public.auditoria_itens for select to authenticated
  using (exists (select 1 from public.auditorias a where a.id = auditoria_id and public.alcanca_empresa(a.empresa_id)));
drop policy if exists itens_criar on public.auditoria_itens;
create policy itens_criar on public.auditoria_itens for insert to authenticated
  with check (public.tem_papel('auditor') and exists (select 1 from public.auditorias a
              where a.id = auditoria_id and a.status = 'em_andamento' and public.alcanca_empresa(a.empresa_id)));
drop policy if exists itens_editar on public.auditoria_itens;
create policy itens_editar on public.auditoria_itens for update to authenticated
  using (public.tem_papel('auditor') and exists (select 1 from public.auditorias a
         where a.id = auditoria_id and a.status = 'em_andamento' and public.alcanca_empresa(a.empresa_id)))
  with check (public.tem_papel('auditor') and exists (select 1 from public.auditorias a
              where a.id = auditoria_id and a.status = 'em_andamento' and public.alcanca_empresa(a.empresa_id)));

-- Histórico de correções: só leitura (quem grava é o gatilho)
drop policy if exists historico_ver on public.auditoria_itens_historico;
create policy historico_ver on public.auditoria_itens_historico for select to authenticated
  using (exists (select 1 from public.auditoria_itens i join public.auditorias a on a.id = i.auditoria_id
                 where i.id = auditoria_item_id and public.alcanca_empresa(a.empresa_id)));

-- Envios de contagem já aplicados (usado pela função registrar_contagem):
-- cada um só vê e grava os da própria empresa
drop policy if exists envios_ver on public.contagens_aplicadas;
create policy envios_ver on public.contagens_aplicadas for select to authenticated
  using (public.tem_papel('auditor') and exists (select 1 from public.auditoria_itens i join public.auditorias a on a.id = i.auditoria_id
         where i.id = auditoria_item_id and public.alcanca_empresa(a.empresa_id)));
drop policy if exists envios_criar on public.contagens_aplicadas;
create policy envios_criar on public.contagens_aplicadas for insert to authenticated
  with check (public.tem_papel('auditor') and exists (select 1 from public.auditoria_itens i join public.auditorias a on a.id = i.auditoria_id
              where i.id = auditoria_item_id and public.alcanca_empresa(a.empresa_id)));

-- Retratos: leitura de quem vê a auditoria (quem grava é o gatilho)
drop policy if exists retratos_ver on public.auditoria_retratos;
create policy retratos_ver on public.auditoria_retratos for select to authenticated
  using (exists (select 1 from public.auditorias a where a.id = auditoria_id and public.alcanca_empresa(a.empresa_id)));

-- Registros de exclusão e de importação
drop policy if exists exclusoes_ver on public.auditoria_exclusoes_log;
create policy exclusoes_ver on public.auditoria_exclusoes_log for select to authenticated
  using (public.tem_papel('supremo'));
drop policy if exists exclusoes_criar on public.auditoria_exclusoes_log;
create policy exclusoes_criar on public.auditoria_exclusoes_log for insert to authenticated
  with check (public.tem_papel('supremo') and excluido_por = auth.uid());
drop policy if exists importacoes_ver on public.importacoes_produtos;
create policy importacoes_ver on public.importacoes_produtos for select to authenticated
  using (public.tem_papel('administrador') and public.alcanca_empresa(empresa_id));
drop policy if exists importacoes_criar on public.importacoes_produtos;
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
revoke all on function public.registrar_contagem(uuid, uuid, numeric, text, uuid), public.corrigir_contagem(uuid, numeric, text),
  public.finalizar_auditoria(uuid, jsonb, jsonb), public.excluir_auditoria(uuid)
  from anon, public;
grant execute on function public.registrar_contagem(uuid, uuid, numeric, text, uuid), public.corrigir_contagem(uuid, numeric, text),
  public.finalizar_auditoria(uuid, jsonb, jsonb), public.excluir_auditoria(uuid)
  to authenticated;
