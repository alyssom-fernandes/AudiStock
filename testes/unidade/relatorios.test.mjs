// Números do relatório, ordem por divergência e o CSV.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { resumoAuditoria, ordenarItens, exportarCSV, situacaoTexto, gerarRelatorio, porcentagem, pctDoSaldo, proporcaoTexto } = await import('../../js/relatorios.js');
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
  assert.equal(linhas[0], 'Auditoria;Empresa;Código;Produto;Unidade;Sistema;Contado;Diferença;Diferença %;Situação');
  assert.ok(csv.endsWith('\r\n'));
  const comAspas = linhas.find(l => l.includes('Parafuso Sextavado'));
  assert.match(comAspas, /;"Parafuso Sextavado 1\/4"" x 2""";/, 'aspas dobradas e campo entre aspas');
  const kg = linhas.find(l => l.includes(';KG;'));
  assert.match(kg, /;\d+,\d+;/, 'decimal com vírgula');
  assert.ok(linhas.slice(1, -1).every(l => l.startsWith(`${aud.numero_auditoria};Ferragens Horizonte;`)));
  assert.ok(linhas.some(l => /;\+\d/.test(l)), 'sobra com sinal de +');
  assert.ok(linhas.some(l => /;\+[\d,]+;\+\d+,\d;Sobra$/.test(l)), 'diferença em % do saldo, com sinal');
  assert.ok(linhas.some(l => /;0;0,0;OK$/.test(l)), 'sem divergência, diferença e % zeradas');
  assert.ok(!linhas.some(l => /;[+-]0;(Falta|Sobra)$/.test(l)), 'divergência pequena não sai como +0 ou -0');
});

test('a % do saldo que aparece junto da diferença é a mesma da ordem', () => {
  assert.equal(pctDoSaldo({ diferenca: 2, estoque_sistema: 13 }), '15,4%');
  assert.equal(pctDoSaldo({ diferenca: -12, estoque_sistema: 99 }), '12,1%');
  assert.equal(pctDoSaldo({ diferenca: 1.288, estoque_sistema: 14.442 }), '8,9%');
  assert.equal(pctDoSaldo({ diferenca: 0, estoque_sistema: 10 }), '');
  assert.equal(pctDoSaldo({ diferenca: 5, estoque_sistema: null }), null);
  assert.equal(proporcaoTexto({ diferenca: -18, estoque_sistema: 209 }), '8,6% do saldo');
  assert.equal(proporcaoTexto({ diferenca: 3, estoque_sistema: 0 }), 'saldo zerado');
  assert.equal(proporcaoTexto({ diferenca: 0, estoque_sistema: 0 }), '');
  assert.equal(proporcaoTexto({ diferenca: 2, estoque_sistema: null }), '', 'sem saldo não é saldo zerado');
  assert.equal(pctDoSaldo({ diferenca: -0.001, estoque_sistema: 5 }), '<0,1%', 'divergência pequena não vira 0%');
  // Saldo abaixo de 1: a ordem segue a mesma % que a tela mostra
  const fracionados = ordenarItens([{ nome_produto: 'B', diferenca: 5, estoque_sistema: 10 }, { nome_produto: 'A', diferenca: 0.4, estoque_sistema: 0.5 }]);
  assert.deepEqual(fracionados.map(i => `${i.nome_produto} ${pctDoSaldo(i)}`), ['A 80,0%', 'B 50,0%']);
  // Na ordem, quem tem a maior % vem antes, mesmo com diferença menor
  const itens = ordenarItens([{ nome_produto: 'Suco', diferenca: -18, estoque_sistema: 209 }, { nome_produto: 'Isqueiro', diferenca: 2, estoque_sistema: 13 }]);
  assert.deepEqual(itens.map(i => i.nome_produto), ['Isqueiro', 'Suco']);
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

test('a coluna "Diferença %" do CSV tem a mesma precisão da tela', async () => {
  const { data: aud } = await supabase.from('auditorias').select('id, numero_auditoria, empresas(nome)').eq('status', 'finalizada').limit(1).single();
  const { itens } = await gerarRelatorio(aud.id, { filtro: 'todos', ordem: 'diferenca' });
  const csv = (await exportarCSV(aud.id, 'todos', 'diferenca', aud)).split('\r\n').slice(1).filter(Boolean).map(l => l.split(';'));
  const comPct = itens.filter(i => pctDoSaldo(i));
  assert.ok(comPct.length > 0);
  for (const i of comPct) {
    const linha = csv.find(c => c[2] === `${i.codigo_produto}`);
    assert.equal(linha[8].replace(/^[+-]/, ''), pctDoSaldo(i).replace('%', ''), `${i.codigo_produto}: CSV e tela diferem`);
  }
});
