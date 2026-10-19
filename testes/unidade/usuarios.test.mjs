// Quem pode cadastrar quem (regras da Edge Function) e o cadastro pelo app.
import './ambiente.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarPedido, normalizarPedido, traduzirErroAuth } from '../../supabase/functions/criar-usuario/regras.js';

const { default: supabase } = await import('../../js/supabaseClient.js');
const { criarUsuario } = await import('../../js/usuarios.js');

const banco = () => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
const pedido = extra => normalizarPedido({ nome: 'Ana', email: 'Ana@Empresa.com ', senha: '123456', role: 'auditor', empresa_id: 'e1', ...extra });

test('regras de cadastro', () => {
  const supremo = { role: 'supremo', empresa_id: null, ativo: true };
  const admin = { role: 'administrador', empresa_id: 'e1', ativo: true };
  assert.equal(validarPedido(supremo, pedido({ role: 'administrador' })), null);
  assert.equal(validarPedido(admin, pedido()), null);
  assert.equal(validarPedido(admin, pedido({ role: 'administrador' })).status, 403);
  assert.equal(validarPedido(admin, pedido({ empresa_id: 'e2' })).erro, 'Você só cadastra pessoas da sua empresa.');
  assert.equal(validarPedido({ role: 'auditor', empresa_id: 'e1', ativo: true }, pedido()).status, 403);
  assert.equal(validarPedido({ ...supremo, ativo: false }, pedido()).status, 403);
  assert.equal(validarPedido(null, pedido()).status, 403);
  assert.equal(validarPedido(supremo, pedido({ email: 'sem-arroba' })).status, 400);
  assert.equal(validarPedido(supremo, pedido({ senha: '12345' })).status, 400);
  assert.equal(validarPedido(supremo, pedido({ role: 'dono' })).status, 400);
  assert.equal(pedido().email, 'ana@empresa.com');
});

test('cadastra pela Edge Function e recusa e-mail repetido', async () => {
  const { id } = await criarUsuario({ nome: ' Carla Souza ', email: 'carla@exemplo.com', senha: 'segredo', role: 'auditor', empresa_id: null });
  const u = banco().usuarios.find(x => x.id === id);
  assert.deepEqual([u.nome, u.email, u.role, u.ativo], ['Carla Souza', 'carla@exemplo.com', 'auditor', true]);
  await assert.rejects(criarUsuario({ nome: 'Outra', email: 'CARLA@exemplo.com', senha: 'segredo', role: 'auditor' }), /Já existe um usuário com este e-mail/);
});

test('sem a Edge Function publicada, recusa e não tenta o signUp do navegador', async () => {
  const invoke = supabase.functions.invoke, signUp = supabase.auth.signUp;
  let chamouSignUp = false;
  supabase.auth.signUp = async () => { chamouSignUp = true; return { data: { user: null }, error: null }; };
  supabase.functions.invoke = async () => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
    { name: 'FunctionsHttpError', context: new Response('{"message":"Requested function was not found"}', { status: 404 }) }) });
  try {
    await assert.rejects(criarUsuario({ nome: 'Davi', email: 'davi@exemplo.com', senha: 'segredo', role: 'visualizador' }), /criar-usuario não está publicada/);
    assert.equal(chamouSignUp, false, 'o cadastro não pode cair no signUp do navegador');
    assert.equal(banco().usuarios.some(x => x.email === 'davi@exemplo.com'), false);
  } finally { supabase.functions.invoke = invoke; supabase.auth.signUp = signUp; }
});

test('o código do navegador não usa signUp', () => {
  for (const f of ['js/usuarios.js', 'js/supabaseClient.js', 'js/telas/usuarios.js', 'js/auth.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'), /\.signUp\(|criarClienteIsolado/, f);
  }
});

test('erro da Edge Function chega com a mensagem dela', async () => {
  const original = supabase.functions.invoke;
  supabase.functions.invoke = async () => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
    { name: 'FunctionsHttpError', context: new Response('{"erro":"Seu perfil não pode cadastrar usuários."}', { status: 403 }) }) });
  try {
    await assert.rejects(criarUsuario({ nome: 'Eva', email: 'eva@exemplo.com', senha: 'segredo', role: 'auditor' }), /Seu perfil não pode cadastrar usuários/);
  } finally { supabase.functions.invoke = original; }
});

test('falha passageira da Edge Function não cai no cadastro pelo navegador', async () => {
  const original = supabase.functions.invoke;
  supabase.functions.invoke = async () => ({ data: null, error: Object.assign(new Error('Relay Error invoking the Edge Function'), { name: 'FunctionsRelayError' }) });
  try { await assert.rejects(criarUsuario({ nome: 'Íris', email: 'iris@exemplo.com', senha: 'segredo', role: 'auditor' }), /não respondeu/); }
  finally { supabase.functions.invoke = original; }
});

test('mensagens do Supabase Auth em português', () => {
  assert.equal(traduzirErroAuth('Password should be at least 8 characters.'), 'A senha precisa ter pelo menos 8 caracteres.');
  assert.match(traduzirErroAuth('Password is known to be weak and easy to guess'), /fraca/);
  assert.equal(traduzirErroAuth('User already registered'), 'Já existe um usuário com este e-mail.');
  assert.match(traduzirErroAuth('Unable to validate email address: invalid format'), /e-mail/);
  assert.match(traduzirErroAuth('algo novo'), /resposta do Supabase: algo novo/);
});

test('nenhum erro registrado pelo app', () => assert.deepEqual(globalThis.errosDoApp, []));
