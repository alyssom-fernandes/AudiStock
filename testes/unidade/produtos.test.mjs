// Importação de planilha (em lotes) e clonagem de produtos.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { importarProdutosExcel, normalizarLinhaPlanilha, clonarProdutos } = await import('../../js/produtos.js');
const { ID_USUARIO_DEMO } = await import('../../js/demo.js');

const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const empresa = nome => banco().empresas.find(e => e.nome === nome);

test('cabeçalhos com acento, maiúsculas e sinônimos são reconhecidos', () => {
  assert.deepEqual(normalizarLinhaPlanilha({ 'Código': ' 10 ', 'Nome do produto': 'Arroz', 'Un.': 'pct', 'EAN': 789 }),
    { codigo: '10', nome: 'Arroz', unidade: 'pct', codigo_barras: '789' });
  assert.deepEqual(normalizarLinhaPlanilha({ SKU: 'A1', Descrição: 'Feijão', UNIDADE: 'KG' }),
    { codigo: 'A1', nome: 'Feijão', unidade: 'KG', codigo_barras: '' });
});

test('1.200 linhas entram em lotes, com progresso, e as com problema são apontadas', async () => {
  const filial = empresa('Distribuidora Aurora — Filial Norte');
  const linhas = Array.from({ length: 1200 }, (_, i) => ({ codigo: `imp-${i}`, nome: `Produto ${i}`, unidade: 'un' }));
  linhas[10] = { codigo: '', nome: 'Sem código' };
  linhas[20] = { codigo: 'imp-5', nome: 'Repetido: vale este' };
  const progresso = [];
  const r = await importarProdutosExcel(filial.id, linhas, ID_USUARIO_DEMO, { aoProgredir: (f, t) => progresso.push([f, t]) });
  assert.deepEqual(r.erros, [{ linha: 12, motivo: 'sem código' }]);
  assert.equal(r.criados, 1198, '1.200 linhas, menos a sem código e a repetida');
  assert.equal(r.atualizados, 0);
  assert.deepEqual(progresso, [[0, 1198], [500, 1198], [1000, 1198], [1198, 1198]]);
  const gravados = banco().produtos.filter(p => p.empresa_id === filial.id);
  assert.equal(gravados.length, 1198);
  assert.equal(gravados.find(p => p.codigo_produto === 'IMP-5').nome_produto, 'Repetido: vale este');
  assert.equal(gravados.find(p => p.codigo_produto === 'IMP-7').unidade_medida, 'UN');
  assert.equal(banco().importacoes_produtos.at(-1).criados, 1198);

  // Reimportar a mesma planilha atualiza, não duplica
  const r2 = await importarProdutosExcel(filial.id, linhas.slice(0, 5), ID_USUARIO_DEMO);
  assert.deepEqual([r2.criados, r2.atualizados], [0, 5]);
});

test('clonar copia os ativos e atualiza os códigos que o destino já tem', async () => {
  const origem = empresa('Ferragens Horizonte'), destino = empresa('Atacado Serra Azul');
  const ativos = banco().produtos.filter(p => p.empresa_id === origem.id && p.ativo);
  const r = await clonarProdutos(origem.id, destino.id);
  assert.equal(r.criados + r.atualizados, ativos.length);
  const r2 = await clonarProdutos(origem.id, destino.id);
  assert.deepEqual([r2.criados, r2.atualizados], [0, ativos.length]);
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
