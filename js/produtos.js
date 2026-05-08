// ================================================================
//  AudiStock — js/produtos.js
//  Busca e gerenciamento de produtos com Supabase.
//
//  Busca usa o índice `pg_trgm` (já criado no schema),
//  que suporta busca parcial em nome/código via ilike.
// ================================================================

import supabase from './supabaseClient.js';

// ─────────────────────────────────────────────────────────────
//  listarProdutos(empresaId, { q, apenasAtivos, page, limit })
//
//  Retorna { data: produto[], count: total }
//
//  Exemplo:
//    const { data } = await listarProdutos('uuid-empresa', { q: 'oleo', limit: 50 });
// ─────────────────────────────────────────────────────────────
export async function listarProdutos(empresaId, {
  q          = '',
  apenasAtivos = true,
  page       = 1,
  limit      = 50,
} = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from('produtos')
    .select('id, codigo_produto, nome_produto, unidade_medida, codigo_barras, ativo', {
      count: 'exact',
    })
    .eq('empresa_id', empresaId)
    .order('nome_produto')
    .range(from, to);

  if (apenasAtivos) {
    query = query.eq('ativo', true);
  }

  if (q.trim()) {
    // Busca por código exato, código de barras exato, ou nome parcial (case-insensitive)
    query = query.or(
      `codigo_produto.eq.${q.trim()},codigo_barras.eq.${q.trim()},nome_produto.ilike.%${q.trim()}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { data: data ?? [], count: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
//  buscarProdutoPorCodigo(empresaId, codigo)
//  Busca exata por código do produto.
//  Usado na tela de contagem quando o auditor digita o código.
// ─────────────────────────────────────────────────────────────
export async function buscarProdutoPorCodigo(empresaId, codigo) {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, codigo_produto, nome_produto, unidade_medida, codigo_barras')
    .eq('empresa_id', empresaId)
    .eq('codigo_produto', codigo.trim())
    .eq('ativo', true)
    .maybeSingle();   // retorna null se não achar (sem lançar erro)

  if (error) throw new Error(error.message);
  return data;       // null se não encontrado
}

// ─────────────────────────────────────────────────────────────
//  buscarProdutoPorBarras(empresaId, barcode)
//  Busca exata por código de barras.
//  Usado no modo scanner.
// ─────────────────────────────────────────────────────────────
export async function buscarProdutoPorBarras(empresaId, barcode) {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, codigo_produto, nome_produto, unidade_medida, codigo_barras')
    .eq('empresa_id', empresaId)
    .eq('codigo_barras', barcode.trim())
    .eq('ativo', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  buscarProdutoUnificado(empresaId, termo)
//  Tenta código exato → barras exato → nome parcial.
//  Usado na busca ao vivo da contagem (debounced).
//  Retorna array (pode ter vários resultados para nome parcial).
// ─────────────────────────────────────────────────────────────
export async function buscarProdutoUnificado(empresaId, termo) {
  termo = termo.trim();
  if (!termo) return [];

  // Primeiro tenta exato (código ou barras)
  const exato = await buscarProdutoPorCodigo(empresaId, termo)
    ?? await buscarProdutoPorBarras(empresaId, termo);

  if (exato) return [exato];

  // Fallback: nome parcial (retorna até 10)
  const { data, error } = await supabase
    .from('produtos')
    .select('id, codigo_produto, nome_produto, unidade_medida, codigo_barras')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .ilike('nome_produto', `%${termo}%`)
    .limit(10)
    .order('nome_produto');

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────
//  buscarProdutoPorId(id)
// ─────────────────────────────────────────────────────────────
export async function buscarProdutoPorId(id) {
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  criarProduto(campos)
// ─────────────────────────────────────────────────────────────
export async function criarProduto(campos) {
  const { data, error } = await supabase
    .from('produtos')
    .insert([{
      empresa_id:     campos.empresa_id,
      codigo_produto: campos.codigo_produto.trim().toUpperCase(),
      nome_produto:   campos.nome_produto.trim(),
      unidade_medida: campos.unidade_medida?.trim().toUpperCase() || null,
      codigo_barras:  campos.codigo_barras?.trim() || null,
      observacoes:    campos.observacoes?.trim() || null,
      ativo:          true,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  atualizarProduto(id, campos)
// ─────────────────────────────────────────────────────────────
export async function atualizarProduto(id, campos) {
  const payload = {};
  if (campos.codigo_produto != null) payload.codigo_produto = campos.codigo_produto.trim().toUpperCase();
  if (campos.nome_produto   != null) payload.nome_produto   = campos.nome_produto.trim();
  if (campos.unidade_medida != null) payload.unidade_medida = campos.unidade_medida.trim().toUpperCase() || null;
  if (campos.codigo_barras  != null) payload.codigo_barras  = campos.codigo_barras.trim() || null;
  if (campos.observacoes    != null) payload.observacoes    = campos.observacoes.trim() || null;
  if (campos.ativo          != null) payload.ativo          = campos.ativo;

  const { data, error } = await supabase
    .from('produtos')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  importarProdutosExcel(empresaId, linhas, usuarioId)
//
//  linhas = [{ codigo, nome, unidade, codigo_barras }]
//  Retorna { criados, atualizados, erros: [{linha, motivo}] }
//
//  Para parsear o Excel use a lib SheetJS:
//    const wb  = XLSX.read(arrayBuffer);
//    const ws  = wb.Sheets[wb.SheetNames[0]];
//    const linhas = XLSX.utils.sheet_to_json(ws);
// ─────────────────────────────────────────────────────────────
export async function importarProdutosExcel(empresaId, linhas, usuarioId) {
  let criados = 0, atualizados = 0;
  const erros = [];

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const codigo = String(l.codigo ?? l.Codigo ?? '').trim().toUpperCase();
    const nome   = String(l.nome   ?? l.Nome   ?? '').trim();

    if (!codigo || !nome) {
      erros.push({ linha: i + 2, motivo: 'Código ou nome vazios.' });
      continue;
    }

    // Verifica se já existe
    const { data: existente } = await supabase
      .from('produtos')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('codigo_produto', codigo)
      .maybeSingle();

    const payload = {
      empresa_id:     empresaId,
      codigo_produto: codigo,
      nome_produto:   nome,
      unidade_medida: String(l.unidade ?? l.Unidade ?? '').trim().toUpperCase() || null,
      codigo_barras:  String(l.codigo_barras ?? l.CodigoBarras ?? '').trim() || null,
      ativo:          true,
    };

    if (existente) {
      const { error } = await supabase
        .from('produtos')
        .update(payload)
        .eq('id', existente.id);

      if (error) erros.push({ linha: i + 2, motivo: error.message });
      else atualizados++;
    } else {
      const { error } = await supabase
        .from('produtos')
        .insert([payload]);

      if (error) erros.push({ linha: i + 2, motivo: error.message });
      else criados++;
    }
  }

  // Registra log da importação
  await supabase.from('importacoes_produtos').insert([{
    empresa_id:   empresaId,
    usuario_id:   usuarioId,
    total_linhas: linhas.length,
    criados, atualizados,
    erros:        erros.length,
    detalhes:     erros.length > 0 ? erros : null,
  }]);

  return { criados, atualizados, erros };
}

// ─────────────────────────────────────────────────────────────
//  clonarProdutos(origemEmpresaId, destinoEmpresaId, ids?)
//  Se ids não fornecido, clona TODOS os produtos ativos da origem.
// ─────────────────────────────────────────────────────────────
export async function clonarProdutos(origemId, destinoId, ids = null) {
  let query = supabase
    .from('produtos')
    .select('codigo_produto, nome_produto, unidade_medida, codigo_barras, observacoes')
    .eq('empresa_id', origemId)
    .eq('ativo', true);

  if (ids?.length) query = query.in('id', ids);

  const { data: fonte, error: errFonte } = await query;
  if (errFonte) throw new Error(errFonte.message);

  const novos = fonte.map(p => ({ ...p, empresa_id: destinoId }));

  // upsert para não duplicar por código
  const { error } = await supabase
    .from('produtos')
    .upsert(novos, { onConflict: 'empresa_id,codigo_produto', ignoreDuplicates: false });

  if (error) throw new Error(error.message);
  return { criados: novos.length };
}
