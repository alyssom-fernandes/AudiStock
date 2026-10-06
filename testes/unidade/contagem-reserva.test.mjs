// Banco antigo, sem a função registrar_contagem: o app cai no caminho em
// duas etapas. Fica num arquivo próprio porque, depois da primeira recusa,
// o app não tenta mais a função até recarregar a página.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { registrarContagem, historicoItem } = await import('../../js/contagem.js');
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

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
