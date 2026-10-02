// ================================================================
//  AudiStock — js/produtos.js
//  Busca e gerenciamento de produtos com Supabase.
//
//  Busca usa o índice `pg_trgm` (já criado no schema),
//  que suporta busca parcial em nome/código via ilike.
// ================================================================

import supabase from './supabaseClient.js';
import { buscarTodos } from './consulta.js';

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
//  importarProdutosExcel(empresaId, linhas, usuarioId, { aoProgredir })
//
//  linhas = [{ codigo, nome, unidade, codigo_barras }] (já lidas da
//  planilha com o SheetJS). Grava em lotes de 500 (upsert pelo código),
//  com uma consulta só para saber quais códigos já existem.
//  aoProgredir(feitos, total) é chamado a cada lote.
//  Retorna { criados, atualizados, erros: [{ linha, motivo }] }
// ─────────────────────────────────────────────────────────────
const LOTE = 500;

export async function importarProdutosExcel(empresaId, linhas, usuarioId, { aoProgredir } = {}) {
  const erros = [], porCodigo = new Map();
  linhas.forEach((bruta, i) => {
    const l = normalizarLinhaPlanilha(bruta);
    const codigo = l.codigo.toUpperCase();
    if (!codigo || !l.nome) { erros.push({ linha: i + 2, motivo: !codigo ? 'sem código' : 'sem nome' }); return; }
    // Código repetido na planilha: vale a última linha
    porCodigo.set(codigo, { linha: i + 2, payload: {
      empresa_id:     empresaId,
      codigo_produto: codigo,
      nome_produto:   l.nome,
      unidade_medida: l.unidade.toUpperCase() || null,
      codigo_barras:  l.codigo_barras || null,
      ativo:          true,
    } });
  });

  const jaExistem = new Set((await buscarTodos(() => supabase.from('produtos')
    .select('codigo_produto').eq('empresa_id', empresaId).order('codigo_produto'))).map(p => p.codigo_produto));

  const lista = [...porCodigo.values()];
  let criados = 0, atualizados = 0;
  const contar = x => { if (jaExistem.has(x.payload.codigo_produto)) atualizados++; else criados++; };
  const gravar = itens => supabase.from('produtos').upsert(itens.map(x => x.payload), { onConflict: 'empresa_id,codigo_produto' });

  aoProgredir?.(0, lista.length);
  for (let i = 0; i < lista.length; i += LOTE) {
    const lote = lista.slice(i, i + LOTE);
    const { error } = await gravar(lote);
    if (!error) lote.forEach(contar);
    else {
      // Lote recusado: refaz linha a linha, para dizer qual linha tem problema
      for (const x of lote) {
        const { error: e } = await gravar([x]);
        if (e) erros.push({ linha: x.linha, motivo: e.message }); else contar(x);
      }
    }
    aoProgredir?.(Math.min(i + LOTE, lista.length), lista.length);
  }
  erros.sort((a, b) => a.linha - b.linha);

  // Registro da importação (se falhar, a importação em si já está feita)
  const { error: eLog } = await supabase.from('importacoes_produtos').insert([{
    empresa_id:   empresaId,
    usuario_id:   usuarioId,
    total_linhas: linhas.length,
    criados, atualizados,
    erros:        erros.length,
    detalhes:     erros.length > 0 ? erros : null,
  }]);
  if (eLog) console.warn('[produtos] Registro da importação não gravado:', eLog.message);

  return { criados, atualizados, erros };
}

// ─────────────────────────────────────────────────────────────
//  clonarProdutos(origemEmpresaId, destinoEmpresaId, ids?)
//  Se ids não fornecido, clona TODOS os produtos ativos da origem.
// ─────────────────────────────────────────────────────────────
export async function clonarProdutos(origemId, destinoId, ids = null) {
  const fonte = await buscarTodos(() => {
    let q = supabase
      .from('produtos')
      .select('codigo_produto, nome_produto, unidade_medida, codigo_barras, observacoes')
      .eq('empresa_id', origemId)
      .eq('ativo', true)
      .order('codigo_produto');
    return ids?.length ? q.in('id', ids) : q;
  });

  const novos = fonte.map(p => ({ ...p, empresa_id: destinoId, ativo: true }));

  // Códigos que já existem no destino serão atualizados, não criados
  const existentes = await buscarTodos(() => supabase.from('produtos').select('codigo_produto').eq('empresa_id', destinoId).order('codigo_produto'));
  const jaExistem = new Set(existentes.map(p => p.codigo_produto));

  // upsert para não duplicar por código, em lotes
  for (let i = 0; i < novos.length; i += LOTE) {
    const { error } = await supabase
      .from('produtos')
      .upsert(novos.slice(i, i + LOTE), { onConflict: 'empresa_id,codigo_produto', ignoreDuplicates: false });
    if (error) throw new Error(error.message);
  }
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
