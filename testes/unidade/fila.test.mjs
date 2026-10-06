// A fila sem internet (js/offline.js), sobre um IndexedDB em memória: o
// que segura a fila e o que não segura, a ordem do envio, o descarte no
// meio do envio, a sessão perdida, o motivo da recusa em português e uma
// fila por aba na demonstração.
import './ambiente.mjs';
import { bancosDoAparelho } from './indexeddb.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { requireAuth } = await import('../../js/auth.js');
await requireAuth();
const { default: supabase } = await import('../../js/supabaseClient.js');
const { registrarOffline, sincronizar, listarFila, descartarRegistro, motivoRecusa } = await import('../../js/offline.js');
const { filaDaDemo, ID_USUARIO_DEMO } = await import('../../js/demo.js');

const OUTRA_PESSOA = '00000000-0000-4000-8000-0000000000ff';
const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const aud = banco().auditorias.find(a => a.numero_auditoria.endsWith('0007'));
const livres = () => {
  const contados = new Set(banco().auditoria_itens.filter(i => i.auditoria_id === aud.id).map(i => i.produto_id));
  return banco().produtos.filter(p => p.empresa_id === aud.empresa_id && p.ativo && !contados.has(p.id));
};
const qtd = produtoId => banco().auditoria_itens.find(i => i.auditoria_id === aud.id && i.produto_id === produtoId)?.quantidade_contada ?? null;
const guardar = (produtoId, quantidade, usuarioId = ID_USUARIO_DEMO) =>
  registrarOffline({ auditoriaId: aud.id, produtoId, quantidade, usuarioId, acao: 'somar' });
const situacao = async () => (await listarFila(aud.id)).map(r => [r.produto_id, r.status]);
const limpar = async () => { for (const r of await listarFila()) await descartarRegistro(r.id); };

// Responde no lugar do banco nos próximos envios (null: o banco responde)
async function comBanco(responder, fn) {
  const original = supabase.rpc;
  let n = 0;
  supabase.rpc = async (nome, args) => (await responder(++n, nome, args)) ?? original(nome, args);
  try { return await fn(); } finally { supabase.rpc = original; }
}
const falha = (status, code, message) => ({ data: null, error: { code, message }, status });

test('uma recusa do banco não segura a fila; uma falha passageira segura o resto, na ordem', async () => {
  await limpar();
  const [a, b, c, d] = livres();
  await guardar(a.id, 1); await guardar(b.id, 2); await guardar(c.id, 3);
  await guardar(d.id, 4, OUTRA_PESSOA);   // espera o login de quem contou
  const r = await comBanco(n => n === 1 ? falha(400, '22003', 'numeric field overflow')
                              : n === 2 ? falha(503, '', 'Service Unavailable') : null,
    () => sincronizar());
  assert.deepEqual([r.ok, r.erros], [0, 1]);
  assert.deepEqual(await situacao(), [[a.id, 'error'], [b.id, 'pending'], [c.id, 'pending'], [d.id, 'pending']]);
  const [recusada] = await listarFila(aud.id);
  assert.equal(recusada.erro, 'Quantidade grande demais.', 'o motivo aparece em português');
  assert.equal(recusada.erro_tecnico, 'numeric field overflow');
  assert.equal(qtd(c.id), null, 'nada sobe depois de uma falha passageira');

  // O servidor volta: sobem b e c, nessa ordem; a de outra pessoa continua
  const r2 = await sincronizar();
  assert.equal(r2.ok, 2);
  assert.deepEqual([qtd(b.id), qtd(c.id), qtd(d.id)], [2, 3, null]);
  assert.deepEqual(await situacao(), [[a.id, 'error'], [d.id, 'pending']]);
});

test('envio que o banco já tinha aplicado (resposta perdida) conta como enviado', async () => {
  await limpar();
  const [a] = livres();
  await guardar(a.id, 1);
  const r = await comBanco(() => falha(409, '23505', 'duplicate key value violates unique constraint "contagens_aplicadas_pkey"'), () => sincronizar());
  assert.deepEqual([r.ok, r.erros], [1, 0]);
  assert.deepEqual(await situacao(), []);
});

test('contagem descartada enquanto a fila sobe não é enviada', async () => {
  await limpar();
  const [a, b] = livres();
  await guardar(a.id, 5);
  const segunda = await guardar(b.id, 12345678);   // o código de barras bipado no campo errado
  await comBanco(async n => { if (n === 1) await descartarRegistro(segunda); return null; }, () => sincronizar());
  assert.deepEqual([qtd(a.id), qtd(b.id)], [5, null]);
  assert.deepEqual(await situacao(), []);
});

test('sessão perdida no meio do envio (401) espera o login, em vez de virar recusa', async () => {
  await limpar();
  const [a, b] = livres();
  await guardar(a.id, 1); await guardar(b.id, 1);
  const r = await comBanco(() => falha(401, '42501', 'permission denied for function registrar_contagem'), () => sincronizar());
  assert.deepEqual([r.ok, r.erros], [0, 0]);
  assert.deepEqual(await situacao(), [[a.id, 'pending'], [b.id, 'pending']]);
  await limpar();
});

test('o motivo da recusa chega em português, sem o texto técnico do banco', () => {
  assert.match(motivoRecusa({ code: '42501', message: 'new row violates row-level security policy for table "auditoria_itens"' }), /^Sem permissão/);
  assert.equal(motivoRecusa({ code: '22003', message: 'numeric field overflow' }), 'Quantidade grande demais.');
  assert.equal(motivoRecusa({ code: '42501', message: 'A auditoria não está em andamento: a contagem não pode mais mudar.' }),
    'A auditoria não está em andamento: a contagem não pode mais mudar.');
});

test('na demonstração, cada aba tem a sua fila', () => {
  const minha = filaDaDemo();
  assert.match(minha, /^audistock-offline-demo-[\w-]+$/);
  assert.ok(bancosDoAparelho().includes(minha), 'é a fila que a página usa');
  const id = sessionStorage.getItem('audistock-demo-aba');
  sessionStorage.setItem('audistock-demo-aba', 'outra-aba');
  try { assert.equal(filaDaDemo(), 'audistock-offline-demo-outra-aba'); }
  finally { sessionStorage.setItem('audistock-demo-aba', id); }
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
