// ================================================================
//  AudiStock — js/produtos.js
//  Busca e gerenciamento de produtos com Supabase.
//
//  Busca usa o índice `pg_trgm` (já criado no schema),
//  que suporta busca parcial em nome/código via ilike.
// ================================================================

import supabase from './supabaseClient.js';
import { buscarTodos } from './consulta.js';
import { carregarScript, plural } from './ui.js';

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
    .order('codigo_produto')
    .limit(1);    // o banco não deixa repetir; um cadastro antigo com repetição não trava a leitura

  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

// Produto com este código na empresa, ativo ou não (para explicar o
// "código repetido" quando o outro está inativo)
export async function buscarCadastroPorCodigo(empresaId, codigo) {
  const { data, error } = await supabase.from('produtos')
    .select('id, codigo_produto, nome_produto, ativo')
    .eq('empresa_id', empresaId).eq('codigo_produto', String(codigo).trim().toUpperCase())
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

// ─────────────────────────────────────────────────────────────
//  listarCatalogo(empresaId) — os produtos ativos da empresa. A contagem
//  guarda essa lista e procura nela, sem depender da rede a cada leitura.
// ─────────────────────────────────────────────────────────────
export async function listarCatalogo(empresaId) {
  return buscarTodos(() => supabase
    .from('produtos')
    .select('id, codigo_produto, nome_produto, unidade_medida, codigo_barras')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('codigo_produto'));
}

const _sem = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// Código de barras ou código do produto, exatos
export function acharNoCatalogo(catalogo, codigo) {
  const c = String(codigo ?? '').trim();
  if (!c) return null;
  return catalogo.find(p => p.codigo_barras === c) ?? catalogo.find(p => p.codigo_produto === c.toUpperCase()) ?? null;
}

// Como buscarProdutoUnificado, no catálogo: exato primeiro; depois nome ou
// código que contêm o termo, sem diferença de acento e maiúscula (até 10)
export function buscarNoCatalogo(catalogo, termo) {
  const exato = acharNoCatalogo(catalogo, termo);
  if (exato) return [exato];
  const t = _sem(termo);
  if (!t) return [];
  return catalogo
    .filter(p => _sem(p.nome_produto).includes(t) || _sem(p.codigo_produto).includes(t))
    .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    .slice(0, 10);
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
//  lerPlanilha(arquivo) → { linhas, colunas }
//  Lê a primeira aba de um .xlsx com o ExcelJS. Cada linha vem com o
//  número real dela na planilha (n), para os avisos apontarem a linha
//  certa mesmo com linhas em branco no meio.
//  colunas: quais campos opcionais existem no cabeçalho.
// ─────────────────────────────────────────────────────────────
const CDN_EXCEL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

export async function lerPlanilha(arquivo) {
  const ExcelJS = await carregarScript(CDN_EXCEL, 'ExcelJS');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { linhas: [], colunas: { unidade: false, codigo_barras: false } };
  const texto = v => {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') return v.richText ? v.richText.map(t => t.text).join('') : String(v.text ?? v.result ?? '');
    return String(v);
  };
  const cabecalho = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { cabecalho[col] = texto(c.value).trim(); });
  const linhas = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: true }, (c, col) => { if (cabecalho[col]) obj[cabecalho[col]] = texto(c.value).trim(); });
    if (Object.values(obj).some(Boolean)) linhas.push({ ...normalizarLinhaPlanilha(obj), n });
  });
  const tem = campo => cabecalho.some(h => h && SINONIMOS[campo].includes(_chave(h)));
  return { linhas, colunas: { unidade: tem('unidade'), codigo_barras: tem('codigo_barras') } };
}

// ─────────────────────────────────────────────────────────────
//  importarProdutosExcel(empresaId, linhas, usuarioId, opções)
//
//  linhas = [{ codigo, nome, unidade, codigo_barras, n }] (de lerPlanilha;
//  n é a linha na planilha). Grava em lotes de 500 (upsert pelo código),
//  com uma consulta só para saber quais códigos já existem.
//  Só os campos que existem na planilha são gravados, e uma célula vazia
//  não apaga o que já está cadastrado: reimportar só código e nome não
//  some com a unidade nem com o código de barras.
//  opções: { aoProgredir(feitos, total), totalLinhas, ignoradas: [{ n, motivo }] }
//  Retorna { criados, atualizados, erros: [{ linha, motivo }] }
// ─────────────────────────────────────────────────────────────
const LOTE = 500;

