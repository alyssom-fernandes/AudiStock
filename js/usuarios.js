// ================================================================
//  AudiStock — js/usuarios.js
//  Cadastro de pessoas: o acesso (Supabase Auth) e o perfil (tabela
//  usuarios).
//
//  O caminho certo é a Edge Function criar-usuario, que usa a chave de
//  serviço no servidor. Enquanto ela não estiver publicada, o cadastro
//  é feito por um cliente à parte (signUp), que não troca a sessão de
//  quem está cadastrando.
// ================================================================

import supabase, { criarClienteIsolado } from './supabaseClient.js';

// A Edge Function respondeu com erro: a mensagem vem no corpo ({ erro })
async function _mensagemDaFuncao(error) {
  try {
    const corpo = await error.context?.clone?.().json?.();
    if (corpo?.erro) return corpo.erro;
  } catch (_) { /* corpo sem JSON */ }
  return error.message;
}

// A função ainda não foi publicada no projeto (404) ou não responde
function _funcaoIndisponivel(error) {
  return error?.name === 'FunctionsRelayError' || error?.context?.status === 404;
}

// ─────────────────────────────────────────────────────────────
//  criarUsuario({ nome, email, senha, role, empresa_id }) → { id }
// ─────────────────────────────────────────────────────────────
export async function criarUsuario({ nome, email, senha, role, empresa_id = null }) {
  const pedido = { nome: nome.trim(), email: email.trim().toLowerCase(), senha, role, empresa_id: empresa_id || null };

  const { data, error } = await supabase.functions.invoke('criar-usuario', { body: pedido });
  if (!error) return data;
  if (error.name === 'FunctionsFetchError') throw new Error('Failed to fetch');
  if (!_funcaoIndisponivel(error)) throw new Error(await _mensagemDaFuncao(error));

  // Sem a função: acesso pelo cliente à parte, perfil pelo cliente principal
  const { data: auth, error: eAuth } = await criarClienteIsolado().auth.signUp({ email: pedido.email, password: senha });
  if (eAuth) {
    if (/registered|already/i.test(eAuth.message)) throw new Error('Já existe um usuário com este e-mail.');
    if (/signups? not allowed|disabled/i.test(eAuth.message)) throw new Error('O cadastro pelo navegador está desligado no Supabase. Publique a função criar-usuario (veja o README).');
    throw new Error(eAuth.message);
  }
  const { error: ePerfil } = await supabase.from('usuarios').insert([{
    id: auth.user.id, nome: pedido.nome, email: pedido.email, role, empresa_id: pedido.empresa_id, senha_hash: 'auth-supabase', ativo: true,
  }]);
  if (ePerfil) throw new Error(ePerfil.message);
  return { id: auth.user.id };
}
