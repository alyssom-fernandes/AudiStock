// ================================================================
//  AudiStock — js/auditorias.js
//  Gerencia o ciclo de vida das auditorias:
//  criar → listar → finalizar → cancelar → excluir (supremo)
// ================================================================

import supabase from './supabaseClient.js';

// ─────────────────────────────────────────────────────────────
//  listarAuditorias({ empresaId, status, limit })
//  status: 'em_andamento' | 'finalizada' | 'cancelada' | null (todos)
// ─────────────────────────────────────────────────────────────
export async function listarAuditorias({
  empresaId = null,
  status    = null,
  limit     = 50,
  page      = 1,
} = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from('auditorias')
    .select(`
      id, numero_auditoria, status, auditoria_cega,
      data_inicio, data_fim, observacoes,
      empresa_id,
      empresas ( nome ),
      criado_por,
      usuarios!auditorias_criado_por_fkey ( nome )
    `, { count: 'exact' })
    .order('data_inicio', { ascending: false })
    .range(from, to);

  if (empresaId) query = query.eq('empresa_id', empresaId);
  if (status)    query = query.eq('status', status);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
//  buscarAuditoria(id) → auditoria completa com empresa e criador
// ─────────────────────────────────────────────────────────────
export async function buscarAuditoria(id) {
  const { data, error } = await supabase
    .from('auditorias')
    .select(`
      *,
      empresas ( id, nome ),
      usuarios!auditorias_criado_por_fkey ( id, nome, role ),
      cancelador:usuarios!auditorias_cancelado_por_fkey ( nome )
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  iniciarAuditoria({ empresaId, usuarioId, auditoriaCega, obs })
//  Usa a função SQL `gerar_numero_auditoria` para criar o número
//  sequencial (AUD-YYYY-NNNN).
// ─────────────────────────────────────────────────────────────
export async function iniciarAuditoria({ empresaId, usuarioId, auditoriaCega = true, observacoes = '' }) {
  // 1. Gera número via RPC (função PL/pgSQL do schema)
  const { data: numData, error: numErr } = await supabase
    .rpc('gerar_numero_auditoria', { p_empresa_id: empresaId });

  if (numErr) throw new Error('Erro ao gerar número: ' + numErr.message);

  // 2. Cria a auditoria
  const { data, error } = await supabase
    .from('auditorias')
    .insert([{
      numero_auditoria: numData,
      empresa_id:       empresaId,
      criado_por:       usuarioId,
      auditoria_cega:   auditoriaCega,
      status:           'em_andamento',
      data_inicio:      new Date().toISOString(),
      observacoes:      observacoes.trim() || null,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  finalizarAuditoria(id)
//  Seta status = 'finalizada' e data_fim = agora.
//  Após finalizar, a view vw_relatorio_divergencias já retorna
//  os dados comparados.
// ─────────────────────────────────────────────────────────────
export async function finalizarAuditoria(id) {
  const { data, error } = await supabase
    .from('auditorias')
    .update({
      status:   'finalizada',
      data_fim: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'em_andamento')  // proteção: só finaliza se em andamento
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data)  throw new Error('Auditoria não encontrada ou já finalizada.');
  return data;
}

// ─────────────────────────────────────────────────────────────
//  cancelarAuditoria(id, usuarioId, motivo)
// ─────────────────────────────────────────────────────────────
export async function cancelarAuditoria(id, usuarioId, motivo = '') {
  const { data, error } = await supabase
    .from('auditorias')
    .update({
      status:             'cancelada',
      cancelado_por:      usuarioId,
      cancelado_em:       new Date().toISOString(),
      motivo_cancelamento: motivo.trim() || null,
    })
    .eq('id', id)
    .eq('status', 'em_andamento')
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  excluirAuditoria(id, usuarioId)
//  APENAS SUPREMO.
//  Salva snapshot em auditoria_exclusoes_log antes de excluir.
// ─────────────────────────────────────────────────────────────
export async function excluirAuditoria(auditoriaId, usuarioId) {
  // 1. Busca snapshot completo
  const auditoria = await buscarAuditoria(auditoriaId);

  // 2. Busca itens para incluir no snapshot
  const { data: itens } = await supabase
    .from('auditoria_itens')
    .select('*')
    .eq('auditoria_id', auditoriaId);

  // 3. Salva log
  const { error: logErr } = await supabase
    .from('auditoria_exclusoes_log')
    .insert([{
      auditoria_id: auditoriaId,
      numero:       auditoria.numero_auditoria,
      empresa_id:   auditoria.empresa_id,
      excluido_por: usuarioId,
      snapshot:     { auditoria, itens },
    }]);

  if (logErr) throw new Error('Erro ao salvar log: ' + logErr.message);

  // 4. Exclui (CASCADE remove os itens automaticamente)
  const { error } = await supabase
    .from('auditorias')
    .delete()
    .eq('id', auditoriaId);

  if (error) throw new Error(error.message);
  return true;
}

// ─────────────────────────────────────────────────────────────
//  progresso(auditoriaId)
//  Retorna { contados, totalProdutos, pct }
// ─────────────────────────────────────────────────────────────
export async function progresso(auditoriaId) {
  const auditoria = await buscarAuditoria(auditoriaId);

  // Total de produtos ativos da empresa e de itens já contados. Se a consulta
  // falhar, lança: mostrar "0%" seria um número errado com cara de certo.
  const { count: totalProdutos, error: e1 } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', auditoria.empresa_id)
    .eq('ativo', true);
  if (e1) throw new Error(e1.message);

  const { count: contados, error: e2 } = await supabase
    .from('auditoria_itens')
    .select('id', { count: 'exact', head: true })
    .eq('auditoria_id', auditoriaId);
  if (e2) throw new Error(e2.message);

  const pct = totalProdutos > 0 ? Math.round((contados / totalProdutos) * 100) : 0;
  return { contados: contados ?? 0, totalProdutos: totalProdutos ?? 0, pct };
}

// ─────────────────────────────────────────────────────────────
//  auditoriaEmAndamentoPorEmpresa(empresaId)
//  Verifica se já existe uma auditoria ativa para a empresa.
// ─────────────────────────────────────────────────────────────
export async function auditoriaEmAndamentoPorEmpresa(empresaId) {
  const { data, error } = await supabase
    .from('auditorias')
    .select('id, numero_auditoria')
    .eq('empresa_id', empresaId)
    .eq('status', 'em_andamento')
    .maybeSingle();
  if (error) throw new Error(error.message);

  return data;  // null se nenhuma
}