export async function importarProdutosExcel(empresaId, linhas, usuarioId, { aoProgredir, totalLinhas = linhas.length, ignoradas = [] } = {}) {
  const erros = [], porCodigo = new Map();
  linhas.forEach((bruta, i) => {
    const l = normalizarLinhaPlanilha(bruta);
    const linha = bruta.n ?? i + 2;
    const codigo = l.codigo.toUpperCase();
    if (!codigo || !l.nome) { erros.push({ linha, motivo: !codigo ? 'sem código' : 'sem nome' }); return; }
    const payload = { empresa_id: empresaId, codigo_produto: codigo, nome_produto: l.nome, ativo: true };
    if (l.unidade) payload.unidade_medida = l.unidade.toUpperCase();
    if (l.codigo_barras) payload.codigo_barras = l.codigo_barras;
    porCodigo.set(codigo, { linha, payload });   // código repetido: vale a última linha (a prévia da tela já deixa só a primeira)
  });

  const jaExistem = new Set((await buscarTodos(() => supabase.from('produtos')
    .select('codigo_produto').eq('empresa_id', empresaId).order('codigo_produto'))).map(p => p.codigo_produto));

  const lista = [...porCodigo.values()];
  let criados = 0, atualizados = 0, feitos = 0;
  const contar = x => { if (jaExistem.has(x.payload.codigo_produto)) atualizados++; else criados++; };
  // Num envio em lote, campo ausente vira vazio no banco: agrupa as linhas
  // pelos campos que têm, e cada grupo vai num envio próprio
  const gravar = itens => supabase.from('produtos').upsert(itens.map(x => x.payload), { onConflict: 'empresa_id,codigo_produto' });
  const grupos = new Map();
  for (const x of lista) {
    const chave = Object.keys(x.payload).sort().join(',');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(x);
  }

  aoProgredir?.(0, lista.length);
  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i += LOTE) {
      const lote = grupo.slice(i, i + LOTE);
      const { error } = await gravar(lote);
      if (!error) lote.forEach(contar);
      else if (/fetch|network|load failed/i.test(error.message)) {
        throw new Error(`Sem conexão com o servidor no meio da importação: ${plural(criados + atualizados, 'produto foi gravado', 'produtos foram gravados')} até aqui. Importe a planilha de novo quando a internet voltar; o que já foi gravado só é atualizado.`);
      } else {
        // Lote recusado: refaz linha a linha, para dizer qual linha tem problema
        for (const x of lote) {
          const { error: e } = await gravar([x]);
          if (e) erros.push({ linha: x.linha, motivo: _motivoProduto(e, x.payload) }); else contar(x);
        }
      }
      feitos += lote.length;
      aoProgredir?.(feitos, lista.length);
    }
  }
  erros.sort((a, b) => a.linha - b.linha);

  // Registro da importação (se falhar, a importação em si já está feita)
  const { error: eLog } = await supabase.from('importacoes_produtos').insert([{
    empresa_id:   empresaId,
    usuario_id:   usuarioId,
    total_linhas: totalLinhas,
    criados, atualizados,
    erros:        erros.length + ignoradas.length,
    detalhes:     erros.length || ignoradas.length ? [...ignoradas.map(x => ({ linha: x.n, motivo: x.motivo })), ...erros] : null,
  }]);
  if (eLog) console.warn('[produtos] Registro da importação não gravado:', eLog.message);

  return { criados, atualizados, erros };
}

// Motivo legível de uma linha recusada pelo banco
function _motivoProduto(e, payload) {
  if (/produtos_barras_unico|codigo_barras/i.test(e.message)) {
    return payload.codigo_barras
      ? `código de barras ${payload.codigo_barras} já é de outro produto ativo`
      : `o produto ${payload.codigo_produto} estava inativo e o código de barras dele hoje é de outro produto ativo`;
  }
  if (/duplicate|23505/i.test(e.message)) return `código ${payload.codigo_produto} repetido`;
  return e.message;
}

