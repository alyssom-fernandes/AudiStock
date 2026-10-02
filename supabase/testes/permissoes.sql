-- ================================================================
--  AudiStock — supabase/testes/permissoes.sql
--  Confere as permissões (RLS) entrando como cada perfil.
--
--  Como usar: cole o arquivo inteiro no SQL Editor do Supabase e rode.
--  Ele cria empresas, usuários e auditorias de teste (com "teste" no
--  nome), faz as verificações, apaga tudo o que criou e mostra uma
--  tabela com o resultado de cada verificação. Se algo der errado no
--  meio, a transação é desfeita e nada fica gravado.
--
--  Os testes automáticos (npm test) rodam este mesmo arquivo num
--  Postgres local, sobre supabase/schema.sql.
-- ================================================================

create temp table if not exists resultado (
  n           serial primary key,
  verificacao text not null,
  passou      boolean not null,
  detalhe     text
);
truncate resultado;

begin;

-- ── Ferramentas do teste (apagadas no fim) ──────────────────────
create schema teste_audistock;

-- Passa a agir como o usuário dado (null = sem login)
create function teste_audistock.como(p_usuario uuid) returns void language plpgsql as $$
begin
  if p_usuario is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- Volta a ser o dono do banco e anota o resultado
create function teste_audistock.anotar(p_verificacao text, p_passou boolean, p_detalhe text default null) returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  insert into resultado (verificacao, passou, detalhe) values (p_verificacao, p_passou, p_detalhe);
end $$;

grant usage on schema teste_audistock to authenticated, anon;
grant execute on all functions in schema teste_audistock to authenticated, anon;

-- ── Dados de teste (como dono do banco, sem RLS) ────────────────
insert into auth.users (id, email) values
  ('0a000000-0000-4000-8000-000000000001', 'teste-supremo@audistock.test'),
  ('0a000000-0000-4000-8000-000000000002', 'teste-admin-a@audistock.test'),
  ('0a000000-0000-4000-8000-000000000003', 'teste-auditor-a@audistock.test'),
  ('0a000000-0000-4000-8000-000000000004', 'teste-visual-a@audistock.test'),
  ('0a000000-0000-4000-8000-000000000005', 'teste-auditor-b@audistock.test'),
  ('0a000000-0000-4000-8000-000000000006', 'teste-inativo-a@audistock.test'),
  ('0a000000-0000-4000-8000-000000000007', 'teste-novo-1@audistock.test'),
  ('0a000000-0000-4000-8000-000000000008', 'teste-novo-2@audistock.test');

insert into public.empresas (id, nome) values
  ('0e000000-0000-4000-8000-0000000000a1', 'Teste Empresa A'),
  ('0e000000-0000-4000-8000-0000000000b1', 'Teste Empresa B');

insert into public.usuarios (id, nome, email, role, empresa_id, ativo) values
  ('0a000000-0000-4000-8000-000000000001', 'Teste Supremo',      'teste-supremo@audistock.test',   'supremo',       null,                                   true),
  ('0a000000-0000-4000-8000-000000000002', 'Teste Admin A',      'teste-admin-a@audistock.test',   'administrador', '0e000000-0000-4000-8000-0000000000a1', true),
  ('0a000000-0000-4000-8000-000000000003', 'Teste Auditor A',    'teste-auditor-a@audistock.test', 'auditor',       '0e000000-0000-4000-8000-0000000000a1', true),
  ('0a000000-0000-4000-8000-000000000004', 'Teste Visual A',     'teste-visual-a@audistock.test',  'visualizador',  '0e000000-0000-4000-8000-0000000000a1', true),
  ('0a000000-0000-4000-8000-000000000005', 'Teste Auditor B',    'teste-auditor-b@audistock.test', 'auditor',       '0e000000-0000-4000-8000-0000000000b1', true),
  ('0a000000-0000-4000-8000-000000000006', 'Teste Inativo A',    'teste-inativo-a@audistock.test', 'auditor',       '0e000000-0000-4000-8000-0000000000a1', false);

insert into public.produtos (id, empresa_id, codigo_produto, nome_produto, unidade_medida) values
  ('0b000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-0000000000a1', 'TESTE-A1', 'Produto teste A1', 'UN'),
  ('0b000000-0000-4000-8000-000000000002', '0e000000-0000-4000-8000-0000000000a1', 'TESTE-A2', 'Produto teste A2', 'KG'),
  ('0b000000-0000-4000-8000-000000000003', '0e000000-0000-4000-8000-0000000000b1', 'TESTE-B1', 'Produto teste B1', 'UN');

