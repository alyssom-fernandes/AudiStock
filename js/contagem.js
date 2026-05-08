// ================================================================
//  AudiStock — js/contagem.js
//  Módulo central da contagem física de estoque.
//
//  Responsabilidades:
//  - registrar item auditado (insert/update em auditoria_itens)
//  - gravar histórico de edições (auditoria_itens_historico)
//  - detectar conflito (produto já contado)
//  - suporte ao modo scanner (cada leitura soma +1)
//  - cache local durante a sessão para performance
// ================================================================

import supabase from './supabaseClient.js';

// ─────────────────────────────────────────────────────────────
//  buscarItemContado(auditoriaId, produtoId)
//  Retorna o registro existente ou null.
// ─────────────────────────────────────────────────────────────
export async function buscarItemContado(auditoriaId, produtoId) {
  const { data, error } = await supabase
    .from('auditoria_itens')
    .select('id, quantidade_contada, estoque_sistema, data_registro')
    .eq('auditoria_id', auditoriaId)
    .eq('produto_id',   produtoId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;   // null se não existe ainda
}

// ─────────────────────────────────────────────────────────────
//  registrarContagem({ auditoriaId, produtoId, quantidade, usuarioId, acao })
//
//  acao: 'novo' | 'sobrescrever' | 'somar'
//
//  Fluxo:
//  1. Busca se já existe registro para esse produto nessa auditoria
//  2. Se não existe → INSERT direto
//  3. Se existe:
//     - 'sobrescrever': UPDATE + histórico
//     - 'somar':        UPDATE (soma) + histórico
//  4. Retorna o item salvo
// ─────────────────────────────────────────────────────────────
export async function registrarContagem({
  auditoriaId,
  produtoId,
  quantidade,
  usuarioId,
  acao = 'novo',   // 'novo' | 'sobrescrever' | 'somar'
}) {
  if (quantidade < 0) throw new Error('Quantidade não pode ser negativa.');

  const existente = await buscarItemContado(auditoriaId, produtoId);

  if (!existente) {
    // ── INSERT ──
    return await _inserirItem(auditoriaId, produtoId, quantidade, usuarioId);
  }

  // ── UPDATE ──
  let novaQtd;
  if (acao === 'somar') {
    novaQtd = Number(existente.quantidade_contada) + quantidade;
  } else {
    novaQtd = quantidade;  // sobrescrever
  }

  return await _atualizarItem(existente, novaQtd, usuarioId);
}

// ─────────────────────────────────────────────────────────────
//  registrarScannerLeitura(auditoriaId, produtoId, usuarioId)
//  Modo scanner: cada leitura soma +1 ao produto.
//  Retorna o item atualizado.
// ─────────────────────────────────────────────────────────────
export async function registrarScannerLeitura(auditoriaId, produtoId, usuarioId) {
  return registrarContagem({
    auditoriaId,
    produtoId,
    quantidade: 1,
    usuarioId,
    acao: 'somar',
  });
}

// ─────────────────────────────────────────────────────────────
//  editarContagem(itemId, novaQtd, usuarioId, motivo?)
//  Edição manual após o registro inicial.
//  Sempre grava histórico.
// ─────────────────────────────────────────────────────────────
export async function editarContagem(itemId, novaQtd, usuarioId, motivo = '') {
  // 1. Busca valor atual
  const { data: item, error: errBusca } = await supabase
    .from('auditoria_itens')
    .select('id, quantidade_contada, auditoria_id')
    .eq('id', itemId)
    .single();

  if (errBusca) throw new Error(errBusca.message);

  // 2. Verifica se auditoria ainda está em andamento
  const { data: aud } = await supabase
    .from('auditorias')
    .select('status')
    .eq('id', item.auditoria_id)
    .single();

  if (aud?.status !== 'em_andamento') {
    throw new Error('Não é possível editar uma auditoria já finalizada ou cancelada.');
  }

  // 3. Grava histórico
  await _gravarHistorico(itemId, item.quantidade_contada, novaQtd, usuarioId, motivo);

  // 4. Atualiza
  const { data, error } = await supabase
    .from('auditoria_itens')
    .update({
      quantidade_contada: novaQtd,
      atualizado_em:      new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  listarItensContados(auditoriaId, { page, limit })
//  Lista todos os itens já contados, com dados do produto.
// ─────────────────────────────────────────────────────────────
export async function listarItensContados(auditoriaId, { page = 1, limit = 100 } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, count, error } = await supabase
    .from('auditoria_itens')
    .select(`
      id, quantidade_contada, estoque_sistema, diferenca, data_registro,
      produtos ( id, codigo_produto, nome_produto, unidade_medida ),
      usuarios!auditoria_itens_registrado_por_fkey ( nome )
    `, { count: 'exact' })
    .eq('auditoria_id', auditoriaId)
    .order('data_registro', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
//  historicoItem(itemId)
//  Retorna o histórico de edições de um item específico.
// ─────────────────────────────────────────────────────────────
export async function historicoItem(itemId) {
  const { data, error } = await supabase
    .from('auditoria_itens_historico')
    .select(`
      id, quantidade_anterior, quantidade_nova, motivo, criado_em,
      usuarios ( nome )
    `)
    .eq('auditoria_item_id', itemId)
    .order('criado_em', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────
//  preencherEstoquesSistema(auditoriaId, estoques)
//  Chamado ao finalizar auditoria para gravar o estoque do ERP.
//
//  estoques = [{ produto_id: 'uuid', quantidade: 150.5 }]
//  Atualiza auditoria_itens.estoque_sistema para cada produto.
//  O campo `diferenca` é gerado automaticamente pelo PostgreSQL.
// ─────────────────────────────────────────────────────────────
export async function preencherEstoquesSistema(auditoriaId, estoques) {
  // Upsert em lote usando update individual (Supabase não suporta bulk update por condição complexa)
  const promises = estoques.map(({ produto_id, quantidade }) =>
    supabase
      .from('auditoria_itens')
      .update({ estoque_sistema: quantidade })
      .eq('auditoria_id', auditoriaId)
      .eq('produto_id',   produto_id)
  );

  const results = await Promise.all(promises);
  const erros = results.filter(r => r.error);
  if (erros.length > 0) {
    console.error('[contagem] Erros ao preencher estoques:', erros);
  }
  return { ok: results.length - erros.length, erros: erros.length };
}

// ─────────────────────────────────────────────────────────────
//  INTERNOS
// ─────────────────────────────────────────────────────────────
async function _inserirItem(auditoriaId, produtoId, quantidade, usuarioId) {
  const { data, error } = await supabase
    .from('auditoria_itens')
    .insert([{
      auditoria_id:       auditoriaId,
      produto_id:         produtoId,
      quantidade_contada: quantidade,
      registrado_por:     usuarioId,
      data_registro:      new Date().toISOString(),
    }])
    .select(`
      id, quantidade_contada, estoque_sistema, diferenca, data_registro,
      produtos ( codigo_produto, nome_produto, unidade_medida )
    `)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function _atualizarItem(existente, novaQtd, usuarioId) {
  // Grava histórico primeiro
  await _gravarHistorico(existente.id, existente.quantidade_contada, novaQtd, usuarioId);

  const { data, error } = await supabase
    .from('auditoria_itens')
    .update({
      quantidade_contada: novaQtd,
      atualizado_em:      new Date().toISOString(),
    })
    .eq('id', existente.id)
    .select(`
      id, quantidade_contada, estoque_sistema, diferenca, data_registro,
      produtos ( codigo_produto, nome_produto, unidade_medida )
    `)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function _gravarHistorico(itemId, qtdAnterior, qtdNova, usuarioId, motivo = '') {
  const { error } = await supabase
    .from('auditoria_itens_historico')
    .insert([{
      auditoria_item_id:   itemId,
      usuario_id:          usuarioId,
      quantidade_anterior: qtdAnterior,
      quantidade_nova:     qtdNova,
      motivo:              motivo.trim() || null,
    }]);

  if (error) {
    // Não lança erro para não bloquear a contagem; apenas loga
    console.error('[contagem] Erro ao gravar histórico:', error);
  }
}
