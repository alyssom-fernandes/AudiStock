// Importação de planilha (em lotes), clonagem e a busca no catálogo
// guardado (a contagem procura nele, sem depender da rede).
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { importarProdutosExcel, normalizarLinhaPlanilha, clonarProdutos, buscarNoCatalogo, acharNoCatalogo } = await import('../../js/produtos.js');
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
  // A linha sem unidade vai num envio à parte (para não apagar a unidade de ninguém)
  assert.deepEqual(progresso[0], [0, 1198]);
  assert.deepEqual(progresso.at(-1), [1198, 1198]);
  assert.ok(progresso.every(([f], i) => !i || f > progresso[i - 1][0]), 'o progresso só avança');
  const gravados = banco().produtos.filter(p => p.empresa_id === filial.id);
  assert.equal(gravados.length, 1198);
  assert.equal(gravados.find(p => p.codigo_produto === 'IMP-5').nome_produto, 'Repetido: vale este');
  assert.equal(gravados.find(p => p.codigo_produto === 'IMP-7').unidade_medida, 'UN');
  assert.equal(banco().importacoes_produtos.at(-1).criados, 1198);

  // Reimportar a mesma planilha atualiza, não duplica
  const r2 = await importarProdutosExcel(filial.id, linhas.slice(0, 5), ID_USUARIO_DEMO);
  assert.deepEqual([r2.criados, r2.atualizados], [0, 5]);
});

test('reimportar só código e nome não apaga a unidade nem o código de barras', async () => {
  const emp = empresa('Ferragens Horizonte');
  const p = banco().produtos.find(x => x.empresa_id === emp.id && x.ativo && x.codigo_barras && x.unidade_medida);
  const r = await importarProdutosExcel(emp.id, [{ codigo: p.codigo_produto, nome: `${p.nome_produto} (novo nome)`, n: 2 }], ID_USUARIO_DEMO);
  assert.deepEqual([r.criados, r.atualizados, r.erros], [0, 1, []]);
  const depois = banco().produtos.find(x => x.id === p.id);
  assert.equal(depois.nome_produto, `${p.nome_produto} (novo nome)`);
  assert.equal(depois.unidade_medida, p.unidade_medida);
  assert.equal(depois.codigo_barras, p.codigo_barras);
});

test('os erros apontam a linha da planilha, e o código de barras de outro produto é explicado', async () => {
  const emp = empresa('Ferragens Horizonte');
  const outro = banco().produtos.find(x => x.empresa_id === emp.id && x.ativo && x.codigo_barras);
  const linhas = [
    { codigo: 'LIN-A', nome: 'Linha A', n: 2 },
    { codigo: 'LIN-B', nome: 'Linha B', codigo_barras: outro.codigo_barras, n: 7 },   // linhas em branco antes dela
    { codigo: 'LIN-C', nome: 'Linha C', n: 8 },
  ];
  const r = await importarProdutosExcel(emp.id, linhas, ID_USUARIO_DEMO, { totalLinhas: 4, ignoradas: [{ n: 5, motivo: 'sem nome' }] });
  assert.equal(r.criados, 2);
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0].linha, 7);
  assert.match(r.erros[0].motivo, new RegExp(`código de barras ${outro.codigo_barras}`));
  const registro = banco().importacoes_produtos.at(-1);
  assert.deepEqual([registro.total_linhas, registro.erros], [4, 2], 'a linha ignorada na prévia também entra no registro');
});

test('sem conexão no meio da importação, para e diz quanto já foi gravado', async () => {
  const emp = empresa('Atacado Serra Azul');
  const original = supabase.from;
  let envios = 0;
  supabase.from = tabela => {
    const q = original.call(supabase, tabela);
    if (tabela !== 'produtos') return q;
    const upsert = q.upsert.bind(q);
    q.upsert = (...args) => (++envios > 1 ? Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch' } }) : upsert(...args));
    return q;
  };
  try {
    const linhas = Array.from({ length: 1200 }, (_, i) => ({ codigo: `rede-${i}`, nome: `Produto ${i}`, unidade: 'UN', n: i + 2 }));
    await assert.rejects(importarProdutosExcel(emp.id, linhas, ID_USUARIO_DEMO), /Sem conexão com o servidor no meio da importação: 500 produtos foram gravados/);
    assert.equal(envios, 2, 'não tenta linha a linha com a rede fora');
  } finally { supabase.from = original; }
});

test('busca no catálogo guardado: código exato primeiro, depois nome sem acento', () => {
  const catalogo = [
    { codigo_produto: 'A1', nome_produto: 'Água Mineral 500ml', codigo_barras: '7890000000001' },
    { codigo_produto: 'B2', nome_produto: 'Açúcar Cristal 1kg', codigo_barras: null },
    { codigo_produto: 'C3', nome_produto: 'Agua de Coco', codigo_barras: '7890000000003' },
  ];
  assert.equal(acharNoCatalogo(catalogo, ' 7890000000003 ').codigo_produto, 'C3');
  assert.equal(acharNoCatalogo(catalogo, 'b2').codigo_produto, 'B2');
  assert.equal(acharNoCatalogo(catalogo, 'X9'), null);
  assert.deepEqual(buscarNoCatalogo(catalogo, 'agua').map(p => p.codigo_produto).sort(), ['A1', 'C3']);
  assert.deepEqual(buscarNoCatalogo(catalogo, 'ACUCAR').map(p => p.codigo_produto), ['B2']);
});

test('clonar copia os ativos e atualiza os códigos que o destino já tem', async () => {
  const origem = empresa('Ferragens Horizonte'), destino = empresa('Atacado Serra Azul');
  const ativos = banco().produtos.filter(p => p.empresa_id === origem.id && p.ativo);
  const r = await clonarProdutos(origem.id, destino.id);
  assert.equal(r.criados + r.atualizados, ativos.length);
  const r2 = await clonarProdutos(origem.id, destino.id);
  assert.deepEqual([r2.criados, r2.atualizados], [0, ativos.length]);
});

test('clonar não copia o código de barras que no destino já é de outro produto', async () => {
  const origem = empresa('Ferragens Horizonte'), destino = empresa('Distribuidora Aurora — Filial Norte');
  const fonte = banco().produtos.find(p => p.empresa_id === origem.id && p.ativo && p.codigo_barras);
  // No destino, outro código já usa esse EAN
  await supabase.from('produtos').insert([{ empresa_id: destino.id, codigo_produto: 'JA-TEM-EAN', nome_produto: 'Já tem o EAN', codigo_barras: fonte.codigo_barras, ativo: true }]);
  const r = await clonarProdutos(origem.id, destino.id, [fonte.id]);
  assert.deepEqual([r.criados, r.semEan], [1, 1]);
  const copia = banco().produtos.find(p => p.empresa_id === destino.id && p.codigo_produto === fonte.codigo_produto);
  assert.equal(copia.codigo_barras, null);
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