-- Uma auditoria finalizada da A (contada antes de finalizar), uma em andamento da A e uma da B
insert into public.auditorias (id, numero_auditoria, empresa_id, criado_por, status) values
  ('0c000000-0000-4000-8000-000000000001', 'TESTE-0001', '0e000000-0000-4000-8000-0000000000a1', '0a000000-0000-4000-8000-000000000002', 'em_andamento');
insert into public.auditoria_itens (id, auditoria_id, produto_id, quantidade_contada, estoque_sistema, registrado_por) values
  ('0d000000-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000001', 10, 12, '0a000000-0000-4000-8000-000000000003');
update public.auditorias set status = 'finalizada', data_fim = now() where id = '0c000000-0000-4000-8000-000000000001';
insert into public.auditorias (id, numero_auditoria, empresa_id, criado_por, status) values
  ('0c000000-0000-4000-8000-000000000002', 'TESTE-0002', '0e000000-0000-4000-8000-0000000000a1', '0a000000-0000-4000-8000-000000000002', 'em_andamento'),
  ('0c000000-0000-4000-8000-000000000003', 'TESTE-0003', '0e000000-0000-4000-8000-0000000000b1', '0a000000-0000-4000-8000-000000000001', 'em_andamento');
insert into public.auditoria_itens (auditoria_id, produto_id, quantidade_contada, registrado_por) values
  ('0c000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000003', 7, '0a000000-0000-4000-8000-000000000005');

-- ── O que cada perfil enxerga ───────────────────────────────────
do $$ declare n int; negado boolean := false; begin
  begin
    perform teste_audistock.como(null);
    select count(*) into n from public.auditorias;
  exception when others then negado := true;
  end;
  perform teste_audistock.anotar('Sem login não se vê nenhuma auditoria', negado or n = 0, case when negado then 'acesso negado' else n || ' visíveis' end);
end $$;

do $$ declare a int; b int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000004');
  select count(*) filter (where empresa_id = '0e000000-0000-4000-8000-0000000000a1'),
         count(*) filter (where empresa_id = '0e000000-0000-4000-8000-0000000000b1') into a, b from public.produtos;
  perform teste_audistock.anotar('Visualizador da A vê os produtos da A e nenhum da B', a = 2 and b = 0, a || ' da A, ' || b || ' da B');
end $$;

do $$ declare n int; r int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000005');
  select count(*) into n from public.auditorias where empresa_id = '0e000000-0000-4000-8000-0000000000a1';
  select count(*) into r from public.vw_relatorio_divergencias where auditoria_id = '0c000000-0000-4000-8000-000000000001';
  perform teste_audistock.anotar('Auditor da B não vê auditorias nem relatório da A', n = 0 and r = 0, n || ' auditorias, ' || r || ' linhas de relatório');
end $$;

do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000001');
  select count(*) into n from public.auditorias where numero_auditoria like 'TESTE-%';
  perform teste_audistock.anotar('Supremo vê as auditorias das duas empresas', n = 3, n || ' visíveis');
end $$;

do $$ declare n int; eu int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000006');
  select count(*) into n from public.auditorias where numero_auditoria like 'TESTE-%';
  select count(*) into eu from public.usuarios where id = '0a000000-0000-4000-8000-000000000006';
  perform teste_audistock.anotar('Usuário desativado não vê auditorias, só o próprio cadastro', n = 0 and eu = 1, n || ' auditorias, ' || eu || ' cadastro');
end $$;

do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
  select count(*) into n from public.usuarios where nome like 'Teste %';
  perform teste_audistock.anotar('Auditor da A vê os colegas da A e o supremo (para "Criada por"), não os da B', n = 5, n || ' visíveis');
end $$;

-- ── Contagem ────────────────────────────────────────────────────
do $$ declare q numeric; h int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
  perform public.registrar_contagem('0c000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000002', 3, 'somar');
  perform public.registrar_contagem('0c000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000002', 2.5, 'somar');
  select i.quantidade_contada, (select count(*) from public.auditoria_itens_historico x where x.auditoria_item_id = i.id)
    into q, h from public.auditoria_itens i
   where i.auditoria_id = '0c000000-0000-4000-8000-000000000002' and i.produto_id = '0b000000-0000-4000-8000-000000000002';
  perform teste_audistock.anotar('Auditor da A soma contagens na auditoria em andamento, com histórico', q = 5.5 and h = 1, 'quantidade ' || q || ', ' || h || ' registro no histórico');
end $$;

