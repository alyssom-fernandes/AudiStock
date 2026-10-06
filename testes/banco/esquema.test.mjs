// ================================================================
//  Esquema do banco num Postgres de verdade (PGlite, sem instalar
//  nada): supabase/schema.sql precisa rodar inteiro (e de novo, num
//  banco que já existe), e as permissões de
//  supabase/testes/permissoes.sql precisam passar todas, inclusive num
//  banco criado pela versão anterior do esquema (esquema-15aac91.sql).
// ================================================================

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const raiz = new URL('../../', import.meta.url);
const ler = caminho => readFile(new URL(caminho, raiz), 'utf8');

// O que o Supabase já traz pronto e o PGlite não: o esquema auth,
// auth.uid() e os papéis anon e authenticated.
const SUPABASE = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth to anon, authenticated;
`;

const VERIFICACOES = 54;
const novoBanco = async () => { const b = new PGlite(); await b.exec(SUPABASE); return b; };
const permissoes = async b => {
  await b.exec(await ler('supabase/testes/permissoes.sql'));
  const { rows } = await b.query('select verificacao, passou, detalhe from resultado order by n');
  return { total: rows.length, falhas: rows.filter(r => !r.passou).map(r => `${r.verificacao} (${r.detalhe})`) };
};

let db;
before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE);
  await db.exec(await ler('supabase/schema.sql'));
});
after(() => db?.close());

test('o esquema cria as tabelas, as visões e as funções que o app usa', async () => {
  const { rows } = await db.query(`
    select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  const nomes = rows.map(r => r.table_name);
  for (const t of ['empresas', 'usuarios', 'produtos', 'auditorias', 'auditoria_itens', 'auditoria_itens_historico',
    'auditoria_exclusoes_log', 'importacoes_produtos', 'vw_relatorio_divergencias', 'vw_produtos_nao_auditados']) {
    assert.ok(nomes.includes(t), `falta ${t}`);
  }
  const { rows: fk } = await db.query(`
    select conname from pg_constraint where conname in
      ('auditorias_criado_por_fkey', 'auditorias_cancelado_por_fkey', 'auditoria_itens_registrado_por_fkey')`);
  assert.equal(fk.length, 3, 'as junções usam esses nomes de chave estrangeira');
});

test('todas as verificações de permissão passam', async () => {
  await db.exec(await ler('supabase/testes/permissoes.sql'));
  const { rows } = await db.query('select verificacao, passou, detalhe from resultado order by n');
  assert.equal(rows.length, VERIFICACOES, `o README cita ${VERIFICACOES} verificações`);
  const falhas = rows.filter(r => !r.passou).map(r => `${r.verificacao} (${r.detalhe})`);
  assert.deepEqual(falhas, []);
  // O script apaga o que criou e devolve o contador da numeração
  const { rows: sobras } = await db.query(`select
    (select count(*)::int from public.empresas where nome like 'Teste Empresa %') as empresas,
    (select count(*)::int from auth.users where email like 'teste-%') as usuarios,
    (select count(*)::int from public.auditoria_numeracao) as contadores`);
  assert.deepEqual(sobras[0], { empresas: 0, usuarios: 0, contadores: 0 });
});

test('a numeração é dada pelo banco, em sequência, e ignora o número enviado', async () => {
  await db.exec(`
    insert into auth.users (id, email) values ('1a000000-0000-4000-8000-000000000001', 'adm@x.test');
    insert into public.empresas (id, nome) values ('1e000000-0000-4000-8000-000000000001', 'Num 1'), ('1e000000-0000-4000-8000-000000000002', 'Num 2'), ('1e000000-0000-4000-8000-000000000003', 'Num 3');
    insert into public.usuarios (id, nome, email, role) values ('1a000000-0000-4000-8000-000000000001', 'Adm', 'adm@x.test', 'administrador');`);
  const numeros = [];
  for (let i = 1; i <= 3; i++) {
    await db.exec(`select set_config('request.jwt.claims', '{"sub":"1a000000-0000-4000-8000-000000000001"}', false); set role authenticated;`);
    const { rows } = await db.query(`insert into public.auditorias (numero_auditoria, empresa_id, criado_por)
      values ('AUD-2099-9999', '1e000000-0000-4000-8000-00000000000${i}', '1a000000-0000-4000-8000-000000000001') returning numero_auditoria as n`);
    await db.exec('reset role');
    numeros.push(rows[0].n);
  }
  await db.exec(`select set_config('request.jwt.claims', '', false)`);
  // O banco usa o ano de Brasília; o Actions roda em UTC
  const ano = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date());
  assert.match(numeros[0], new RegExp(`^AUD-${ano}-\\d{4}$`));
  const seq = numeros.map(n => Number(n.slice(-4)));
  assert.deepEqual(seq, [seq[0], seq[0] + 1, seq[0] + 2]);
});

