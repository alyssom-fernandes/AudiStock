// ================================================================
//  AudiStock — js/auth.js
//  Autenticação via Supabase Auth (email + senha).
//
//  IMPORTANTE: O sistema usa Supabase Auth para autenticar o
//  usuário (JWT) e a tabela `usuarios` para dados de perfil/role.
//  O campo `usuarios.id` deve corresponder ao `auth.users.id`.
//
//  Como criar um usuário:
//  1. Supabase Dashboard > Authentication > Users > Invite user
//  2. Ou via SQL:
//     SELECT auth.sign_up('email@x.com', 'senha');
//  3. Depois insira o perfil em `usuarios`:
//     INSERT INTO usuarios (id, nome, email, role)
//     VALUES ('<uid do auth>', 'Nome', 'email@x.com', 'supremo');
// ================================================================

import supabase from './supabaseClient.js';

// ── Estado global do usuário ──────────────────────────────────
let _currentUser   = null;   // auth.User do Supabase
let _currentPerfil = null;   // linha da tabela `usuarios`
let _vigiandoSessao = false;

// ─────────────────────────────────────────────────────────────
//  login(email, senha) → { user, perfil } | lança erro
// ─────────────────────────────────────────────────────────────
export async function login(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });

  if (error) throw new Error(traduzirErroAuth(error.message));

  _currentUser = data.user;
  _currentPerfil = await carregarPerfil(data.user.id);
  window.__usuarioAtual = _currentPerfil;
  if (!_currentPerfil || !_currentPerfil.ativo) {
    await supabase.auth.signOut();
    throw new Error(_currentPerfil ? 'Sua conta está desativada. Fale com o administrador do sistema.' : 'Seu acesso ainda não foi configurado. Fale com o administrador do sistema.');
  }

  // Atualiza último acesso
  await supabase
    .from('usuarios')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', data.user.id);

  return { user: _currentUser, perfil: _currentPerfil };
}

// ─────────────────────────────────────────────────────────────
//  logout()
// ─────────────────────────────────────────────────────────────
export async function logout() {
  await supabase.auth.signOut();
  _currentUser   = null;
  _currentPerfil = null;
  window.location.href = 'login.html';
}

// ─────────────────────────────────────────────────────────────
//  getSession() → retorna a sessão ativa ou null
// ─────────────────────────────────────────────────────────────
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ─────────────────────────────────────────────────────────────
//  requireAuth() — chama no topo de cada página protegida.
//  Redireciona para login se não autenticado.
//  Retorna { user, perfil }.
// ─────────────────────────────────────────────────────────────
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  _currentUser = session.user;
  if (!_currentPerfil) {
    _currentPerfil = await carregarPerfil(session.user.id);
  }
  window.__usuarioAtual = _currentPerfil;

  // Conta sem perfil configurado, ou inativa: não entra
  if (!_currentPerfil || !_currentPerfil.ativo) {
    await supabase.auth.signOut();
    window.location.href = `login.html?erro=${_currentPerfil ? 'inativo' : 'sem-perfil'}`;
    return null;
  }

  // Saiu em outra aba, ou a sessão não pôde ser renovada: volta ao login,
  // em vez de seguir na tela recebendo "sem permissão" a cada ação
  if (!_vigiandoSessao) {
    _vigiandoSessao = true;
    supabase.auth.onAuthStateChange(evento => {
      if (evento === 'SIGNED_OUT') window.location.href = 'login.html';
    });
  }

  return { user: _currentUser, perfil: _currentPerfil };
}

// ─────────────────────────────────────────────────────────────
//  getPerfil() → retorna o perfil em cache
// ─────────────────────────────────────────────────────────────
export function getPerfil() {
  return _currentPerfil;
}

// ─────────────────────────────────────────────────────────────
//  hasRole(role) → boolean — checa permissão
//  Hierarquia: supremo > administrador > auditor > visualizador
// ─────────────────────────────────────────────────────────────
const ROLE_LEVEL = {
  supremo:       4,
  administrador: 3,
  auditor:       2,
  visualizador:  1,
};

export function hasRole(roleMinimo) {
  if (!_currentPerfil) return false;
  return (ROLE_LEVEL[_currentPerfil.role] ?? 0) >= (ROLE_LEVEL[roleMinimo] ?? 99);
}

export function isSupremo()      { return _currentPerfil?.role === 'supremo'; }
export function isAdmin()        { return hasRole('administrador'); }
export function isAuditor()      { return hasRole('auditor'); }

// ─────────────────────────────────────────────────────────────
//  INTERNO — carregarPerfil(uid)
// ─────────────────────────────────────────────────────────────
async function carregarPerfil(uid) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, role, empresa_id, ativo')
    .eq('id', uid)
    .single();

  if (error) {
    console.error('[auth] Perfil não encontrado para uid:', uid, error);
    return null;
  }
  return data;
}

// ─────────────────────────────────────────────────────────────
//  Traduz mensagens de erro do Supabase Auth para PT-BR
// ─────────────────────────────────────────────────────────────
function traduzirErroAuth(msg) {
  const map = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed':        'Confirme seu e-mail antes de entrar.',
    'User not found':             'Usuário não encontrado.',
    'Too many requests':          'Muitas tentativas. Aguarde alguns minutos.',
    'Failed to fetch':            'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  };
  for (const [en, pt] of Object.entries(map)) {
    if (msg.includes(en)) return pt;
  }
  return msg;
}
