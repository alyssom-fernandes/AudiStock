// ================================================================
//  AudiStock — js/app.js
//  Roteador do app.html: cada ?tela= é um módulo em js/telas/.
//  Links "app.html?tela=…" navegam sem recarregar (e continuam
//  abrindo em nova aba com Ctrl+clique).
// ================================================================

import { requireAuth, getPerfil, hasRole } from './auth.js';
import { initLayout, definirTitulo, vazioHtml, mensagemErro } from './ui.js';
import * as dashboard from './telas/dashboard.js';
import * as auditorias from './telas/auditorias.js';
import * as auditoria from './telas/auditoria.js';
import * as empresas from './telas/empresas.js';
import * as produtos from './telas/produtos.js';
import * as usuarios from './telas/usuarios.js';
import * as relatorios from './telas/relatorios.js';
import * as config from './telas/config.js';

const auth = await requireAuth();
if (!auth) throw new Error('Não autenticado');

const TELAS = {
  dashboard:  { titulo: 'Dashboard',     mod: dashboard },
  auditorias: { titulo: 'Auditorias',    mod: auditorias },
  historico:  { titulo: 'Auditoria',     mod: auditoria, ativa: 'auditorias' },
  empresas:   { titulo: 'Empresas',      mod: empresas,  papel: 'administrador' },
  produtos:   { titulo: 'Produtos',      mod: produtos,  papel: 'administrador' },
  usuarios:   { titulo: 'Usuários',      mod: usuarios,  papel: 'administrador' },
  relatorios: { titulo: 'Relatórios',    mod: relatorios },
  config:     { titulo: 'Configurações', mod: config },
};

initLayout('Dashboard');
const pageBody = document.getElementById('pageBody');
let _seq = 0;

// substituir: troca a entrada atual do histórico (o Voltar não cai, por
// exemplo, nos detalhes de uma auditoria que acabou de ser excluída)
export function irPara(tela, params = {}, { substituir = false } = {}) {
  const url = new URL('app.html', location.href);
  url.searchParams.set('tela', tela);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  history[substituir ? 'replaceState' : 'pushState']({}, '', url);
  rotear();
}

async function rotear() {
  const params = new URLSearchParams(location.search);
  const nome = TELAS[params.get('tela')] ? params.get('tela') : 'dashboard';
  const tela = TELAS[nome];
  definirTitulo(tela.titulo, tela.ativa ?? nome);

  // Cada navegação ganha um contêiner novo: uma tela antiga que ainda
  // esteja carregando escreve no contêiner descartado, não na tela atual.
  const el = document.createElement('div');
  pageBody.replaceChildren(el);
  const minha = ++_seq;
  window.scrollTo(0, 0);

  if (tela.papel && !hasRole(tela.papel)) {
    el.innerHTML = `<div class="card">${vazioHtml({ titulo: 'Acesso restrito', texto: 'Esta área é só para administradores. Fale com quem administra o sistema se precisar dela.', acoes: '<a class="btn btn-secondary" href="app.html?tela=dashboard">Ir para o Dashboard</a>' })}</div>`;
    return;
  }
  try {
    await tela.mod.render(el, { perfil: getPerfil(), params, irPara, atual: () => minha === _seq });
  } catch (err) {
    if (minha !== _seq) return;
    console.error(err);
    window.__registrarErro?.('tela', `${nome}: ${err.message}`, err.stack);
    el.innerHTML = `<div class="card">${vazioHtml({ titulo: 'Não foi possível abrir esta tela', texto: mensagemErro(err), acoes: '<button type="button" class="btn btn-secondary" onclick="location.reload()">Tentar de novo</button>' })}</div>`;
  }
}

window.addEventListener('popstate', rotear);
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="app.html?"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || a.target) return;
  e.preventDefault();
  history.pushState({}, '', a.href);
  rotear();
});

window.irPara = irPara;
rotear();
