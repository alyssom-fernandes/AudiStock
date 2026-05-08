// ================================================================
//  AudiStock — js/relatorios.js
//  Consulta a view vw_relatorio_divergencias e vw_produtos_nao_auditados
//  para gerar relatórios completos.
// ================================================================

import supabase from './supabaseClient.js';

// ─────────────────────────────────────────────────────────────
//  gerarRelatorio(auditoriaId, { filtro, ordem, direcao })
//
//  filtro:  'todos' | 'divergencias' | 'sobras' | 'faltas'
//  ordem:   'diferenca' | 'codigo' | 'nome'
//  direcao: 'asc' | 'desc'
//
//  Consulta diretamente a VIEW `vw_relatorio_divergencias`.
//  Retorna { itens, resumo }
//
//  Exemplo:
//    const rel = await gerarRelatorio('uuid', { filtro: 'faltas' });
//    console.log(rel.resumo.total_faltas);
// ─────────────────────────────────────────────────────────────
export async function gerarRelatorio(auditoriaId, {
  filtro  = 'todos',
  ordem   = 'diferenca',
  direcao = 'desc',
  page    = 1,
  limit   = 200,
} = {}) {

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  // ── Monta a query na view ──
  let query = supabase
    .from('vw_relatorio_divergencias')
    .select('*', { count: 'exact' })
    .eq('auditoria_id', auditoriaId)
    .range(from, to);

  // Filtros de divergência
  if (filtro === 'divergencias') {
    query = query.neq('diferenca', 0);
  } else if (filtro === 'sobras') {
    query = query.gt('diferenca', 0);
  } else if (filtro === 'faltas') {
    query = query.lt('diferenca', 0);
  }

  // Ordenação
  const colOrdem = {
    diferenca: 'diferenca',
    codigo:    'codigo_produto',
    nome:      'nome_produto',
  };
  const coluna = colOrdem[ordem] ?? 'diferenca';
  query = query.order(coluna, { ascending: direcao === 'asc' });

  const { data: itens, count, error } = await query;
  if (error) throw new Error(error.message);

  // ── Calcula resumo (sempre busca todos para contar) ──
  const resumo = await _calcularResumo(auditoriaId);

  return {
    itens:  itens ?? [],
    count:  count ?? 0,
    resumo,
  };
}

// ─────────────────────────────────────────────────────────────
//  produtosNaoAuditados(auditoriaId)
//  Retorna produtos que existem na empresa mas não foram contados.
// ─────────────────────────────────────────────────────────────
export async function produtosNaoAuditados(auditoriaId, { page = 1, limit = 100 } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, count, error } = await supabase
    .from('vw_produtos_nao_auditados')
    .select('*', { count: 'exact' })
    .eq('auditoria_id', auditoriaId)
    .order('nome_produto')
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
//  resumoAuditoria(auditoriaId)
//  Retorna resumo completo para os cards do relatório.
// ─────────────────────────────────────────────────────────────
export async function resumoAuditoria(auditoriaId) {
  return _calcularResumo(auditoriaId);
}

// ─────────────────────────────────────────────────────────────
//  INTERNO: _calcularResumo
// ─────────────────────────────────────────────────────────────
async function _calcularResumo(auditoriaId) {
  // Todos os itens auditados
  const { data: todos, error } = await supabase
    .from('vw_relatorio_divergencias')
    .select('diferenca, status_divergencia')
    .eq('auditoria_id', auditoriaId);

  if (error) throw new Error(error.message);

  // Não auditados
  const { count: naoAuditados } = await supabase
    .from('vw_produtos_nao_auditados')
    .select('produto_id', { count: 'exact', head: true })
    .eq('auditoria_id', auditoriaId);

  const auditados      = todos?.length ?? 0;
  const totalProdutos  = auditados + (naoAuditados ?? 0);
  const sobras         = todos?.filter(i => i.status_divergencia === 'sobra').length  ?? 0;
  const faltas         = todos?.filter(i => i.status_divergencia === 'falta').length  ?? 0;
  const ok             = todos?.filter(i => i.status_divergencia === 'ok').length     ?? 0;
  const divergencias   = sobras + faltas;

  return {
    total_produtos:    totalProdutos,
    auditados,
    nao_auditados:     naoAuditados ?? 0,
    divergencias,
    sobras,
    faltas,
    ok,
  };
}

// ─────────────────────────────────────────────────────────────
//  exportarCSV(auditoriaId, filtro?)
//  Retorna uma string CSV pronta para download.
//  Para PDF/Excel com layout rico, use bibliotecas no frontend.
// ─────────────────────────────────────────────────────────────
export async function exportarCSV(auditoriaId, filtro = 'todos') {
  const { itens } = await gerarRelatorio(auditoriaId, {
    filtro,
    limit: 99999,   // exporta tudo
  });

  const cabecalho = [
    'Código', 'Produto', 'Unidade',
    'Estoque Sistema', 'Qtd Contada', 'Diferença', 'Status'
  ].join(';');

  const linhas = itens.map(i => [
    i.codigo_produto,
    `"${i.nome_produto}"`,
    i.unidade_medida ?? '',
    i.estoque_sistema ?? '',
    i.quantidade_contada,
    i.diferenca ?? '',
    i.status_divergencia ?? '',
  ].join(';'));

  return [cabecalho, ...linhas].join('\n');
}

// ─────────────────────────────────────────────────────────────
//  triggerDownloadCSV(csv, nomeArquivo)
//  Dispara o download no browser.
// ─────────────────────────────────────────────────────────────
export function triggerDownloadCSV(csv, nomeArquivo = 'relatorio.csv') {
  const BOM  = '\uFEFF';  // BOM para Excel reconhecer UTF-8
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
