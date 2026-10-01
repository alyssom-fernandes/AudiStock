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

  const termo = _termoSeguro(q);
  if (termo) {
    // Código (começo, sem diferenciar maiúsculas), código de barras exato ou nome parcial
    query = query.or(
      `codigo_produto.ilike.${termo}%,codigo_barras.eq.${termo},nome_produto.ilike.%${termo}%`
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
    .eq('codigo_produto', codigo.trim().toUpperCase())
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
    .ilike('nome_produto', `%${_termoSeguro(termo)}%`)
    .order('nome_produto')
    .limit(10);

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
  // Campo ausente (undefined) não muda; campo vazio limpa o valor
  const payload = {};
  if (campos.codigo_produto != null) payload.codigo_produto = campos.codigo_produto.trim().toUpperCase();
  if (campos.nome_produto   != null) payload.nome_produto   = campos.nome_produto.trim();
  if (campos.unidade_medida !== undefined) payload.unidade_medida = campos.unidade_medida?.trim().toUpperCase() || null;
  if (campos.codigo_barras  !== undefined) payload.codigo_barras  = campos.codigo_barras?.trim() || null;
  if (campos.observacoes    !== undefined) payload.observacoes    = campos.observacoes?.trim() || null;
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
    const l = normalizarLinhaPlanilha(linhas[i]);
    const codigo = l.codigo.toUpperCase();
    const nome   = l.nome;

    if (!codigo || !nome) {
      erros.push({ linha: i + 2, motivo: !codigo ? 'sem código' : 'sem nome' });
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
      unidade_medida: l.unidade.toUpperCase() || null,
      codigo_barras:  l.codigo_barras || null,
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

  const novos = fonte.map(p => ({ ...p, empresa_id: destinoId, ativo: true }));

  // Códigos que já existem no destino serão atualizados, não criados
  const { data: existentes, error: errDest } = await supabase
    .from('produtos')
    .select('codigo_produto')
    .eq('empresa_id', destinoId);
  if (errDest) throw new Error(errDest.message);
  const jaExistem = new Set(existentes.map(p => p.codigo_produto));

  // upsert para não duplicar por código
  const { error } = await supabase
    .from('produtos')
    .upsert(novos, { onConflict: 'empresa_id,codigo_produto', ignoreDuplicates: false });

  if (error) throw new Error(error.message);
  const atualizados = novos.filter(p => jaExistem.has(p.codigo_produto)).length;
  return { criados: novos.length - atualizados, atualizados };
}

// ─────────────────────────────────────────────────────────────
//  normalizarLinhaPlanilha(linha) → { codigo, nome, unidade, codigo_barras }
//  Aceita cabeçalhos com acento, maiúsculas e sinônimos comuns
//  ("Código", "Nome do produto", "Un.", "EAN"…).
// ─────────────────────────────────────────────────────────────
const SINONIMOS = {
  codigo:        ['codigo', 'cod', 'codigoproduto', 'sku', 'referencia', 'ref'],
  nome:          ['nome', 'nomedoproduto', 'nomeproduto', 'produto', 'descricao', 'descricaodoproduto'],
  unidade:       ['unidade', 'un', 'und', 'unid', 'unidademedida', 'unidadedemedida'],
  codigo_barras: ['codigobarras', 'codigodebarras', 'ean', 'gtin', 'barras', 'codbarras'],
};
export function normalizarLinhaPlanilha(linha) {
  const chave = k => String(k).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const porChave = Object.fromEntries(Object.entries(linha).map(([k, v]) => [chave(k), v]));
  const pegar = campo => String(SINONIMOS[campo].map(s => porChave[s]).find(v => v !== undefined && v !== '') ?? '').trim();
  return { codigo: pegar('codigo'), nome: pegar('nome'), unidade: pegar('unidade'), codigo_barras: pegar('codigo_barras') };
}

// Vírgula, parênteses e asterisco têm significado no filtro or() do PostgREST
function _termoSeguro(q) {
  return String(q ?? '').replace(/[,()*%\\:]/g, ' ').replace(/\s+/g, ' ').trim();
}
