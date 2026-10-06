// ================================================================
//  AudiStock — js/contagem.js
//  Módulo central da contagem física de estoque.
//
//  Responsabilidades:
//  - registrar item auditado (insert/update em auditoria_itens)
//  - gravar histórico de edições (auditoria_itens_historico)
//  - detectar conflito (produto já contado)
//  - suporte ao modo scanner (cada leitura soma +1)
// ================================================================

import supabase from './supabaseClient.js';
import { buscarTodos } from './consulta.js';
import { finalizarAuditoria } from './auditorias.js';

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

  if (error) throw erroDoBanco(error);
  return data;   // null se não existe ainda
}

// ─────────────────────────────────────────────────────────────
//  registrarContagem({ auditoriaId, produtoId, quantidade, usuarioId, acao })
//
//  acao: 'novo' | 'sobrescrever' | 'somar'
//
//  Usa a função registrar_contagem do banco (supabase/schema.sql), que
//  soma e grava o histórico numa só transação: leituras seguidas do
//  leitor, ou dois aparelhos no mesmo produto, nunca perdem unidades.
//  Num banco sem essa função, faz em duas etapas (ler e gravar).
// ─────────────────────────────────────────────────────────────
const _semFuncao = new Set();   // funções que o banco não tem (projeto com esquema antigo)
const _funcaoAusente = (e, nome) => e?.code === 'PGRST202' || new RegExp(`could not find the function|function .*${nome}.* does not exist`, 'i').test(e?.message ?? '');

// O erro do banco vira Error sem perder o código e o status HTTP (a fila
// sem internet decide por eles se tenta de novo depois)
export function erroDoBanco(error, status) {
  return Object.assign(new Error(error.message), { code: error.code, details: error.details, status: status ?? error.status });
}
export const JA_CONTADO = 'AS001';
const _jaContado = atual => Object.assign(new Error('Este produto já foi contado nesta auditoria.'), { code: JA_CONTADO, details: String(atual ?? '') });

