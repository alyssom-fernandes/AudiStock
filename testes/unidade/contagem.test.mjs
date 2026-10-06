// Registro da contagem e fechamento no banco da demonstração: o app usa as
// funções atômicas registrar_contagem e finalizar_auditoria (a concorrência
// de verdade, no Postgres, é conferida com dois aparelhos: veja
// docs/teste-real.md), o histórico, a recusa em auditoria fechada e o envio
// repetido da fila sem internet.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { registrarContagem, editarContagem, historicoItem, buscarItemContado, preencherEstoquesSistema, listarItensContados, finalizarComSaldos,
        aplicarRetrato, JA_CONTADO, ITENS_NOVOS, JA_ENCERRADA, RECONTADOS } = await import('../../js/contagem.js');
const { excluirAuditoria } = await import('../../js/auditorias.js');
const { ehFalhaPassageira } = await import('../../js/offline.js');
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

test('o fechamento em etapas grava os saldos de todos os itens, no máximo 8 ao mesmo tempo', async () => {
  const aud = auditoria('0008');
  const { data: itens } = await listarItensContados(aud.id);
  // Conta quantas gravações estão no ar ao mesmo tempo
  const original = supabase.from;
  let noAr = 0, pico = 0;
  supabase.from = tabela => {
    const q = original.call(supabase, tabela);
    if (tabela !== 'auditoria_itens') return q;
    const then = q.then.bind(q);
    q.then = (ok, falha) => { noAr++; pico = Math.max(pico, noAr); return then(r => { noAr--; return ok(r); }, falha); };
    return q;
  };
  let r;
  try { r = await preencherEstoquesSistema(aud.id, itens.map((i, n) => ({ produto_id: i.produto_id, quantidade: n + 1 }))); }
  finally { supabase.from = original; }
  assert.deepEqual(r, { ok: itens.length, erros: 0 });
  assert.ok(pico > 1 && pico <= 8, `pico de ${pico} gravações`);
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

test('finalizar grava os saldos e encerra junto; recusa item contado depois que a tela abriu', async () => {
  const aud = auditoria('0007');
  const { data: itens } = await listarItensContados(aud.id);
  const saldos = Object.fromEntries(itens.map((i, n) => [i.id, n === 0 ? null : 10]));
  // Outro aparelho conta um produto que a tela não mostrava
  const [p] = produtoNaoContado(aud);
  await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 1, usuarioId: ID_USUARIO_DEMO, acao: 'somar' });
  const recusa = await finalizarComSaldos(aud.id, saldos).catch(e => e);
  assert.equal(recusa.code, ITENS_NOVOS);
  assert.equal(recusa.details, '1');
  assert.equal(auditoria('0007').status, 'em_andamento', 'nada foi finalizado');
  assert.ok(banco().auditoria_itens.filter(i => i.auditoria_id === aud.id).every(i => i.estoque_sistema == null), 'nenhum saldo foi gravado');

  const { data: atuais } = await listarItensContados(aud.id);
  await finalizarComSaldos(aud.id, Object.fromEntries(atuais.map(i => [i.id, i.id === itens[0].id ? null : 10])));
  assert.equal(auditoria('0007').status, 'finalizada');
  const gravados = banco().auditoria_itens.filter(i => i.auditoria_id === aud.id);
  assert.equal(gravados.find(i => i.id === itens[0].id).estoque_sistema, null, 'o saldo apagado fica vazio');
  assert.ok(gravados.filter(i => i.id !== itens[0].id).every(i => i.estoque_sistema === 10));

  const de_novo = await finalizarComSaldos(aud.id, {}).catch(e => e);
  assert.equal(de_novo.code, JA_ENCERRADA);
});

test('finalizar recusa item recontado depois que a tela abriu: a diferença revisada não vale mais', async () => {
  const aud = auditoria('0008');
  const { data: itens } = await listarItensContados(aud.id);
  const saldos = Object.fromEntries(itens.map(i => [i.id, 10]));
  const contados = Object.fromEntries(itens.map(i => [i.id, Number(i.quantidade_contada)]));
  // Outro aparelho soma num item que a tela já mostrava
  await registrarContagem({ auditoriaId: aud.id, produtoId: itens[0].produto_id, quantidade: 30, usuarioId: ID_USUARIO_DEMO, acao: 'somar' });
  const recusa = await finalizarComSaldos(aud.id, saldos, contados).catch(e => e);
  assert.equal(recusa.code, RECONTADOS);
  assert.equal(recusa.details, '1');
  assert.equal(auditoria('0008').status, 'em_andamento');
  // Com o contado de agora, finaliza; o relatório guarda o nome do encerramento
  const { data: atuais } = await listarItensContados(aud.id);
  await finalizarComSaldos(aud.id, saldos, Object.fromEntries(atuais.map(i => [i.id, Number(i.quantidade_contada)])));
  assert.equal(auditoria('0008').status, 'finalizada');
  await supabase.from('produtos').update({ nome_produto: 'Renomeado depois' }).eq('id', itens[0].produto_id);
  const { data: depois } = await listarItensContados(aud.id);
  await aplicarRetrato(aud.id, depois);
  assert.notEqual(depois.find(i => i.id === itens[0].id).produtos.nome_produto, 'Renomeado depois', 'os detalhes mostram o nome do encerramento');
});

test('o supremo exclui a auditoria pela função, e os itens vão junto', async () => {
  const aud = auditoria('0008');
  await excluirAuditoria(aud.id, ID_USUARIO_DEMO);
  assert.equal(banco().auditorias.some(a => a.id === aud.id), false);
  assert.equal(banco().auditoria_itens.some(i => i.auditoria_id === aud.id), false);
  assert.equal(banco().auditoria_exclusoes_log.at(-1).auditoria_id, aud.id, 'com o registro da exclusão');
});

// O comportamento da fila com essas falhas está em fila.test.mjs
test('classificação das falhas da fila: o que é passageiro (espera) e o que é recusa do banco', () => {
  assert.ok(ehFalhaPassageira(new TypeError('Failed to fetch')));
  assert.ok(ehFalhaPassageira({ message: 'erro', status: 503 }));
  assert.ok(ehFalhaPassageira({ message: 'erro', status: 429 }));
  assert.ok(ehFalhaPassageira({ code: 'PGRST301', message: 'JWT expired' }));
  assert.ok(ehFalhaPassageira({ message: 'Unexpected token < in JSON at position 0' }));
  assert.ok(ehFalhaPassageira({ code: '42501', status: 401, message: 'permission denied for function registrar_contagem' }), 'sessão perdida espera o login');
  assert.equal(ehFalhaPassageira({ code: '22003', status: 400, message: 'numeric field overflow' }), false);
  assert.equal(ehFalhaPassageira({ code: '42501', status: 403, message: 'new row violates row-level security policy' }), false);
  assert.equal(ehFalhaPassageira({ code: '23514', message: 'violates check constraint' }), false);
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