do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
    perform public.registrar_contagem('0c000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-000000000002', 1, 'somar');
    perform teste_audistock.anotar('Auditor não conta em auditoria finalizada', false, 'foi aceito');
  exception when others then
    perform teste_audistock.anotar('Auditor não conta em auditoria finalizada', true, sqlerrm);
  end;
end $$;

do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
    perform public.registrar_contagem('0c000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000003', 1, 'somar');
    perform teste_audistock.anotar('Auditor da A não conta na auditoria da B', false, 'foi aceito');
  exception when others then
    perform teste_audistock.anotar('Auditor da A não conta na auditoria da B', true, sqlerrm);
  end;
end $$;

do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000004');
    perform public.registrar_contagem('0c000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000001', 1, 'somar');
    perform teste_audistock.anotar('Visualizador não registra contagem', false, 'foi aceito');
  exception when others then
    perform teste_audistock.anotar('Visualizador não registra contagem', true, sqlerrm);
  end;
end $$;

do $$ declare n int := 0; negado boolean := false; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
    update public.auditoria_itens set quantidade_contada = 999 where id = '0d000000-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
  exception when others then negado := true; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('Contagem de auditoria finalizada não muda', negado or n = 0, coalesce(msg, n || ' linhas alteradas'));
end $$;

-- ── Auditorias ──────────────────────────────────────────────────
do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
    insert into public.auditorias (numero_auditoria, empresa_id, criado_por) values
      ('TESTE-9001', '0e000000-0000-4000-8000-0000000000b1', '0a000000-0000-4000-8000-000000000003');
    perform teste_audistock.anotar('Auditor não cria auditoria', false, 'foi aceito');
  exception when others then
    perform teste_audistock.anotar('Auditor não cria auditoria', true, sqlerrm);
  end;
end $$;

do $$ declare n int := 0; negado boolean := false; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
    update public.auditorias set status = 'cancelada' where id = '0c000000-0000-4000-8000-000000000002';
    get diagnostics n = row_count;
  exception when others then negado := true; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('Auditor não cancela auditoria', negado or n = 0, coalesce(msg, n || ' linhas alteradas'));
end $$;

do $$ declare n int := 0; negado boolean := false; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    update public.auditorias set status = 'cancelada' where id = '0c000000-0000-4000-8000-000000000003';
    get diagnostics n = row_count;
  exception when others then negado := true; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('Administrador da A não cancela auditoria da B', negado or n = 0, coalesce(msg, n || ' linhas alteradas'));
end $$;

do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000005');
  update public.auditorias set status = 'finalizada' where id = '0c000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  perform teste_audistock.anotar('Auditor da B finaliza a auditoria da B', n = 1, n || ' linha alterada');
end $$;

do $$ declare n int := 0; negado boolean := false; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    update public.auditorias set empresa_id = '0e000000-0000-4000-8000-0000000000b1' where id = '0c000000-0000-4000-8000-000000000002';
    get diagnostics n = row_count;
  exception when others then negado := true; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('A empresa de uma auditoria não muda', negado or n = 0, coalesce(msg, n || ' linhas alteradas'));
end $$;

do $$ declare n int; c uuid; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
  update public.auditorias set status = 'cancelada', motivo_cancelamento = 'teste' where id = '0c000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  select cancelado_por into c from public.auditorias where id = '0c000000-0000-4000-8000-000000000002';
  perform teste_audistock.anotar('Administrador da A cancela auditoria da A e fica registrado como quem cancelou',
    n = 1 and c = '0a000000-0000-4000-8000-000000000002', n || ' linha alterada');
end $$;

do $$ declare ok boolean := true; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    insert into public.auditorias (numero_auditoria, empresa_id, criado_por) values
      ('TESTE-0004', '0e000000-0000-4000-8000-0000000000a1', '0a000000-0000-4000-8000-000000000002');
  exception when others then ok := false; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('Administrador da A inicia auditoria na A', ok, coalesce(msg, 'aceito'));
end $$;

do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
  delete from public.auditorias where id = '0c000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  perform teste_audistock.anotar('Administrador não exclui auditoria', n = 0, n || ' excluídas');
end $$;

do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000001');
  delete from public.auditorias where id = '0c000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  perform teste_audistock.anotar('Supremo exclui auditoria (e os itens vão junto)', n = 1
    and not exists (select 1 from public.auditoria_itens where id = '0d000000-0000-4000-8000-000000000001'), n || ' excluída');
end $$;

