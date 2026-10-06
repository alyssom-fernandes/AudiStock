// Banco antigo, sem a função registrar_contagem: o app cai no caminho em
// duas etapas. Fica num arquivo próprio porque, depois da primeira recusa,
// o app não tenta mais a função até recarregar a página.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { registrarContagem, historicoItem, listarItensContados, finalizarComSaldos, ITENS_NOVOS } = await import('../../js/contagem.js');
const { ID_USUARIO_DEMO } = await import('../../js/demo.js');

const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const auditoria = numero => banco().auditorias.find(a => a.numero_auditoria.endsWith(numero));
const produtoNaoContado = aud => {
  const t = banco(), contados = new Set(t.auditoria_itens.filter(i => i.auditoria_id === aud.id).map(i => i.produto_id));
  return t.produtos.filter(p => p.empresa_id === aud.empresa_id && p.ativo && !contados.has(p.id));
};

test('banco sem a função registrar_contagem: cai no caminho em duas etapas', async () => {
  const original = supabase.rpc;
  let tentativas = 0;
  supabase.rpc = async (nome, args) => {
    if (nome === 'registrar_contagem') { tentativas++; return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.registrar_contagem' } }; }
    return original(nome, args);
  };
  const aviso = console.warn;
  console.warn = () => {};   // o aviso esperado não suja a saída do teste
  try {
    const aud = auditoria('0007'), [p] = produtoNaoContado(aud);
    await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 2, usuarioId: ID_USUARIO_DEMO, acao: 'somar' });
    const item = await registrarContagem({ auditoriaId: aud.id, produtoId: p.id, quantidade: 3, usuarioId: ID_USUARIO_DEMO, acao: 'somar' });
    assert.equal(Number(item.quantidade_contada), 5);
    assert.equal(tentativas, 1, 'depois da primeira recusa não tenta a função de novo');
    assert.equal((await historicoItem(item.id)).length, 1);
  } finally { supabase.rpc = original; console.warn = aviso; }
});

test('banco sem a função finalizar_auditoria: confere, grava todos os saldos e finaliza em etapas', async () => {
  const original = supabase.rpc, from = supabase.from;
  supabase.rpc = async (nome, args) => nome === 'finalizar_auditoria'
    ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.finalizar_auditoria' } }
    : original(nome, args);
  const aviso = console.warn;
  console.warn = () => {};
  try {
    const aud = auditoria('0008');
    const { data: itens } = await listarItensContados(aud.id);
    const saldos = Object.fromEntries(itens.map(i => [i.id, 5]));
    // Item que a tela não mostrava: recusa, sem gravar nada
    const sem = { ...saldos }; delete sem[itens[0].id];
    assert.equal((await finalizarComSaldos(aud.id, sem).catch(e => e)).code, ITENS_NOVOS);

    // 1ª tentativa: os saldos gravam, mas a finalização falha (queda de rede)
    supabase.from = tabela => {
      const q = from.call(supabase, tabela);
      if (tabela === 'auditorias') q.update = () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } }) }) }) }) });
      return q;
    };
    await assert.rejects(finalizarComSaldos(aud.id, saldos), /Failed to fetch/);
    supabase.from = from;
    // 2ª: a pessoa apagou um saldo. Ele precisa chegar ao banco como vazio
    await finalizarComSaldos(aud.id, { ...saldos, [itens[0].id]: null });
    const gravado = banco().auditoria_itens.find(i => i.id === itens[0].id);
    assert.equal(gravado.estoque_sistema, null);
    assert.equal(auditoria('0008').status, 'finalizada');
  } finally { supabase.rpc = original; supabase.from = from; console.warn = aviso; }
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
