// Registro da contagem no banco da demonstração: o app usa a função
// atômica registrar_contagem (a trava de verdade fica no Postgres e é
// conferida em testes/banco), o histórico, a recusa em auditoria
// fechada e o envio repetido da fila sem internet.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { registrarContagem, editarContagem, historicoItem, buscarItemContado, preencherEstoquesSistema, listarItensContados, JA_CONTADO } = await import('../../js/contagem.js');
const { ID_USUARIO_DEMO } = await import('../../js/demo.js');

const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const auditoria = numero => banco().auditorias.find(a => a.numero_auditoria.endsWith(numero));
const produtoNaoContado = aud => {
  const t = banco(), contados = new Set(t.auditoria_itens.filter(i => i.auditoria_id === aud.id).map(i => i.produto_id));
  return t.produtos.filter(p => p.empresa_id === aud.empresa_id && p.ativo && !contados.has(p.id));
};

test('vinte leituras do leitor ao mesmo tempo somam vinte (nenhuma se perde)', async () => {
  const aud = auditoria('0007'), [p] = produtoNaoContado(aud);
  await Promise.all(Array.from({ length: 20 }, () =>
    registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 1, usuarioId: ID_USUARIO_DEMO, acao: 'somar' })));
  const item = await buscarItemContado(aud.id, p.id);
  assert.equal(Number(item.quantidade_contada), 20);
  const hist = await historicoItem(item.id);
  assert.equal(hist.length, 19, 'a 1ª leitura cria o item; as outras 19 ficam no histórico');
});

test('substituir troca o valor e registra o anterior no histórico', async () => {
  const aud = auditoria('0007'), [, p] = produtoNaoContado(aud);
  await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 7, usuarioId: ID_USUARIO_DEMO, acao: 'novo' });
  const item = await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 3.5, usuarioId: ID_USUARIO_DEMO, acao: 'sobrescrever' });
  assert.equal(Number(item.quantidade_contada), 3.5);
  const [ultima] = await historicoItem(item.id);
  assert.deepEqual([Number(ultima.quantidade_anterior), Number(ultima.quantidade_nova)], [7, 3.5]);
});

test('correção manual grava o motivo', async () => {
  const aud = auditoria('0007'), [, , p] = produtoNaoContado(aud);
  const item = await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 10, usuarioId: ID_USUARIO_DEMO, acao: 'novo' });
  await editarContagem(item.id, 12, ID_USUARIO_DEMO, '  recontagem do corredor 3 ');
  const [h] = await historicoItem(item.id);
  assert.equal(h.motivo, 'recontagem do corredor 3');
  assert.equal(Number((await buscarItemContado(aud.id, p.id)).quantidade_contada), 12);
});

test('não registra contagem em auditoria finalizada nem quantidade negativa', async () => {
  const fin = auditoria('0006'), [p] = produtoNaoContado(fin);
  await assert.rejects(registrarContagem({ auditoriaId: fin.id, produtoId: p.id, quantidade: 1, usuarioId: ID_USUARIO_DEMO, acao: 'somar' }), /não está em andamento/);
  const aud = auditoria('0007'), [q] = produtoNaoContado(aud);
  await assert.rejects(registrarContagem({ auditoriaId: aud.id, produtoId: q.id, quantidade: -1, usuarioId: ID_USUARIO_DEMO }), /negativa/);
});

test('o fechamento grava os saldos de todos os itens, em grupos', async () => {
  const aud = auditoria('0008');
  const { data: itens } = await listarItensContados(aud.id);
  const r = await preencherEstoquesSistema(aud.id, itens.map((i, n) => ({ produto_id: i.produto_id, quantidade: n + 1 })));
  assert.deepEqual(r, { ok: itens.length, erros: 0 });
  const depois = banco().auditoria_itens.filter(i => i.auditoria_id === aud.id);
  assert.ok(depois.every(i => i.estoque_sistema != null && i.diferenca === Math.round((i.quantidade_contada - i.estoque_sistema) * 1000) / 1000));
});

test("'novo' num produto já contado não substitui: o banco devolve a quantidade atual", async () => {
  const aud = auditoria('0007'), [, , , p] = produtoNaoContado(aud);
  await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 4, usuarioId: ID_USUARIO_DEMO, acao: 'novo' });
  const erro = await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 9, usuarioId: ID_USUARIO_DEMO, acao: 'novo' }).catch(e => e);
  assert.equal(erro.code, JA_CONTADO);
  assert.equal(Number(erro.details), 4);
  assert.equal(Number((await buscarItemContado(aud.id, p.id)).quantidade_contada), 4);
});

test('o mesmo envio (id_cliente) repetido conta uma vez só', async () => {
  const aud = auditoria('0007'), [, , , , p] = produtoNaoContado(aud);
  const idCliente = 'c0ffee00-0000-4000-8000-000000000001';
  const envio = () => registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 2, usuarioId: ID_USUARIO_DEMO, acao: 'somar', idCliente });
  await envio(); await envio(); await envio();
  assert.equal(Number((await buscarItemContado(aud.id, p.id)).quantidade_contada), 2);
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