export async function registrarContagem({
  auditoriaId,
  produtoId,
  quantidade,
  usuarioId,
  acao = 'novo',     // 'novo' | 'sobrescrever' | 'somar'
  idCliente = null,  // id do envio: o banco não aplica o mesmo id duas vezes
}) {
  if (!(quantidade >= 0)) throw new Error('Quantidade não pode ser negativa.');

  if (!_semFuncao.has('registrar_contagem')) {
    const { data, error, status } = await supabase.rpc('registrar_contagem', {
      p_auditoria_id: auditoriaId, p_produto_id: produtoId, p_quantidade: quantidade, p_acao: acao, p_id_cliente: idCliente,
    });
    if (!error) return Array.isArray(data) ? data[0] : data;
    if (!_funcaoAusente(error, 'registrar_contagem')) throw erroDoBanco(error, status);
    _semFuncao.add('registrar_contagem');
    console.warn('[contagem] O banco não tem a função registrar_contagem; usando o caminho em duas etapas. Veja supabase/schema.sql.');
  }

  const existente = await buscarItemContado(auditoriaId, produtoId);
  if (!existente) return await _inserirItem(auditoriaId, produtoId, quantidade, usuarioId);
  if (acao === 'novo') throw _jaContado(existente.quantidade_contada);
  const novaQtd = acao === 'somar' ? Number(existente.quantidade_contada) + quantidade : quantidade;
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
  // A função corrigir_contagem leva o motivo para o histórico, que o banco grava
  if (!_semFuncao.has('corrigir_contagem')) {
    const { data, error, status } = await supabase.rpc('corrigir_contagem', { p_item_id: itemId, p_quantidade: novaQtd, p_motivo: motivo.trim() || null });
    if (!error) return Array.isArray(data) ? data[0] : data;
    if (!_funcaoAusente(error, 'corrigir_contagem')) throw erroDoBanco(error, status);
    _semFuncao.add('corrigir_contagem');
  }

  // Banco antigo: confere, atualiza e só então grava o histórico
  const { data: item, error: errBusca } = await supabase
    .from('auditoria_itens')
    .select('id, quantidade_contada, auditoria_id')
    .eq('id', itemId)
    .single();
  if (errBusca) throw erroDoBanco(errBusca);

  const { data: aud } = await supabase.from('auditorias').select('status').eq('id', item.auditoria_id).single();
  if (aud?.status !== 'em_andamento') throw new Error('A auditoria não está em andamento: a contagem não pode mais mudar.');

  const { data, error } = await supabase
    .from('auditoria_itens')
    .update({ quantidade_contada: novaQtd, atualizado_em: new Date().toISOString() })
    .eq('id', itemId)
    .select()
    .single();
  if (error) throw erroDoBanco(error);
  await _gravarHistorico(itemId, item.quantidade_contada, novaQtd, usuarioId, motivo);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  listarItensContados(auditoriaId)
//  Todos os itens já contados, com dados do produto, do mais recente
//  (em páginas de 1.000, o limite do Supabase por consulta).
// ─────────────────────────────────────────────────────────────
export async function listarItensContados(auditoriaId) {
  const data = await buscarTodos(() => supabase
    .from('auditoria_itens')
    .select(`
      id, produto_id, quantidade_contada, estoque_sistema, diferenca, data_registro, atualizado_em,
      produtos ( id, codigo_produto, nome_produto, unidade_medida ),
      usuarios!auditoria_itens_registrado_por_fkey ( nome )
    `)
    .eq('auditoria_id', auditoriaId)
    .order('data_registro', { ascending: false })
    .order('id'));
  return { data, count: data.length };
}

// ─────────────────────────────────────────────────────────────
//  aplicarRetrato(auditoriaId, itens) → retrato | null
//  Numa auditoria encerrada, troca o código, o nome e a unidade de hoje
//  pelos do encerramento (auditoria_retratos), como no relatório: renomear
//  um produto depois não muda o que foi contado. Retorna o retrato
//  (total_produtos, nao_contados, contados) ou null se não houver.
// ─────────────────────────────────────────────────────────────
export async function aplicarRetrato(auditoriaId, itens) {
  const { data, error } = await supabase.from('auditoria_retratos')
    .select('total_produtos, contados').eq('auditoria_id', auditoriaId).maybeSingle();
  if (error) throw erroDoBanco(error);
  for (const i of itens) {
    const r = data?.contados?.[i.produto_id];
    if (r) i.produtos = { ...i.produtos, ...r };
  }
  return data;
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

  if (error) throw erroDoBanco(error);
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
  // Um update por item, no máximo 8 de cada vez: uma auditoria de 2.000
  // itens não dispara 2.000 pedidos de uma vez contra o servidor.
  const results = [];
  for (let i = 0; i < estoques.length; i += 8) {
    results.push(...await Promise.all(estoques.slice(i, i + 8).map(({ produto_id, quantidade }) =>
      supabase
        .from('auditoria_itens')
        .update({ estoque_sistema: quantidade })
        .eq('auditoria_id', auditoriaId)
        .eq('produto_id',   produto_id))));
  }
  const erros = results.filter(r => r.error);
  if (erros.length > 0) {
    console.error('[contagem] Erros ao preencher estoques:', erros);
  }
  return { ok: results.length - erros.length, erros: erros.length };
}

// ─────────────────────────────────────────────────────────────
//  finalizarComSaldos(auditoriaId, saldos, contados)
//  saldos   = { [item_id]: saldo | null } de TODOS os itens que a tela
//             mostrou (o saldo apagado vai como null e fica vazio no banco)
//  contados = { [item_id]: quantidade contada que a tela mostrou }
//
//  Usa a função finalizar_auditoria (supabase/schema.sql): grava os saldos
//  e finaliza numa só transação, e recusa se um item foi contado depois
//  que a tela abriu (ITENS_NOVOS), se algum foi recontado (RECONTADOS: a
//  diferença revisada não vale mais) ou se a auditoria já foi encerrada
//  (JA_ENCERRADA, com o status em details). Num banco sem a função,
//  confere, grava e finaliza em etapas.
// ─────────────────────────────────────────────────────────────
export const ITENS_NOVOS = 'AS002';
export const JA_ENCERRADA = 'AS003';
export const RECONTADOS = 'AS004';

export async function finalizarComSaldos(auditoriaId, saldos, contados = null) {
  if (!_semFuncao.has('finalizar_auditoria')) {
    const { data, error, status } = await supabase.rpc('finalizar_auditoria', { p_auditoria_id: auditoriaId, p_saldos: saldos, p_contados: contados });
    if (!error) return Array.isArray(data) ? data[0] : data;
    if (!_funcaoAusente(error, 'finalizar_auditoria')) throw erroDoBanco(error, status);
    _semFuncao.add('finalizar_auditoria');
    console.warn('[contagem] O banco não tem a função finalizar_auditoria; usando o caminho em etapas. Veja supabase/schema.sql.');
  }

  const { data: itens } = await listarItensContados(auditoriaId);
  const faltam = itens.filter(i => !(i.id in saldos)).length;
  if (faltam) throw Object.assign(new Error('Há itens contados que a tela de fechamento ainda não mostrava.'), { code: ITENS_NOVOS, details: String(faltam) });
  const mudaram = contados ? itens.filter(i => Number(contados[i.id]) !== Number(i.quantidade_contada)).length : 0;
  if (mudaram) throw Object.assign(new Error('Há itens recontados depois que a tela de fechamento abriu.'), { code: RECONTADOS, details: String(mudaram) });
  const r = await preencherEstoquesSistema(auditoriaId, itens.map(i => ({ produto_id: i.produto_id, quantidade: saldos[i.id] ?? null })));
  if (r.erros) throw new Error(`${r.erros === 1 ? '1 saldo não foi gravado' : `${r.erros} saldos não foram gravados`}. Nada foi finalizado; tente de novo.`);
  try { return await finalizarAuditoria(auditoriaId); }
  catch (err) {
    if (/já foi finalizada ou cancelada/.test(err.message)) throw Object.assign(err, { code: JA_ENCERRADA });
    throw err;
  }
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
      id, produto_id, quantidade_contada, estoque_sistema, diferenca, data_registro, atualizado_em,
      produtos ( id, codigo_produto, nome_produto, unidade_medida )
    `)
    .single();

  if (error) throw erroDoBanco(error);
  return data;
}

async function _atualizarItem(existente, novaQtd, usuarioId) {
  const { data, error } = await supabase
    .from('auditoria_itens')
    .update({
      quantidade_contada: novaQtd,
      atualizado_em:      new Date().toISOString(),
    })
    .eq('id', existente.id)
    .select(`
      id, produto_id, quantidade_contada, estoque_sistema, diferenca, data_registro, atualizado_em,
      produtos ( id, codigo_produto, nome_produto, unidade_medida )
    `)
    .single();

  if (error) throw erroDoBanco(error);
  // Histórico só depois que a mudança foi gravada
  await _gravarHistorico(existente.id, existente.quantidade_contada, novaQtd, usuarioId);
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

  // 42501: banco com o gatilho itens_historico, que já gravou o histórico.
  // Outra falha não bloqueia a contagem; só fica no console.
  if (error && error.code !== '42501') console.error('[contagem] Erro ao gravar histórico:', error);
}