test('a diferença é calculada pelo banco (contado − sistema)', async () => {
  await db.exec(`
    insert into public.empresas (id, nome) values ('2e000000-0000-4000-8000-000000000001', 'Dif');
    insert into public.produtos (id, empresa_id, codigo_produto, nome_produto) values ('2b000000-0000-4000-8000-000000000001', '2e000000-0000-4000-8000-000000000001', 'D1', 'Dif 1');
    insert into public.auditorias (id, numero_auditoria, empresa_id) values ('2c000000-0000-4000-8000-000000000001', 'AUD-1998-0001', '2e000000-0000-4000-8000-000000000001');
    insert into public.auditoria_itens (auditoria_id, produto_id, quantidade_contada, estoque_sistema)
      values ('2c000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 14.442, 15.73);`);
  const { rows } = await db.query(`select diferenca::text, status_divergencia from public.vw_relatorio_divergencias where auditoria_id = '2c000000-0000-4000-8000-000000000001'`);
  assert.deepEqual(rows[0], { diferenca: '-1.288', status_divergencia: 'falta' });
});

test('o esquema roda de novo num banco que já existe, sem apagar dados', async () => {
  const antes = (await db.query('select count(*)::int as n from public.auditorias')).rows[0].n;
  await db.exec(await ler('supabase/schema.sql'));
  const depois = (await db.query('select count(*)::int as n from public.auditorias')).rows[0].n;
  assert.equal(depois, antes);
  const r = await permissoes(db);
  assert.equal(r.total, VERIFICACOES);
  assert.deepEqual(r.falhas, []);
});

test('um banco da versão anterior (15aac91) é atualizado rodando o esquema, e as permissões passam', async () => {
  const velho = await novoBanco();
  try {
    await velho.exec(await ler('testes/banco/esquema-15aac91.sql'));
    // Dados de antes da atualização: uma auditoria encerrada sem retrato e
    // uma em andamento com número de outro formato
    await velho.exec(`
      insert into public.empresas (id, nome) values ('3e000000-0000-4000-8000-000000000001', 'Antiga');
      insert into public.produtos (id, empresa_id, codigo_produto, nome_produto) values ('3b000000-0000-4000-8000-000000000001', '3e000000-0000-4000-8000-000000000001', 'V1', 'Velho 1');
      insert into public.auditorias (id, numero_auditoria, empresa_id, status) values ('3c000000-0000-4000-8000-000000000001', 'AUD-2025-001', '3e000000-0000-4000-8000-000000000001', 'em_andamento');
      insert into public.auditoria_itens (auditoria_id, produto_id, quantidade_contada, estoque_sistema) values ('3c000000-0000-4000-8000-000000000001', '3b000000-0000-4000-8000-000000000001', 5, 4);
      update public.auditorias set status = 'finalizada' where id = '3c000000-0000-4000-8000-000000000001';
      insert into public.auditorias (id, numero_auditoria, empresa_id, status) values ('3c000000-0000-4000-8000-000000000002', 'AUD-2025-002', '3e000000-0000-4000-8000-000000000001', 'em_andamento');`);
    await velho.exec(await ler('supabase/schema.sql'));
    // A auditoria antiga em andamento ainda pode ser encerrada (sem check de formato que a trave)
    await velho.exec(`update public.auditorias set status = 'cancelada' where id = '3c000000-0000-4000-8000-000000000002'`);

    const r = await permissoes(velho);
    assert.equal(r.total, VERIFICACOES);
    assert.deepEqual(r.falhas, []);
    // O que era da versão anterior e ficaria aberto foi removido
    const { rows } = await velho.query(`select
      (select count(*)::int from pg_policies where policyname = 'historico_criar') as politica,
      (select count(*)::int from pg_proc where proname = 'gerar_numero_auditoria') as numeracao,
      (select count(*)::int from pg_proc where proname = 'registrar_contagem') as contagem,
      (select confdeltype from pg_constraint where conname = 'usuarios_empresa_id_fkey') as fk,
      (select count(*)::int from pg_constraint where conname = 'auditorias_numero_formato') as formato`);
    assert.deepEqual(rows[0], { politica: 0, numeracao: 0, contagem: 1, fk: 'r', formato: 0 });
    // A auditoria antiga continua no relatório
    const { rows: rel } = await velho.query(`select diferenca::text from public.vw_relatorio_divergencias where auditoria_id = '3c000000-0000-4000-8000-000000000001'`);
    assert.deepEqual(rel, [{ diferenca: '1.000' }]);
  } finally { await velho.close(); }
});

test('o relatório de uma auditoria encerrada guarda o nome e a unidade do encerramento', async () => {
  await db.exec(`
    insert into public.empresas (id, nome) values ('4e000000-0000-4000-8000-000000000001', 'Retrato');
    insert into public.produtos (id, empresa_id, codigo_produto, nome_produto, unidade_medida) values ('4b000000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001', 'R1', 'Nome antigo', 'UN');
    insert into public.auditorias (id, numero_auditoria, empresa_id) values ('4c000000-0000-4000-8000-000000000001', 'AUD-1997-0001', '4e000000-0000-4000-8000-000000000001');
    insert into public.auditoria_itens (auditoria_id, produto_id, quantidade_contada, estoque_sistema) values ('4c000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', 2, 2);
    update public.auditorias set status = 'finalizada' where id = '4c000000-0000-4000-8000-000000000001';
    update public.produtos set nome_produto = 'Nome novo', unidade_medida = 'CX' where id = '4b000000-0000-4000-8000-000000000001';`);
  const { rows } = await db.query(`select nome_produto, unidade_medida from public.vw_relatorio_divergencias where auditoria_id = '4c000000-0000-4000-8000-000000000001'`);
  assert.deepEqual(rows[0], { nome_produto: 'Nome antigo', unidade_medida: 'UN' });
});
