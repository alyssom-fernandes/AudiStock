// ================================================================
//  AudiStock — js/empresas.js
//  CRUD de empresas usando Supabase diretamente.
// ================================================================

import supabase from './supabaseClient.js';

// ─────────────────────────────────────────────────────────────
//  listarEmpresas({ apenasAtivas })
//  Retorna array de empresas ordenado por nome.
//
//  Exemplo:
//    const empresas = await listarEmpresas({ apenasAtivas: true });
// ─────────────────────────────────────────────────────────────
export async function listarEmpresas({ apenasAtivas = false } = {}) {
  let query = supabase
    .from('empresas')
    .select('id, nome, cnpj, cidade, estado, ativo, criado_em')
    .order('nome');

  if (apenasAtivas) {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  buscarEmpresa(id) → objeto empresa completo
// ─────────────────────────────────────────────────────────────
export async function buscarEmpresa(id) {
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  criarEmpresa(campos) → empresa criada
//
//  campos = {
//    nome:        string (obrigatório)
//    cnpj:        string (opcional)
//    endereco:    string (opcional)
//    cidade:      string (opcional)
//    estado:      string (opcional, 2 letras)
//    observacoes: string (opcional)
//  }
// ─────────────────────────────────────────────────────────────
export async function criarEmpresa(campos) {
  const { data, error } = await supabase
    .from('empresas')
    .insert([{
      nome:        campos.nome.trim(),
      cnpj:        campos.cnpj?.trim()      || null,
      endereco:    campos.endereco?.trim()   || null,
      cidade:      campos.cidade?.trim()     || null,
      estado:      campos.estado?.trim()     || null,
      observacoes: campos.observacoes?.trim()|| null,
      ativo:       true,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  atualizarEmpresa(id, campos) → empresa atualizada
// ─────────────────────────────────────────────────────────────
export async function atualizarEmpresa(id, campos) {
  const payload = {};
  if (campos.nome        != null) payload.nome        = campos.nome.trim();
  if (campos.cnpj        != null) payload.cnpj        = campos.cnpj.trim() || null;
  if (campos.endereco    != null) payload.endereco    = campos.endereco.trim() || null;
  if (campos.cidade      != null) payload.cidade      = campos.cidade.trim() || null;
  if (campos.estado      != null) payload.estado      = campos.estado.trim() || null;
  if (campos.observacoes != null) payload.observacoes = campos.observacoes.trim() || null;
  if (campos.ativo       != null) payload.ativo       = campos.ativo;

  const { data, error } = await supabase
    .from('empresas')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────
//  alternarStatusEmpresa(id) → empresa com ativo invertido
// ─────────────────────────────────────────────────────────────
export async function alternarStatusEmpresa(id) {
  // Busca o status atual primeiro
  const empresa = await buscarEmpresa(id);
  return atualizarEmpresa(id, { ativo: !empresa.ativo });
}

// ─────────────────────────────────────────────────────────────
//  contarProdutosPorEmpresa(empresaId) → número inteiro
//  Útil para exibir na listagem de empresas.
// ─────────────────────────────────────────────────────────────
export async function contarProdutosPorEmpresa(empresaId) {
  const { count, error } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('ativo', true);

  if (error) return 0;
  return count ?? 0;
}
