// ================================================================
//  AudiStock — js/login.js
//  Tela de entrada: o botão da demonstração e o formulário de login.
//  Os campos não têm "name": se o formulário for enviado antes deste
//  script carregar, nada do que foi digitado vai para o endereço.
// ================================================================

import { login } from './auth.js';
import { initTheme } from './ui.js';
import { demoAtivo } from './demo.js';
import { clienteIndisponivel } from './supabaseClient.js';

initTheme();
if (demoAtivo()) {
    document.getElementById('demoAberta').hidden = false;
    document.getElementById('blocoLogin').hidden = true;
}
const params = new URLSearchParams(location.search);
if (params.get('erro') === 'inativo') mostrarErro('Sua conta está desativada. Fale com o administrador do sistema.');
if (params.get('erro') === 'sem-perfil') mostrarErro('Seu acesso ainda não foi configurado. Fale com o administrador do sistema.');
if (clienteIndisponivel) mostrarErro('Não foi possível conectar ao servidor agora. A demonstração funciona mesmo assim.');

const email = document.getElementById('email');
const senha = document.getElementById('senha');
const btn = document.getElementById('loginBtn');

document.getElementById('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    [email, senha].forEach(c => c.removeAttribute('aria-invalid'));
    const vazio = !email.value.trim() ? email : !senha.value ? senha : null;
    if (vazio) {
        mostrarErro('Informe seu e-mail e sua senha para entrar.');
        vazio.setAttribute('aria-invalid', 'true');
        vazio.focus();
        return;
    }
    btn.disabled = true; btn.textContent = 'Entrando…'; esconderErro();
    try {
        await login(email.value.trim(), senha.value);
        window.location.href = 'app.html';
    } catch (err) {
        mostrarErro(err.message);
        btn.disabled = false; btn.textContent = 'Entrar';
    }
});

function mostrarErro(msg) { const el = document.getElementById('loginError'); el.textContent = msg; el.classList.add('visible'); }
function esconderErro() { document.getElementById('loginError').classList.remove('visible'); }
