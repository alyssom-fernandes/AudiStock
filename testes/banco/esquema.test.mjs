// ================================================================
//  Esquema do banco num Postgres de verdade (PGlite, sem instalar
//  nada): supabase/schema.sql precisa rodar inteiro, e as permissões
//  de supabase/testes/permissoes.sql precisam passar todas.
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
  assert.equal(rows.length, 42, 'o README cita 42 verificações');
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