// ─────────────────────────────────────────────────────────────
//  listarParaConferencia(empresaId) — todos os produtos da empresa,
//  ativos e inativos, com o código de barras: a prévia da importação
//  confere código de barras repetido e produto que vai ser reativado.
// ─────────────────────────────────────────────────────────────
export async function listarParaConferencia(empresaId) {
  return buscarTodos(() => supabase
    .from('produtos')
    .select('id, codigo_produto, nome_produto, codigo_barras, ativo')
    .eq('empresa_id', empresaId)
    .order('codigo_produto'));
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

  // Códigos que já existem no destino serão atualizados (e reativados), não criados
  const existentes = await buscarTodos(() => supabase.from('produtos').select('codigo_produto, codigo_barras, ativo').eq('empresa_id', destinoId).order('codigo_produto'));
  const noDestino = new Map(existentes.map(p => [p.codigo_produto, p]));
  // Código de barras que no destino já é de outro produto ativo não é
  // copiado (o banco recusaria): o produto fica com o que já tinha, se esse
  // estiver livre, ou sem código de barras
  const donoDoEan = new Map(existentes.filter(p => p.ativo && p.codigo_barras).map(p => [p.codigo_barras, p.codigo_produto]));
  const livre = (ean, codigo) => !ean || !donoDoEan.has(ean) || donoDoEan.get(ean) === codigo;
  let semEan = 0;
  for (const n of novos) {
    if (livre(n.codigo_barras, n.codigo_produto)) continue;
    const antigo = noDestino.get(n.codigo_produto)?.codigo_barras ?? null;
    n.codigo_barras = livre(antigo, n.codigo_produto) ? antigo : null;
    semEan++;
  }

  // upsert para não duplicar por código, em lotes; um lote recusado é
  // refeito linha a linha, para só as linhas com problema ficarem de fora
  const gravar = itens => supabase.from('produtos').upsert(itens, { onConflict: 'empresa_id,codigo_produto', ignoreDuplicates: false });
  let gravados = 0;
  const erros = [], foraDoAr = /fetch|network|load failed/i;
  for (let i = 0; i < novos.length; i += LOTE) {
    const lote = novos.slice(i, i + LOTE);
    const { error } = await gravar(lote);
    if (!error) { gravados += lote.length; continue; }
    if (foraDoAr.test(error.message)) {
      if (!gravados) throw new Error(error.message);
      throw Object.assign(new Error(`A clonagem parou no meio, sem conexão: ${plural(gravados, 'produto já foi copiado', 'produtos já foram copiados')}. Tente de novo; o que já foi copiado só é atualizado.`), { parcial: true });
    }
    for (const n of lote) {
      const { error: e } = await gravar([n]);
      if (e) erros.push({ codigo: n.codigo_produto, motivo: _motivoProduto(e, n) }); else gravados++;
    }
  }
  const ok = novos.filter(p => !erros.some(e => e.codigo === p.codigo_produto));
  const atualizados = ok.filter(p => noDestino.has(p.codigo_produto)).length;
  return { criados: ok.length - atualizados, atualizados, semEan, erros };
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
const _chave = k => String(k).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function normalizarLinhaPlanilha(linha) {
  const chave = _chave;
  const porChave = Object.fromEntries(Object.entries(linha).map(([k, v]) => [chave(k), v]));
  const pegar = campo => String(SINONIMOS[campo].map(s => porChave[s]).find(v => v !== undefined && v !== '') ?? '').trim();
  return { codigo: pegar('codigo'), nome: pegar('nome'), unidade: pegar('unidade'), codigo_barras: pegar('codigo_barras') };
}

// Vírgula, parênteses e asterisco têm significado no filtro or() do PostgREST
function _termoSeguro(q) {
  return String(q ?? '').replace(/[,()*%\\:]/g, ' ').replace(/\s+/g, ' ').trim();
}
