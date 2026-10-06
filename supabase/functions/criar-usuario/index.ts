// ================================================================
//  AudiStock — Edge Function criar-usuario
//  Cadastra uma pessoa no Supabase Auth e o perfil dela na tabela
//  usuarios, com a chave de serviço, que nunca vai para o navegador.
//  Assim a sessão de quem está cadastrando não é trocada, e o cadastro
//  aberto pelo navegador (signUp) pode ficar desligado.
//
//  Publicar:  supabase functions deploy criar-usuario
//  O Supabase já fornece SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
// ================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizarPedido, validarPedido, traduzirErroAuth } from './regras.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder(405, { erro: 'Use POST.' });

  const servico = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Quem está pedindo: o token de quem está logado no AudiStock
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quem, error: eQuem } = await servico.auth.getUser(token);
  if (eQuem || !quem?.user) return responder(401, { erro: 'Sua sessão expirou. Entre de novo.' });

  const { data: chamador } = await servico.from('usuarios')
    .select('role, empresa_id, ativo').eq('id', quem.user.id).maybeSingle();

  let pedido;
  try { pedido = normalizarPedido(await req.json()); }
  catch { return responder(400, { erro: 'Pedido inválido.' }); }

  const recusa = validarPedido(chamador, pedido);
  if (recusa) return responder(recusa.status, { erro: recusa.erro });

  const { data: criado, error: eCriar } = await servico.auth.admin.createUser({
    email: pedido.email, password: pedido.senha, email_confirm: true,
  });
  if (eCriar || !criado?.user) {
    const repetido = /already|registered|exists/i.test(eCriar?.message ?? '');
    return responder(repetido ? 409 : 400, { erro: traduzirErroAuth(eCriar?.message ?? '') });
  }

  const { error: ePerfil } = await servico.from('usuarios').insert({
    id: criado.user.id, nome: pedido.nome, email: pedido.email,
    role: pedido.role, empresa_id: pedido.empresa_id, ativo: true,
  });
  if (ePerfil) {
    console.error('[criar-usuario] perfil não gravado:', ePerfil.message);
    // Sem perfil, o acesso não serve para nada: desfaz
    const { error: eDesfazer } = await servico.auth.admin.deleteUser(criado.user.id);
    if (eDesfazer) {
      console.error('[criar-usuario] acesso não desfeito:', criado.user.id, eDesfazer.message);
      return responder(500, { erro: `O perfil não foi gravado e o acesso criado para ${pedido.email} não pôde ser desfeito. Apague esse e-mail em Authentication > Users, no painel do Supabase, antes de tentar de novo.` });
    }
    const motivo = /usuarios_email|duplicate/i.test(ePerfil.message) ? 'já existe um perfil com este e-mail'
      : /foreign key|empresa/i.test(ePerfil.message) ? 'a empresa escolhida não existe mais'
      : 'o banco recusou o cadastro';
    return responder(500, { erro: `Não foi possível gravar o perfil: ${motivo}. Nada foi criado; tente de novo.` });
  }

  return responder(201, { id: criado.user.id });
});
