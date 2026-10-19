// ================================================================
//  AudiStock — js/usuarios.js
//  Cadastro de pessoas: o acesso (Supabase Auth) e o perfil (tabela
//  usuarios).
//
//  O único caminho é a Edge Function criar-usuario, que usa a chave de
//  serviço no servidor. O signUp do navegador não é usado: com ele, o
//  cadastro aberto do Supabase precisaria ficar ligado. Na demonstração,
//  a função é simulada por js/demo.js.
// ================================================================

import supabase from './supabaseClient.js';

// A Edge Function respondeu com erro: a mensagem vem no corpo ({ erro })
async function _mensagemDaFuncao(error) {
  try {
    const corpo = await error.context?.clone?.().json?.();
    if (corpo?.erro) return corpo.erro;
  } catch (_) { /* corpo sem JSON */ }
  return error.message;
}

// A função ainda não foi publicada no projeto (404). Uma falha do
// repasse (FunctionsRelayError) é passageira e tem mensagem própria.
function _funcaoIndisponivel(error) {
  return error?.context?.status === 404;
}

// ─────────────────────────────────────────────────────────────
//  criarUsuario({ nome, email, senha, role, empresa_id }) → { id }
// ─────────────────────────────────────────────────────────────
export async function criarUsuario({ nome, email, senha, role, empresa_id = null }) {
  const pedido = { nome: nome.trim(), email: email.trim().toLowerCase(), senha, role, empresa_id: empresa_id || null };

  const { data, error } = await supabase.functions.invoke('criar-usuario', { body: pedido });
  if (!error) return data;
  if (error.name === 'FunctionsFetchError') throw new Error('Failed to fetch');
  if (error.name === 'FunctionsRelayError') throw new Error('A função criar-usuario não respondeu agora. Tente de novo em instantes.');
  if (_funcaoIndisponivel(error)) throw new Error('A função criar-usuario não está publicada neste projeto do Supabase. Publique-a para cadastrar pessoas (veja docs/teste-real.md).');
  throw new Error(await _mensagemDaFuncao(error));
}
