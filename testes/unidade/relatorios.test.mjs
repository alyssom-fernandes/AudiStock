// Números do relatório, ordem por divergência e o CSV.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { resumoAuditoria, ordenarItens, exportarCSV, situacaoTexto, gerarRelatorio, porcentagem } = await import('../../js/relatorios.js');
const { nomeArquivo, tituloRelatorio, temComparacao, semDivergenciaMotivo, fimRotulo } = await import('../../js/exportacao.js');

const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const auditoria = numero => {
  const a = banco().auditorias.find(x => x.numero_auditoria.endsWith(numero));
  return { ...a, empresas: banco().empresas.find(e => e.id === a.empresa_id) };
};

test('o resumo da auditoria finalizada bate com as linhas do relatório', async () => {
  const aud = auditoria('0006');
  const r = await resumoAuditoria(aud.id);
  const { itens } = await gerarRelatorio(aud.id);
  assert.equal(r.auditados, itens.length);
  assert.equal(r.faltas, itens.filter(i => i.diferenca < 0).length);
  assert.equal(r.sobras, itens.filter(i => i.diferenca > 0).length);
  assert.equal(r.ok + r.faltas + r.sobras + r.sem_saldo, r.auditados);
  assert.equal(r.total_produtos, r.auditados + r.nao_auditados);
  assert.ok(temComparacao(r));
});

test('auditoria em andamento não tem com o que comparar', async () => {
  const r = await resumoAuditoria(auditoria('0007').id);
  assert.equal(r.sem_saldo, r.auditados);
  assert.equal(temComparacao(r), false);
  // Em andamento, mesmo com algum saldo gravado (finalização que falhou no meio), só a contagem
  assert.equal(temComparacao({ auditados: 3, sem_saldo: 1 }, { status: 'em_andamento' }), false);
  assert.equal(temComparacao({ auditados: 3, sem_saldo: 1 }, { status: 'finalizada' }), true);
  assert.equal(tituloRelatorio({ status: 'em_andamento' }), 'Relatório parcial da contagem');
  assert.equal(semDivergenciaMotivo({ status: 'cancelada' }), 'auditoria cancelada sem fechamento');
  assert.deepEqual(fimRotulo({ status: 'cancelada', cancelado_em: 'x', data_fim: null }), ['Cancelada em', 'x']);
});

test('a maior divergência é medida em proporção ao saldo do sistema', () => {
  const itens = [
    { nome_produto: 'Linguiça', diferenca: 1.288, estoque_sistema: 14.442 },   // 8,9%
    { nome_produto: 'Isqueiro', diferenca: 2, estoque_sistema: 13 },           // 15,4%
    { nome_produto: 'Sem saldo', diferenca: null, estoque_sistema: null },
    { nome_produto: 'Água', diferenca: -2, estoque_sistema: 13 },              // empate: falta antes
    { nome_produto: 'OK', diferenca: 0, estoque_sistema: 50 },
  ];
  assert.deepEqual(ordenarItens(itens, 'diferenca').map(i => i.nome_produto), ['Água', 'Isqueiro', 'Linguiça', 'OK', 'Sem saldo']);
  assert.deepEqual(ordenarItens(itens, 'nome').map(i => i.nome_produto), ['Água', 'Isqueiro', 'Linguiça', 'OK', 'Sem saldo']);
  assert.equal(situacaoTexto(null), 'Sem saldo');
  assert.equal(situacaoTexto(-1), 'Falta');
});

test('o CSV abre certo no Excel brasileiro', async () => {
  const aud = auditoria('0005');   // Horizonte: nomes com aspas e unidades fracionadas
  const csv = await exportarCSV(aud.id, 'todos', 'nome', aud);
  const linhas = csv.split('\r\n');
  assert.equal(linhas[0], 'Auditoria;Empresa;Código;Produto;Unidade;Sistema;Contado;Diferença;Situação');
  assert.ok(csv.endsWith('\r\n'));
  const comAspas = linhas.find(l => l.includes('Parafuso Sextavado'));
  assert.match(comAspas, /;"Parafuso Sextavado 1\/4"" x 2""";/, 'aspas dobradas e campo entre aspas');
  const kg = linhas.find(l => l.includes(';KG;'));
  assert.match(kg, /;\d+,\d+;/, 'decimal com vírgula');
  assert.ok(linhas.slice(1, -1).every(l => l.startsWith(`${aud.numero_auditoria};Ferragens Horizonte;`)));
  assert.ok(linhas.some(l => /;\+\d/.test(l)), 'sobra com sinal de +');
});

test('CSV de auditoria em andamento sai só com a contagem, mesmo com algum saldo gravado', async () => {
  const aud = auditoria('0007');
  const item = JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas.auditoria_itens.find(i => i.auditoria_id === aud.id);
  await supabase.from('auditoria_itens').update({ estoque_sistema: 1 }).eq('id', item.id);   // finalização que falhou no meio
  const comparado = temComparacao(await resumoAuditoria(aud.id), aud);
  assert.equal(comparado, false);
  const [cabecalho] = (await exportarCSV(aud.id, 'todos', 'nome', aud, { comparado })).split('\r\n');
  assert.equal(cabecalho, 'Auditoria;Empresa;Código;Produto;Unidade;Contado');
  await supabase.from('auditoria_itens').update({ estoque_sistema: null }).eq('id', item.id);
});

test('porcentagens arredondadas para baixo, sem erro de ponto flutuante', () => {
  assert.equal(porcentagem(29, 50), 58, 'e não 57');
  assert.equal(porcentagem(57, 100), 57);
  assert.equal(porcentagem(299, 300), 99, '299 de 300 não é 100%');
  assert.equal(porcentagem(299, 300, 1), 99.6);
  assert.equal(porcentagem(2, 3, 1), 66.6);
  assert.equal(porcentagem(5, 0), 0);
  for (let t = 1; t <= 3000; t++) for (let p = 0; p <= t; p += 7) assert.equal(porcentagem(p, t), Math.floor((p * 100 - (p * 100) % t) / t), `${p} de ${t}`);
});

test('nome dos arquivos exportados leva número, empresa e data', () => {
  const nome = nomeArquivo({ numero_auditoria: 'AUD-2026-0006', empresas: { nome: 'Atacado Serra Azul' }, data_fim: '2026-09-29T15:09:00Z' }, 'pdf');
  assert.match(nome, /^AUD-2026-0006_Atacado-Serra-Azul_2026-09-(29|30)\.pdf$/);
  assert.equal(nomeArquivo({ numero_auditoria: 'AUD-1', empresas: { nome: 'Ferragens & Cia — Matriz' }, data_inicio: '2026-01-05T12:00:00Z' }, 'csv'),
    'AUD-1_Ferragens-Cia-Matriz_2026-01-05.csv');
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
