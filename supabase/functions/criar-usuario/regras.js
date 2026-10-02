// ================================================================
//  AudiStock — supabase/functions/criar-usuario/regras.js
//  Quem pode cadastrar quem. JavaScript puro, sem dependências: a Edge
//  Function (Deno), o modo demonstração (navegador) e os testes (Node)
//  usam este mesmo arquivo.
// ================================================================

export const PAPEIS = ['supremo', 'administrador', 'auditor', 'visualizador'];

/**
 * Limpa o corpo do pedido.
 * @param {any} corpo
 * @returns {{ nome: string, email: string, senha: string, role: string, empresa_id: string | null }}
 */
export function normalizarPedido(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  return {
    nome: String(c.nome ?? '').trim(),
    email: String(c.email ?? '').trim().toLowerCase(),
    senha: String(c.senha ?? ''),
    role: String(c.role ?? ''),
    empresa_id: c.empresa_id ? String(c.empresa_id) : null,
  };
}

/**
 * Confere se quem chama pode fazer este cadastro.
 * @param {{ role: string, empresa_id: string | null, ativo: boolean } | null} chamador  perfil de quem está logado
 * @param {ReturnType<typeof normalizarPedido>} p
 * @returns {{ status: number, erro: string } | null}  null quando pode
 */
export function validarPedido(chamador, p) {
  if (!chamador || !chamador.ativo || !['supremo', 'administrador'].includes(chamador.role)) {
    return { status: 403, erro: 'Seu perfil não pode cadastrar usuários.' };
  }
  if (!p.nome) return { status: 400, erro: 'Informe o nome.' };
  if (!/^\S+@\S+\.\S+$/.test(p.email)) return { status: 400, erro: 'Informe um e-mail válido.' };
  if (p.senha.length < 6) return { status: 400, erro: 'A senha precisa ter pelo menos 6 caracteres.' };
  if (!PAPEIS.includes(p.role)) return { status: 400, erro: 'Perfil de acesso inválido.' };
  if (chamador.role === 'administrador') {
    if (!['auditor', 'visualizador'].includes(p.role)) {
      return { status: 403, erro: 'Administradores cadastram só auditores e visualizadores.' };
    }
    if (chamador.empresa_id && p.empresa_id !== chamador.empresa_id) {
      return { status: 403, erro: 'Você só cadastra pessoas da sua empresa.' };
    }
  }
  return null;
}
