// ================================================================
//  AudiStock — js/ui.js  v5
//  Layout (menu lateral, topo, faixa da demonstração), tema, avisos,
//  carregamento, modais acessíveis, formatadores e pequenos utilitários.
// ================================================================

import { logout, getPerfil } from './auth.js';
import { demoAtivo, avisosDaDemo } from './demo.js';

// erros.js chama isto no primeiro erro não tratado da página
window.__avisarErro = () => showToast('Algo falhou nesta tela. Os detalhes ficaram no registro de erros, em Configurações.', 'error', 9000,
    { acao: { texto: 'Ver registro', href: 'app.html?tela=config#tErros' } });

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS = {
    marca:      svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>'),
    dashboard:  svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    empresas:   svg('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>'),
    produtos:   svg('<path d="m7.5 4.3 9 5.1M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>'),
    usuarios:   svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
    auditorias: svg('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>'),
    relatorios: svg('<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>'),
    config:     svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    sair:       svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    lua:        svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    sol:        svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    menu:       svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    fechar:     svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    voltar:     svg('<path d="m15 18-6-6 6-6"/>'),
    chevron:    svg('<path d="m6 9 6 6 6-6"/>'),
    mais:       svg('<path d="M12 5v14M5 12h14"/>'),
    ok:         svg('<path d="M20 6 9 17l-5-5"/>'),
    alerta:     svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>'),
    erro:       svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
    info:       svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
    baixar:     svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
    imprimir:   svg('<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    busca:      svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
};

const NAV = [
    { itens: [ { label: 'Dashboard', icon: 'dashboard', tela: 'dashboard' } ] },
    { secao: 'Auditoria', itens: [
        { label: 'Auditorias', icon: 'auditorias', tela: 'auditorias' },
        { label: 'Relatórios', icon: 'relatorios', tela: 'relatorios' },
    ] },
    { secao: 'Cadastros', papeis: ['supremo', 'administrador'], itens: [
        { label: 'Empresas', icon: 'empresas', tela: 'empresas' },
        { label: 'Produtos', icon: 'produtos', tela: 'produtos' },
        { label: 'Usuários', icon: 'usuarios', tela: 'usuarios' },
    ] },
    { secao: 'Sistema', itens: [ { label: 'Configurações', icon: 'config', tela: 'config' } ] },
];

export const NOMES_PAPEL = { supremo: 'Supremo', administrador: 'Administrador', auditor: 'Auditor', visualizador: 'Visualizador' };

// ─────────────────────────────────────────────────────────────
//  Layout
// ─────────────────────────────────────────────────────────────
export function initLayout(titulo, { ativa = null } = {}) {
    initTheme();
    const perfil = getPerfil();
    const nomeCurto = perfil?.nome?.split(' ').slice(0, 2).join(' ') ?? '—';

    const nav = NAV.filter(g => !g.papeis || g.papeis.includes(perfil?.role)).map(g => `
        <div class="nav-grupo">
            ${g.secao ? `<div class="nav-secao">${escapeHtml(g.secao)}</div>` : ''}
            ${g.itens.map(i => `
                <a class="nav-item" href="app.html?tela=${i.tela}" data-tela="${i.tela}" ${i.tela === ativa ? 'aria-current="page"' : ''}>
                    ${ICONS[i.icon]}<span>${escapeHtml(i.label)}</span>
                </a>`).join('')}
        </div>`).join('');

    const sidebar = `
        <aside class="sidebar" id="sidebar" aria-label="Menu principal">
            <div class="sidebar-marca">
                <span class="marca-icone">${ICONS.marca}</span>
                <span class="marca-nome">AudiStock</span>
                <button type="button" class="btn-icone sidebar-fechar" onclick="window.__layoutFecharSidebar()" aria-label="Fechar menu">${ICONS.fechar}</button>
            </div>
            <nav class="sidebar-nav">${nav}</nav>
            <div class="sidebar-rodape">
                <div class="usuario">
                    <span class="avatar" aria-hidden="true">${escapeHtml(perfil?.nome?.charAt(0)?.toUpperCase() ?? '?')}</span>
                    <span class="usuario-info">
                        <span class="usuario-nome" id="usuarioNome">${escapeHtml(nomeCurto)}</span>
                        <span class="usuario-papel">${escapeHtml(NOMES_PAPEL[perfil?.role] ?? '—')}</span>
                    </span>
                    <button type="button" class="btn-icone" onclick="window.__layoutLogout()" aria-label="Sair" title="Sair">${ICONS.sair}</button>
                </div>
            </div>
        </aside>
        <div class="sidebar-overlay" id="sidebarOverlay" onclick="window.__layoutFecharSidebar()"></div>`;

    if (demoAtivo() && !document.querySelector('.demo-bar')) {
        document.body.classList.add('com-demo');
        document.body.insertAdjacentHTML('afterbegin', `
        <div class="demo-bar" role="note">
            <span><strong>Demonstração</strong><span class="demo-bar-longo"> · dados fictícios, nada é gravado de verdade</span></span>
            <button type="button" class="link" onclick="window.__layoutLogout()">Sair da demonstração</button>
        </div>`);
    }
    // Avisos da demonstração: cópia do banco que não coube na aba nova,
    // banco que passou do espaço do navegador
    if (demoAtivo()) {
        setTimeout(() => avisosDaDemo().forEach(m => showToast(m, 'warning', 10000)), 0);
        if (!window.__avisoDemoLigado) {
            window.__avisoDemoLigado = true;
            window.addEventListener('audistock:demo-aviso', e => showToast(e.detail, 'warning', 10000));
        }
    }

    const topo = `
        <div class="offline-bar" id="offlineBar" role="status" aria-live="polite"></div>
        <header class="topbar">
            <button type="button" class="btn-icone btn-hamburger" id="btnMenu" onclick="window.__layoutToggleSidebar()" aria-label="Abrir menu" aria-expanded="false" aria-controls="sidebar">${ICONS.menu}</button>
            <h1 class="topbar-titulo" id="topbarTitle" tabindex="-1">${escapeHtml(titulo ?? '')}</h1>
            <button type="button" class="btn-icone" id="btnTema" onclick="window.__layoutToggleTheme()"></button>
        </header>`;

    const shell = document.getElementById('appShell');
    if (shell) {
        shell.insertAdjacentHTML('afterbegin', sidebar);
        const main = document.createElement('div');
        main.className = 'main';
        main.innerHTML = topo + '<main class="page-content" id="pageContent" tabindex="-1"></main>';
        // Pelo teclado, pula o menu e vai direto ao conteúdo
        document.body.insertAdjacentHTML('afterbegin', '<a class="pular" href="#pageContent">Pular para o conteúdo</a>');
        document.querySelector('.pular').addEventListener('click', e => { e.preventDefault(); document.getElementById('pageContent')?.focus(); });
        shell.appendChild(main);
        const corpo = document.getElementById('pageBody');
        if (corpo) document.getElementById('pageContent').appendChild(corpo);
    }
    _garantirCamadas();
    _applyTheme(_temaAtual());
    definirTitulo(titulo);

    window.__layoutLogout        = () => _sair();
    window.__layoutToggleSidebar = () => toggleSidebar();
    window.__layoutFecharSidebar = () => fecharSidebar();
    window.__layoutToggleTheme   = () => toggleTheme();
}

// Contagens guardadas sem internet ainda não enviadas: avisa antes de sair
async function _sair() {
    const demo = demoAtivo();
    try {
        const { resumoFila } = await import('./offline.js');
        const { meus } = await resumoFila();
        if (meus) {
            const ok = await fmConfirm({
                titulo: `${plural(meus, 'contagem ainda não foi enviada', 'contagens ainda não foram enviadas')}`,
                msg: demo ? 'Elas estão guardadas só neste aparelho e são apagadas ao sair da demonstração.'
                    : 'Elas ficam guardadas neste aparelho e só são enviadas quando você entrar de novo. Se outra pessoa entrar aqui, elas continuam esperando por você.',
                confirmTxt: 'Sair mesmo assim', cancelTxt: 'Continuar aqui', tipo: 'perigo' });
            if (!ok) return;
        }
    } catch (_) {}
    // Sem internet a tela de entrada não carrega: a demonstração segue funcionando
    if (demo && !navigator.onLine) { showToast('Sem internet agora: a tela de entrada não carrega. A demonstração continua funcionando aqui.', 'warning', 6000); return; }
    if (!demo && !navigator.onLine) {
        // A tela de entrada não carrega sem internet: a página fica, mas
        // sem nada para usar, para ninguém contar em nome de quem saiu
        await logout();
        document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
        document.querySelector('.sidebar')?.setAttribute('inert', '');
        const corpo = document.getElementById('pageBody');
        if (corpo) corpo.innerHTML = `<div class="card">${vazioHtml({ titulo: 'Você saiu deste aparelho', texto: 'A tela de entrada abre sozinha quando a internet voltar. As contagens guardadas aqui continuam esperando você entrar de novo.' })}</div>`;
        document.getElementById('offlineBar')?.classList.remove('visible');
        return;
    }
    logout();
}

export function definirTitulo(titulo, ativa) {
    const el = document.getElementById('topbarTitle');
    if (el && titulo) el.textContent = titulo;
    if (titulo) document.title = `${titulo} · AudiStock`;
    if (ativa !== undefined) {
        document.querySelectorAll('.nav-item').forEach(a => {
            if (a.dataset.tela === ativa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
    }
}

function _garantirCamadas() {
    if (!document.getElementById('loadingOverlay')) {
        document.body.insertAdjacentHTML('beforeend', `<div class="loading-overlay" id="loadingOverlay" role="status" aria-live="polite"><div class="carregando"><span class="spinner"></span><span id="loadingTexto">Carregando…</span></div></div>`);
    }
    if (!document.getElementById('toasts')) {
        document.body.insertAdjacentHTML('beforeend', `<div class="toasts" id="toasts"></div>
            <div class="sr-only anuncios" id="anuncio" role="status" aria-live="polite"></div>
            <div class="sr-only anuncios" id="anuncioUrgente" role="alert"></div>`);
    }
}

// Leitor de tela: lê a mensagem pela região viva (polida ou urgente)
// Mensagens que chegam juntas são lidas juntas (a segunda não apaga a primeira)
const _anuncios = { polido: [], urgente: [] };
export function anunciar(msg, urgente = false) {
    _garantirCamadas();
    const tipo = urgente ? 'urgente' : 'polido';
    const fila = _anuncios[tipo];
    fila.push(msg);
    if (fila.length > 1) return;
    const alvo = document.getElementById(urgente ? 'anuncioUrgente' : 'anuncio');
    alvo.textContent = '';
    setTimeout(() => { alvo.textContent = fila.join(' '); fila.length = 0; }, 80);
}

export function toggleSidebar() {
    const s = document.getElementById('sidebar');
    if (!s) return;
    s.classList.contains('open') ? fecharSidebar() : abrirSidebar();
}
function abrirSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('visible');
    document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'true');
    document.getElementById('btnMenu')?.setAttribute('aria-label', 'Fechar menu');
    setTimeout(() => document.querySelector('#sidebar .nav-item')?.focus(), 50);
}
export function fecharSidebar() {
    const aberta = document.getElementById('sidebar')?.classList.contains('open');
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('visible');
    const btn = document.getElementById('btnMenu');
    btn?.setAttribute('aria-expanded', 'false');
    btn?.setAttribute('aria-label', 'Abrir menu');
    if (aberta && window.innerWidth <= 900) btn?.focus();
}
document.addEventListener('click', e => { if (window.innerWidth <= 900 && e.target.closest('.nav-item')) fecharSidebar(); });
document.addEventListener('keydown', e => {
    const s = document.getElementById('sidebar');
    if (!s?.classList.contains('open') || document.querySelector('.modal-backdrop')) return;
    if (e.key === 'Escape') { fecharSidebar(); return; }
    // Menu do celular aberto: o Tab fica dentro dele
    if (e.key === 'Tab' && window.innerWidth <= 900) {
        const focaveis = [...s.querySelectorAll('a[href], button:not([disabled])')].filter(x => x.offsetParent !== null);
        const [primeiro, ultimo] = [focaveis[0], focaveis[focaveis.length - 1]];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
        else if (!s.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
    }
});

// ─────────────────────────────────────────────────────────────
//  Tema: o salvo; na primeira visita, o do sistema operacional
// ─────────────────────────────────────────────────────────────
function _temaAtual() {
    let salvo = null;
    try { salvo = localStorage.getItem('audistock-theme'); } catch (_) {}
    if (salvo === 'light' || salvo === 'dark') return salvo;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
export function initTheme() { _applyTheme(_temaAtual()); }
window.addEventListener?.('storage', e => {
    if (e.key === 'audistock-theme' && (e.newValue === 'light' || e.newValue === 'dark')) _applyTheme(e.newValue);
});
export function toggleTheme() {
    const proximo = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    _applyTheme(proximo);
    try { localStorage.setItem('audistock-theme', proximo); } catch (_) {}
}
function _applyTheme(tema) {
    document.documentElement.dataset.theme = tema;
    const btn = document.getElementById('btnTema');
    if (btn) {
        const rotulo = tema === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
        btn.innerHTML = tema === 'light' ? ICONS.lua : ICONS.sol;
        btn.setAttribute('aria-label', rotulo);
        btn.title = rotulo;
    }
}

// ─────────────────────────────────────────────────────────────
//  Avisos (toasts)
// ─────────────────────────────────────────────────────────────
const TIPO_TOAST = { success: ['sucesso', ICONS.ok], error: ['erro', ICONS.erro], warning: ['aviso', ICONS.alerta], info: ['info', ICONS.info] };

export function showToast(msg, tipo = 'success', duracao = 4000, { acao = null } = {}) {
    _garantirCamadas();
    const [classe, icone] = TIPO_TOAST[tipo] ?? TIPO_TOAST.info;
    const el = document.createElement('div');
    el.className = `toast toast-${classe}`;
    const link = acao ? `<a href="${escapeHtml(acao.href)}">${escapeHtml(acao.texto)}</a>` : '';
    el.innerHTML = `<span class="toast-icone">${icone}</span><span class="toast-msg">${escapeHtml(msg)}${link}</span>
        <button type="button" class="btn-icone toast-fechar" aria-label="Fechar aviso">${ICONS.fechar}</button>`;
    let timer = null, restante = duracao, inicio = Date.now(), pausado = false;
    const sair = () => { clearTimeout(timer); el.classList.remove('show'); setTimeout(() => el.remove(), 200); };
    const pausar = () => { if (pausado) return; pausado = true; clearTimeout(timer); restante -= Date.now() - inicio; };
    const seguir = () => {
        if (!pausado || el.matches(':hover') || el.contains(document.activeElement)) return;
        pausado = false; inicio = Date.now(); timer = setTimeout(sair, Math.max(restante, 1500));
    };
    el.addEventListener('mouseenter', pausar);
    el.addEventListener('mouseleave', seguir);
    el.addEventListener('focusin', pausar);
    el.addEventListener('focusout', () => setTimeout(seguir, 0));
    el.querySelector('.toast-fechar').onclick = sair;
    document.getElementById('toasts').appendChild(el);
    anunciar(acao ? `${msg} ${acao.texto}` : msg, tipo === 'error');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    timer = setTimeout(sair, duracao);
}

// ─────────────────────────────────────────────────────────────
//  Carregamento: só aparece se a espera passar de 200 ms
// ─────────────────────────────────────────────────────────────
let _timerLoading = null;
export function showLoading(texto = 'Carregando…') {
    _garantirCamadas();
    document.getElementById('loadingTexto').textContent = texto;
    clearTimeout(_timerLoading);
    _timerLoading = setTimeout(() => document.getElementById('loadingOverlay')?.classList.add('active'), 200);
}
export function hideLoading() {
    clearTimeout(_timerLoading);
    document.getElementById('loadingOverlay')?.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────
//  Modais
//  abrirModal({ titulo, subtitulo, corpo, acoes, largura, aoEnviar, aoFechar })
//   - corpo: HTML; o conteúdo vai dentro de um <form>, então Enter envia
//   - acoes: [{ texto, classe, tipo:'submit'|'button', acao(modal), id }]
//   - aoEnviar(modal): chamado no submit (Enter ou botão submit)
//  Esc e clique no fundo fecham só o modal de cima. O foco fica preso
//  dentro dele e volta ao botão que o abriu.
// ─────────────────────────────────────────────────────────────
const _pilha = [];
const _saindo = new Set();   // fechadas, ainda na animação de saída
let _seqModal = 0;

// Com um modal aberto, o resto da página fica inerte: fora do Tab, do
// clique e do leitor de tela. Os avisos e as regiões de anúncio ficam de fora.
function _atualizarFundo() {
    const topo = _pilha[_pilha.length - 1];
    for (const el of document.body.children) {
        if (el.matches('script, #toasts, .anuncios, .loading-overlay')) continue;
        if (topo && el !== topo.fundo) { if (!el.inert) { el.inert = true; el.dataset.inerteModal = ''; } }
        else if ('inerteModal' in el.dataset) { el.inert = false; delete el.dataset.inerteModal; }
    }
}

// Depois de salvar, a tela costuma redesenhar a lista e o botão que abriu o
// modal some. O foco vai para o botão equivalente da lista nova (mesma ação,
// mesmo id); se a linha saiu da lista, vai para o conteúdo da página.
function _seletorDe(el) {
    if (!el || el === document.body || !el.dataset) return null;
    if (el.dataset.acao) return `[data-acao="${CSS.escape(el.dataset.acao)}"]${el.dataset.id ? `[data-id="${CSS.escape(el.dataset.id)}"]` : ''}`;
    return el.id ? `#${CSS.escape(el.id)}` : null;
}
function _devolverFoco(origem) {
    const seletor = _seletorDe(origem);
    if (origem?.isConnected) origem.focus({ preventScroll: true });
    const perdido = () => !document.activeElement || document.activeElement === document.body;
    let n = 0, vigia = null, rolou = false;
    // Clicou, ou teclou com o foco num elemento que escolheu: o foco agora é
    // da pessoa. Rolou a página (roda, toque, teclas de rolagem): o foco
    // ainda volta para a linha, mas sem rolar a página de volta até ela.
    const rolar = () => { rolou = true; };
    const tecla = e => {
        if (/^(Arrow|Page)|^(Home|End| )$/.test(e.key)) rolou = true;
        else if (!perdido() && document.activeElement !== origem) parar();
    };
    const parar = () => {
        clearInterval(vigia);
        document.removeEventListener('pointerdown', parar, true);
        document.removeEventListener('keydown', tecla, true);
        document.removeEventListener('wheel', rolar, true);
        document.removeEventListener('touchmove', rolar, true);
    };
    document.addEventListener('pointerdown', parar, true);
    document.addEventListener('keydown', tecla, true);
    document.addEventListener('wheel', rolar, { capture: true, passive: true });
    document.addEventListener('touchmove', rolar, { capture: true, passive: true });
    vigia = setInterval(() => {
        if (_pilha.length || ++n > 40) { parar(); return; }
        if (!perdido()) return;
        const novo = seletor && document.querySelector(seletor);
        if (novo) { novo.focus({ preventScroll: true }); if (!rolou) novo.scrollIntoView({ block: 'nearest' }); }
        else if (n >= 10) document.getElementById('topbarTitle')?.focus({ preventScroll: true });   // a linha saiu da lista
    }, 50);
}

// Fecha tudo (troca de tela pelo menu ou pelo Voltar do navegador)
export function fecharModais() {
    while (_pilha.length) _pilha[_pilha.length - 1].fechar(false, { semFoco: true, navegando: true });
}

// Antes de trocar de tela com uma janela aberta: a que está gravando não
// fecha (quem chama desfaz a navegação); a que tem algo digitado pergunta
// antes de descartar. Retorna se pode seguir.
export async function liberarParaNavegar() {
    if (!_pilha.length) return true;
    if (_pilha.some(m => m.travado)) {
        showToast('Aguarde: a janela aberta ainda está gravando.', 'warning', 4000);
        return false;
    }
    if (_pilha.some(m => m.estaAlterado?.())) {
        const ok = await fmConfirm({ titulo: 'Descartar o que foi preenchido?', msg: 'O que você digitou na janela aberta será perdido.', confirmTxt: 'Descartar', cancelTxt: 'Continuar editando', tipo: 'perigo' });
        if (!ok) return false;
    }
    fecharModais();
    return true;
}

// Fechar ou recarregar a página com uma janela gravando pergunta antes
const _avisarSaida = e => { if (_pilha.some(m => m.travado)) { e.preventDefault(); e.returnValue = ''; } };
window.addEventListener?.('beforeunload', _avisarSaida);

export function abrirModal({ titulo, subtitulo = '', corpo = '', acoes = [], largura = 'md', aoEnviar = null, aoFechar = null, papel = 'dialog' } = {}) {
    const id = `modal${++_seqModal}`;
    const origem = document.activeElement;
    const fundo = document.createElement('div');
    fundo.className = 'modal-backdrop';
    fundo.innerHTML = `
        <form class="modal modal-${largura}" role="${papel}" aria-modal="true" aria-labelledby="${id}t" ${subtitulo ? `aria-describedby="${id}s"` : ''} novalidate>
            <div class="modal-cab">
                <div>
                    <h2 class="modal-titulo" id="${id}t">${escapeHtml(titulo)}</h2>
                    ${subtitulo ? `<p class="modal-sub" id="${id}s">${subtitulo}</p>` : ''}
                </div>
                <button type="button" class="btn-icone modal-x" data-fechar aria-label="Fechar">${ICONS.fechar}</button>
            </div>
            <div class="modal-corpo">${corpo}</div>
            ${acoes.length ? `<div class="modal-rodape">${acoes.map((a, i) => `<button type="${a.tipo ?? 'button'}" class="btn ${a.classe ?? 'btn-secondary'}" data-i="${i}" ${a.id ? `id="${a.id}"` : ''}>${escapeHtml(a.texto)}</button>`).join('')}</div>` : ''}
        </form>`;

    const form = fundo.querySelector('form');
    const modal = {
        el: form, fundo,
        // navegando: fechada pela troca de tela (o aoFechar não deve mexer
        // no endereço nem na tela que está saindo)
        fechar(resultado, { semFoco = false, navegando = false } = {}) {
            const i = _pilha.indexOf(modal);
            if (!fundo.isConnected || i < 0) return;
            _pilha.splice(i, 1);
            fundo.classList.remove('active');
            fundo.inert = true;                 // some do leitor de tela já, não depois da animação
            _atualizarFundo();
            _saindo.add(fundo);
            setTimeout(() => { fundo.remove(); _saindo.delete(fundo); }, 150);
            if (!semFoco) _devolverFoco(origem);
            aoFechar?.(resultado, { navegando });
        },
        $: sel => form.querySelector(sel),
        // Durante a gravação, nada fecha a janela: nem Cancelar, nem o X, nem Esc ou clique fora
        ocupado(sim, texto) {
            modal.travado = sim;
            form.querySelectorAll('.modal-rodape .btn:not([type=submit]), [data-fechar]').forEach(b => { b.disabled = sim; });
            const b = form.querySelector('[type=submit]');
            if (!b) return;
            b.disabled = sim;
            if (sim) { b.dataset.texto = b.textContent; if (texto) b.textContent = texto; }
            else if (b.dataset.texto) b.textContent = b.dataset.texto;
        },
    };

    // Esc, X e clique fora perguntam antes de descartar o que foi digitado
    let alterado = false;
    form.addEventListener('input', () => { alterado = true; });
    modal.semAlteracoes = () => { alterado = false; };
    modal.estaAlterado = () => alterado;
    modal.dispensar = async () => {
        if (modal.travado) return;
        if (alterado && !form.querySelector('[type=submit]:disabled')) {
            const ok = await fmConfirm({ titulo: 'Descartar o que foi preenchido?', msg: 'O que você digitou nesta janela será perdido.', confirmTxt: 'Descartar', cancelTxt: 'Continuar editando', tipo: 'perigo' });
            if (!ok) return;
        }
        modal.fechar(false);
    };

    form.addEventListener('submit', e => { e.preventDefault(); aoEnviar?.(modal); });
    form.addEventListener('click', e => {
        if (e.target.closest('[data-fechar]')) { modal.dispensar(); return; }
        const b = e.target.closest('.modal-rodape [data-i]');
        if (b && b.type !== 'submit') acoes[b.dataset.i].acao?.(modal);
    });
    // Fecha pelo fundo só se o clique começou e terminou nele (arrastar seleção de texto não fecha)
    let inicioNoFundo = false;
    fundo.addEventListener('mousedown', e => { inicioNoFundo = e.target === fundo; });
    fundo.addEventListener('click', e => { if (e.target === fundo && inicioNoFundo) modal.dispensar(); });

    // A janela anterior que ainda está saindo sai já: as duas teriam campos com
    // os mesmos ids, e um rótulo da nova apontaria para o campo da que está saindo
    _saindo.forEach(f => f.remove()); _saindo.clear();
    document.body.appendChild(fundo);
    _pilha.push(modal);
    _atualizarFundo();
    requestAnimationFrame(() => fundo.classList.add('active'));
    setTimeout(() => {
        // Se alguém já está num campo da janela (digitação rápida, leitor de código), não rouba o foco
        if (form.contains(document.activeElement)) return;
        const alvo = form.querySelector('[data-foco]') || form.querySelector('input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea') || form.querySelector('.modal-rodape [type=submit]') || form.querySelector('.modal-rodape .btn');
        alvo?.focus();
    }, 60);
    return modal;
}

document.addEventListener('keydown', e => {
    const topo = _pilha[_pilha.length - 1];
    if (!topo) return;
    if (e.key === 'Escape') { e.preventDefault(); topo.dispensar(); return; }
    if (e.key === 'Tab') {
        const focaveis = [...topo.el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
        if (!focaveis.length) return;
        const [primeiro, ultimo] = [focaveis[0], focaveis[focaveis.length - 1]];
        if (!topo.el.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus(); }
        else if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
});

// Confirmação. Em ação perigosa o foco começa em "Cancelar", para um Enter distraído não apagar nada.
export function fmConfirm({ titulo = 'Confirmar', msg = '', confirmTxt = 'Confirmar', cancelTxt = 'Cancelar', tipo = 'info' } = {}) {
    return new Promise(resolve => {
        let ok = false;
        const perigo = tipo === 'perigo';
        const m = abrirModal({
            titulo, largura: 'sm', papel: 'alertdialog',
            corpo: msg ? `<p class="modal-texto">${escapeHtml(msg)}</p>` : '',
            acoes: [
                { texto: cancelTxt, classe: 'btn-secondary', acao: m => m.fechar(false) },
                { texto: confirmTxt, classe: perigo ? 'btn-danger' : 'btn-primary', tipo: 'submit' },
            ],
            aoEnviar: m => { ok = true; m.fechar(true); },
            aoFechar: () => resolve(ok),
        });
        if (perigo) setTimeout(() => m.$('.modal-rodape .btn-secondary')?.focus(), 80);
    });
}


// ─────────────────────────────────────────────────────────────
//  Selos
// ─────────────────────────────────────────────────────────────
const selo = (classe, texto) => `<span class="badge ${classe}">${escapeHtml(texto)}</span>`;
export function badgeStatus(status) {
    return { em_andamento: selo('badge-aviso', 'Em andamento'), finalizada: selo('badge-sucesso', 'Finalizada'), cancelada: selo('badge-neutro', 'Cancelada') }[status] ?? selo('badge-neutro', status);
}
export function badgeRole(role) { return selo(role === 'supremo' ? 'badge-acento' : 'badge-neutro', NOMES_PAPEL[role] ?? role); }
export function badgeSituacao(diferenca) {
    if (diferenca == null) return selo('badge-neutro', 'Sem saldo');
    const d = Number(diferenca);
    return d > 0 ? selo('badge-sucesso', 'Sobra') : d < 0 ? selo('badge-perigo', 'Falta') : selo('badge-calmo', 'OK');
}

// ─────────────────────────────────────────────────────────────
//  Estado vazio
// ─────────────────────────────────────────────────────────────
export function vazioHtml({ titulo, texto = '', textoHtml = '', acoes = '', compacto = false }) {
    const corpo = textoHtml || escapeHtml(texto);
    return `<div class="vazio${compacto ? ' vazio-compacto' : ''}">
        <p class="vazio-titulo">${escapeHtml(titulo)}</p>
        ${corpo ? `<p class="vazio-texto">${corpo}</p>` : ''}
        ${acoes ? `<div class="vazio-acoes">${acoes}</div>` : ''}
    </div>`;
}
export function erroCargaHtml(acao = 'location.reload()') {
    return vazioHtml({ titulo: 'Não foi possível carregar', texto: 'Verifique a conexão e tente de novo.', acoes: `<button type="button" class="btn btn-secondary btn-sm" onclick="${acao}">Tentar de novo</button>`, compacto: true });
}

// ─────────────────────────────────────────────────────────────
//  Formatadores
// ─────────────────────────────────────────────────────────────
const fmtD  = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtH  = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
export function fmtDate(iso)     { return !iso ? '—' : fmtD.format(new Date(iso)); }
export function fmtDateTime(iso) { return !iso ? '—' : `${fmtD.format(new Date(iso))} ${fmtH.format(new Date(iso))}`; }
export function fmtInt(n) { return Number(n ?? 0).toLocaleString('pt-BR'); }

// Unidades fracionadas sempre com 3 casas (15,730 kg), para a vírgula alinhar
// e "1,288" nunca ser lido como mil duzentos e oitenta e oito.
const FRACIONADAS = new Set(['KG', 'G', 'L', 'LT', 'ML', 'M', 'M2', 'M3', 'TON']);
// Quantidade digitada em pt-BR: "1.234" é mil duzentos e trinta e quatro,
// "1,5" é um e meio. Unidade inteira (UN, PCT…) não aceita fração. Em
// unidade fracionada, "1.234" tanto pode ser mil quanto 1,234 kg: a pessoa
// escolhe, em vez de o sistema adivinhar (com dois pontos ou mais, só pode
// ser milhar). No máximo 3 casas decimais e menos de 100 bilhões, o limite
// do banco: um código de barras lido no campo errado é recusado aqui.
// Retorna { vazio: true } | { valor } | { erro }.
export function lerQuantidade(txt, un) {
    const b = String(txt ?? '').trim().replace(/\s/g, '');
    if (!b) return { vazio: true };
    const formato = 'Use só números, com vírgula para decimais.';
    if (!/^[0-9.,]+$/.test(b) || (b.match(/,/g) ?? []).length > 1) return { erro: formato };
    const milhar = !b.includes(',') && /^\d{1,3}(\.\d{3})+$/.test(b);
    // Com vírgula, o ponto só pode separar milhares: "1.2,5" é erro de digitação, não 12,5
    if (b.includes(',') && b.includes('.') && !/^\d{1,3}(\.\d{3})+,\d*$/.test(b)) return { erro: 'O ponto só separa milhares (1.234,5). Confira o número.' };
    if (milhar && b.split('.').length === 2 && un && casasDaUnidade(un) > 0) return { erro: `Use vírgula para decimais (${b.replace('.', ',')}) ou escreva sem ponto (${b.replace('.', '')}).` };
    const n = b.includes(',') ? Number(b.replace(/\./g, '').replace(',', '.'))
        : milhar ? Number(b.replace(/\./g, ''))
        : Number(b);
    if (!Number.isFinite(n)) return { erro: formato };
    const decimais = b.includes(',') ? b.split(',')[1].length : milhar ? 0 : (b.split('.')[1] ?? '').length;
    if (decimais > 3) return { erro: 'Use no máximo 3 casas decimais.' };
    if (n >= 1e11) return { erro: 'Quantidade grande demais. Confira se o leitor não leu um código de barras neste campo.' };
    if (un && casasDaUnidade(un) === 0 && !Number.isInteger(n)) return { erro: `${String(un).toUpperCase()} não aceita frações.` };
    return { valor: Math.round(n * 1000) / 1000 };
}
// Valor num campo editável: sem separador de milhar ("1.234" seria lido de outro jeito)
export function fmtEntrada(n, un) {
    if (n == null || n === '') return '';
    const c = casasDaUnidade(un);
    return Number(n).toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: c, maximumFractionDigits: Math.max(c, 3) });
}
export function casasDaUnidade(un) { return FRACIONADAS.has(String(un ?? '').toUpperCase()) ? 3 : 0; }
export function fmtQtd(n, un) {
    if (n == null || n === '') return '—';
    const c = casasDaUnidade(un);
    const inteiro = c === 0 && !Number.isInteger(Number(n));
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : c, maximumFractionDigits: inteiro ? 3 : c });
}
export function fmtDif(n, un) {
    if (n == null || n === '') return '—';
    const d = Number(n);
    return (d > 0 ? '+' : d < 0 ? '−' : '') + fmtQtd(Math.abs(d), un);
}
export function unHtml(un) { return un ? ` <span class="un">${escapeHtml(String(un).toUpperCase())}</span>` : ''; }
export function qtdHtml(n, un) { return n == null ? '—' : `<span class="nowrap">${fmtQtd(n, un)}${unHtml(un)}</span>`; }
export function difHtml(n, un) {
    if (n == null) return '<span class="dif-nula">—</span>';
    const d = Number(n);
    if (d === 0) return '<span class="dif-zero">0</span>';
    return `<span class="nowrap"><span class="${d > 0 ? 'dif-sobra' : 'dif-falta'}">${fmtDif(d, un)}</span>${unHtml(un)}</span>`;
}
export function plural(n, um, varios) { return `${fmtInt(n)} ${Number(n) === 1 ? um : varios}`; }

// ─────────────────────────────────────────────────────────────
//  Utilitários
// ─────────────────────────────────────────────────────────────
export function escapeHtml(str) {
    return str == null ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function normalizar(s) { return String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim(); }
export function debounce(fn, delay = 300) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }

// Um único ouvinte por contêiner: <button data-acao="editar" data-id="…">.
// Evita passar nomes por onclick (um apóstrofo quebrava o botão).
export function delegarAcoes(raiz, mapa) {
    raiz.addEventListener('click', e => {
        const alvo = e.target.closest('[data-acao]');
        if (!alvo || !raiz.contains(alvo) || !mapa[alvo.dataset.acao]) return;
        e.preventDefault();
        mapa[alvo.dataset.acao](alvo.dataset, alvo, e);
    });
}

export function renderUserCard(perfil) {
    const el = document.getElementById('usuarioNome');
    if (el && perfil?.nome) el.textContent = perfil.nome.split(' ').slice(0, 2).join(' ');
}

// Bibliotecas pesadas (planilha, PDF) só são baixadas quando usadas
const _scripts = {};
// Hash de cada biblioteca baixada na hora (os oficiais do cdnjs): se o
// arquivo no CDN mudar, o navegador recusa e nada roda.
const INTEGRIDADE = {
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js': 'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js': 'sha512-2/YdOMV+YNpanLCF5MdQwaoFRVbTmrJ4u4EpqS/USXAQNUDgI5uwYi6J98WVtJKcfe1AbgerygzDFToxAlOGEQ==',
    'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js': 'sha512-dlPw+ytv/6JyepmelABrgeYgHI0O+frEwgfnPdXDTOIZz+eDgfW07QXG02/O8COfivBdGNINy+Vex+lYmJ5rxw==',
};

export function carregarScript(url, global) {
    if (global && window[global]) return Promise.resolve(window[global]);
    _scripts[url] ??= new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = url; s.crossOrigin = 'anonymous'; s.dataset.opcional = '1';
        if (INTEGRIDADE[url]) s.integrity = INTEGRIDADE[url];
        s.onload = () => ok(global ? window[global] : true);
        s.onerror = () => { delete _scripts[url]; s.remove(); falha(new Error('Não foi possível carregar um componente necessário. Verifique a conexão e tente de novo.')); };
        document.head.appendChild(s);
    });
    return _scripts[url];
}

// Mensagens do banco e da rede em português; o texto original vai para o console
export function mensagemErro(err, contexto = '') {
    const m = String(err?.message ?? err ?? '');
    const mapa = [
        [/duplicate key|23505/i, 'Já existe um registro com esses dados.'],
        [/Failed to fetch|NetworkError|network/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.'],
        [/JSON object requested|no\) rows/i, 'Registro não encontrado. Ele pode ter sido excluído.'],
        [/permission denied|row-level security|42501/i, 'Você não tem permissão para esta ação.'],
        [/JWT|token/i, 'Sua sessão expirou. Entre de novo.'],
    ];
    const achado = mapa.find(([re]) => re.test(m));
    if (achado) { console.warn('[AudiStock]', contexto, m); return achado[1]; }
    // Erro de programação (TypeError, ReferenceError…) ou texto técnico em inglês
    // não vai para a tela: fica no registro de erros e no console.
    const tecnico = err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError
        || !/[áàâãéêíóôõúç]|\b(não|nao|já|para|com|sem|de)\b/i.test(m);
    if (tecnico) {
        console.error('[AudiStock]', contexto, err);
        window.__registrarErro?.('tratado', `${contexto ? contexto + ': ' : ''}${m}`, err?.stack ?? '');
        return 'Ocorreu um erro inesperado. Os detalhes ficaram no registro de erros, em Configurações.';
    }
    return m;
}

// Trechos de uma linha de detalhes ("código · unidade · EAN"). No celular a
// quebra cai entre os trechos, e o "·" nunca fica sozinho no fim da linha.
// Cada trecho é um texto (HTML) ou { html, classe }.
export function partesHtml(partes) {
    return `<span class="partes">${partes.filter(Boolean).map(p => typeof p === 'string' ? `<span>${p}</span>` : `<span class="${p.classe}">${p.html}</span>`).join('')}</span>`;
}

// E-mail que pode quebrar só depois do "@"
export const emailHtml = email => escapeHtml(email ?? '').replace('@', '@<wbr>');

// Erro de validação junto do campo (e não num aviso que some e cobre os botões no celular)
export function marcarInvalido(campo, msg) {
    campo.setAttribute('aria-invalid', 'true');
    const grupo = campo.closest('.form-group') ?? campo.parentElement;
    let erro = grupo.querySelector(':scope > .form-erro');
    if (!erro) {
        erro = document.createElement('span');
        erro.className = 'form-erro';
        erro.id = `${campo.id || 'campo'}Erro`;
        grupo.appendChild(erro);
    }
    erro.textContent = msg;
    campo.setAttribute('aria-describedby', [campo.getAttribute('aria-describedby'), erro.id].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' '));
    campo.addEventListener('input', () => limparInvalido(campo), { once: true });
    campo.addEventListener('change', () => limparInvalido(campo), { once: true });
}
export function limparInvalido(campo) {
    campo.removeAttribute('aria-invalid');
    const erro = (campo.closest('.form-group') ?? campo.parentElement).querySelector(':scope > .form-erro');
    if (erro) erro.textContent = '';
}
