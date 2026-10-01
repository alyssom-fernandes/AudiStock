// ================================================================
//  AudiStock — js/relatorios.js
//  Consulta as views vw_relatorio_divergencias e
//  vw_produtos_nao_auditados para montar o relatório da auditoria
//  e as exportações (CSV aqui; PDF e Excel em js/exportacao.js).
// ================================================================

import supabase from './supabaseClient.js';

// O Supabase devolve no máximo 1.000 linhas por consulta: busca em páginas.
async function _buscarTodos(montar, tamanho = 1000) {
  const todos = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar().range(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    todos.push(...data);
    if (data.length < tamanho) return todos;
  }
}

// ─────────────────────────────────────────────────────────────
//  gerarRelatorio(auditoriaId, { filtro, ordem })
//
//  filtro: 'todos' | 'divergencias' | 'sobras' | 'faltas'
//  ordem:  'diferenca' (maior divergência primeiro, pelo tamanho)
//          | 'codigo' | 'nome' (A→Z)
//  Retorna { itens, count } com todos os itens do filtro, já ordenados.
// ─────────────────────────────────────────────────────────────
export async function gerarRelatorio(auditoriaId, { filtro = 'todos', ordem = 'diferenca' } = {}) {
  const itens = await _buscarTodos(() => {
    let q = supabase.from('vw_relatorio_divergencias').select('*').eq('auditoria_id', auditoriaId).order('codigo_produto');
    if (filtro === 'divergencias') q = q.neq('diferenca', 0);
    else if (filtro === 'sobras') q = q.gt('diferenca', 0);
    else if (filtro === 'faltas') q = q.lt('diferenca', 0);
    return q;
  });
  ordenarItens(itens, ordem);
  return { itens, count: itens.length };
}

export function ordenarItens(itens, ordem = 'diferenca') {
  const texto = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  const criterios = {
    diferenca: (a, b) => (a.diferenca == null) - (b.diferenca == null)
      || Math.abs(Number(b.diferenca)) - Math.abs(Number(a.diferenca))
      || Number(a.diferenca) - Number(b.diferenca)          // no empate, falta antes de sobra
      || texto(a.nome_produto, b.nome_produto),
    codigo: (a, b) => texto(a.codigo_produto, b.codigo_produto),
    nome: (a, b) => texto(a.nome_produto, b.nome_produto),
  };
  return itens.sort(criterios[ordem] ?? criterios.diferenca);
}

// ─────────────────────────────────────────────────────────────
//  produtosNaoAuditados(auditoriaId)
//  Produtos ativos da empresa que não foram contados.
// ─────────────────────────────────────────────────────────────
export async function produtosNaoAuditados(auditoriaId) {
  const data = await _buscarTodos(() => supabase.from('vw_produtos_nao_auditados').select('*').eq('auditoria_id', auditoriaId).order('nome_produto'));
  return { data, count: data.length };
}

// ─────────────────────────────────────────────────────────────
//  resumoAuditoria(auditoriaId)
//  Totais para os indicadores do relatório e das exportações.
// ─────────────────────────────────────────────────────────────
export async function resumoAuditoria(auditoriaId) {
  const [todos, { count: naoAuditados, error }] = await Promise.all([
    _buscarTodos(() => supabase.from('vw_relatorio_divergencias').select('diferenca, status_divergencia').eq('auditoria_id', auditoriaId)),
    supabase.from('vw_produtos_nao_auditados').select('produto_id', { count: 'exact', head: true }).eq('auditoria_id', auditoriaId),
  ]);
  if (error) throw new Error(error.message);

  const auditados = todos.length;
  const semSaldo  = todos.filter(i => i.diferenca == null).length;
  const sobras    = todos.filter(i => i.diferenca != null && i.status_divergencia === 'sobra').length;
  const faltas    = todos.filter(i => i.diferenca != null && i.status_divergencia === 'falta').length;
  const ok        = auditados - sobras - faltas - semSaldo;

  return {
    total_produtos: auditados + (naoAuditados ?? 0),
    auditados,
    nao_auditados: naoAuditados ?? 0,
    divergencias: sobras + faltas,
    sobras, faltas, ok,
    sem_saldo: semSaldo,
  };
}

export function situacaoTexto(diferenca) {
  if (diferenca == null) return 'Sem saldo';
  return diferenca > 0 ? 'Sobra' : diferenca < 0 ? 'Falta' : 'OK';
}

// ─────────────────────────────────────────────────────────────
//  exportarCSV(auditoriaId, filtro, ordem) → texto CSV
//  Feito para abrir certo no Excel brasileiro: separador ";",
//  decimal com vírgula, UTF-8 com BOM (no download) e \r\n.
// ─────────────────────────────────────────────────────────────
export async function exportarCSV(auditoriaId, filtro = 'todos', ordem = 'diferenca') {
  const { itens } = await gerarRelatorio(auditoriaId, { filtro, ordem });
  const texto = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;      // impede que o Excel trate como fórmula
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const num = n => n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 3 });

  const cabecalho = ['Código', 'Produto', 'Unidade', 'Sistema', 'Contado', 'Diferença', 'Situação'].join(';');
  const linhas = itens.map(i => [
    texto(i.codigo_produto), texto(i.nome_produto), texto(i.unidade_medida),
    num(i.estoque_sistema), num(i.quantidade_contada), num(i.diferenca), situacaoTexto(i.diferenca),
  ].join(';'));
  return [cabecalho, ...linhas].join('\r\n') + '\r\n';
}

// ─────────────────────────────────────────────────────────────
//  baixarArquivo(conteudo, nome, tipo) — dispara o download no navegador
// ─────────────────────────────────────────────────────────────
export function baixarArquivo(conteudo, nomeArquivo, tipo = 'text/csv;charset=utf-8;') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([tipo.startsWith('text/csv') ? '﻿' + conteudo : conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