-- ── Usuários ────────────────────────────────────────────────────
do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
    update public.usuarios set role = 'supremo' where id = '0a000000-0000-4000-8000-000000000003';
    perform teste_audistock.anotar('Ninguém promove a si mesmo', not exists (select 1 from public.usuarios
      where id = '0a000000-0000-4000-8000-000000000003' and role = 'supremo'), 'nenhum erro; papel conferido');
  exception when others then
    perform teste_audistock.anotar('Ninguém promove a si mesmo', true, sqlerrm);
  end;
end $$;

do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
  update public.usuarios set nome = 'Teste Auditor A (renomeado)', ultimo_acesso = now() where id = '0a000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  perform teste_audistock.anotar('Cada um altera o próprio nome', n = 1, n || ' linha alterada');
end $$;

do $$ declare ok boolean := true; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    insert into public.usuarios (id, nome, email, role, empresa_id) values
      ('0a000000-0000-4000-8000-000000000007', 'Teste Novo 1', 'teste-novo-1@audistock.test', 'auditor', '0e000000-0000-4000-8000-0000000000a1');
  exception when others then ok := false; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('Administrador da A cadastra auditor na A', ok, coalesce(msg, 'aceito'));
end $$;

do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    insert into public.usuarios (id, nome, email, role, empresa_id) values
      ('0a000000-0000-4000-8000-000000000008', 'Teste Novo 2', 'teste-novo-2@audistock.test', 'administrador', '0e000000-0000-4000-8000-0000000000a1');
    perform teste_audistock.anotar('Administrador não cadastra outro administrador', false, 'foi aceito');
  exception when others then
    perform teste_audistock.anotar('Administrador não cadastra outro administrador', true, sqlerrm);
  end;
end $$;

do $$ begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    insert into public.usuarios (id, nome, email, role, empresa_id) values
      ('0a000000-0000-4000-8000-000000000008', 'Teste Novo 2', 'teste-novo-2@audistock.test', 'auditor', '0e000000-0000-4000-8000-0000000000b1');
    perform teste_audistock.anotar('Administrador da A não cadastra usuário na B', false, 'foi aceito');
  exception when others then
    perform teste_audistock.anotar('Administrador da A não cadastra usuário na B', true, sqlerrm);
  end;
end $$;

do $$ declare n int := 0; negado boolean := false; msg text; begin
  begin
    perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
    update public.usuarios set role = 'administrador' where id = '0a000000-0000-4000-8000-000000000003';
    get diagnostics n = row_count;
  exception when others then negado := true; msg := sqlerrm;
  end;
  perform teste_audistock.anotar('Administrador não promove auditor a administrador', negado or n = 0, coalesce(msg, n || ' linhas alteradas'));
end $$;

-- ── Produtos ────────────────────────────────────────────────────
do $$ declare n int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000003');
  update public.produtos set nome_produto = 'alterado' where id = '0b000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  perform teste_audistock.anotar('Auditor não altera produtos', n = 0, n || ' linhas alteradas');
end $$;

do $$ declare a int; b int; begin
  perform teste_audistock.como('0a000000-0000-4000-8000-000000000002');
  update public.produtos set observacoes = 'teste' where id = '0b000000-0000-4000-8000-000000000001';
  get diagnostics a = row_count;
  update public.produtos set observacoes = 'teste' where id = '0b000000-0000-4000-8000-000000000003';
  get diagnostics b = row_count;
  perform teste_audistock.anotar('Administrador da A altera produto da A e não o da B', a = 1 and b = 0, a || ' da A, ' || b || ' da B');
end $$;

-- ── Limpeza: apaga tudo o que o teste criou ─────────────────────
delete from public.auditoria_exclusoes_log where empresa_id in ('0e000000-0000-4000-8000-0000000000a1', '0e000000-0000-4000-8000-0000000000b1');
delete from public.importacoes_produtos where empresa_id in ('0e000000-0000-4000-8000-0000000000a1', '0e000000-0000-4000-8000-0000000000b1');
delete from public.auditorias where empresa_id in ('0e000000-0000-4000-8000-0000000000a1', '0e000000-0000-4000-8000-0000000000b1');
delete from public.produtos where empresa_id in ('0e000000-0000-4000-8000-0000000000a1', '0e000000-0000-4000-8000-0000000000b1');
delete from auth.users where email like 'teste-%@audistock.test';
delete from public.empresas where id in ('0e000000-0000-4000-8000-0000000000a1', '0e000000-0000-4000-8000-0000000000b1');
drop schema teste_audistock cascade;

commit;

select n, verificacao, case when passou then 'ok' else 'FALHOU' end as resultado, detalhe
from resultado order by n;
