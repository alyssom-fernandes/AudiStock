// ================================================================
//  AudiStock — js/ui.js  v2.0
//  Fusão de ui.js + _layout.js
//  Utilitários de UI: toasts, loading, tema, sidebar, layout,
//  modais fmConfirm/fmAlert, formatadores, debounce.
//  Importado por todos os módulos de página.
// ================================================================

import { logout, getPerfil, hasRole } from './auth.js';

// ─────────────────────────────────────────────────────────────
//  SVG ICONS — centralizados para uso na sidebar e outros locais
// ─────────────────────────────────────────────────────────────
const ICONS = {
    dashboard:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    empresas:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
    produtos:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    usuarios:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    auditorias:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>`,
    contagem:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    relatorios:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    config:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    logout:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    menu:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    close:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    sun:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    moon:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
};

// ─────────────────────────────────────────────────────────────
//  DEFINIÇÃO DO MENU DE NAVEGAÇÃO
// ─────────────────────────────────────────────────────────────
// tela: nome da tela no app.html (?tela=X)
// page: usado para marcar item ativo (sempre 'app.html')
// externo: true = link direto para outro arquivo (contagem, relatorios)
const NAV_ITEMS = [
    { section: 'Principal' },
    { label: 'Dashboard',     icon: 'dashboard',  tela: 'dashboard',  visible: () => true },
    { divider: true },
    { section: 'Cadastros' },
    { label: 'Empresas',      icon: 'empresas',   tela: 'empresas',   visible: (p) => ['supremo','administrador'].includes(p.role) },
    { label: 'Produtos',      icon: 'produtos',   tela: 'produtos',   visible: (p) => ['supremo','administrador'].includes(p.role) },
    { label: 'Usuários',      icon: 'usuarios',   tela: 'usuarios',   visible: (p) => ['supremo','administrador'].includes(p.role) },
    { divider: true },
    { section: 'Auditoria' },
    { label: 'Auditorias',    icon: 'auditorias', tela: 'auditorias', visible: () => true },
    { label: 'Contagem',      icon: 'contagem',   tela: 'auditorias', visible: (p) => ['supremo','administrador','auditor'].includes(p.role) },
{ label: 'Relatórios',    icon: 'relatorios', tela: 'relatorios',      visible: () => true },
    { divider: true },
    { section: 'Sistema' },
    { label: 'Configurações', icon: 'config',     tela: 'config',     visible: () => true },
];

// ─────────────────────────────────────────────────────────────
//  initLayout(titulo)
//  Injeta sidebar + topbar + overlays em cada página protegida.
//  Chame após requireAuth().
// ─────────────────────────────────────────────────────────────
export function initLayout(titulo) {
    initTheme();

    const perfil = getPerfil();
    const pagina = location.pathname.split('/').pop() || 'dashboard.html';

    // ── Sidebar ──
    const sidebarHtml = `
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-brand">
                <div class="brand-icon">${ICONS.produtos}</div>
                <div class="brand-name">Audi<span>Stock</span></div>
                <button class="btn-fechar-sidebar" onclick="window.__layoutFecharSidebar()" aria-label="Fechar menu">
                    ${ICONS.close}
                </button>
            </div>

            <nav class="sidebar-nav" id="sidebarNav">
                ${_buildNavHtml(perfil, pagina)}
            </nav>

            <div class="sidebar-footer">
                <div class="user-card" onclick="window.__layoutLogout()">
                    <div class="avatar">${escapeHtml(perfil?.nome?.charAt(0) ?? '?')}</div>
                    <div class="user-info">
                        <div class="user-name">${escapeHtml(perfil?.nome?.split(' ')[0] ?? '—')}</div>
                        <div class="user-role">${escapeHtml(perfil?.role ?? '—')}</div>
                    </div>
                </div>
            </div>
        </aside>

        <div class="sidebar-overlay" id="sidebarOverlay" onclick="window.__layoutFecharSidebar()"></div>`;

    // ── Topbar ──
    const topbarHtml = `
        <div class="offline-bar" id="offlineBar"></div>
        <header class="topbar">
            <button class="btn-hamburger" onclick="window.__layoutToggleSidebar()" aria-label="Menu">
                ${ICONS.menu}
            </button>
            <span class="topbar-title" id="topbarTitle">${escapeHtml(titulo ?? document.title)}</span>
            <div class="topbar-actions">
                <span class="topbar-datetime" id="topbarDatetime"></span>
                <div class="topbar-sep"></div>
                <button class="topbar-btn" onclick="window.__layoutToggleTheme()" id="btnTema" title="Alternar tema">
                    ${ICONS.moon}
                </button>
                <button class="topbar-btn" onclick="window.__layoutLogout()" title="Sair">
                    ${ICONS.logout}
                </button>
            </div>
        </header>`;

    // ── Monta a estrutura no shell ──
    const shell = document.getElementById('appShell');
    if (shell) {
        shell.insertAdjacentHTML('afterbegin', sidebarHtml);

        const main = document.createElement('div');
        main.className = 'main';
        main.id = 'main';
        main.innerHTML = topbarHtml +
            '<div class="page-content" id="pageContent"></div>';

        shell.appendChild(main);

        // Move o pageBody para dentro do pageContent
        const content = document.getElementById('pageBody');
        if (content) {
            document.getElementById('pageContent').appendChild(content);
        }
    }

    // ── Loading overlay ──
    if (!document.getElementById('loadingOverlay')) {
        document.body.insertAdjacentHTML('beforeend',
            `<div class="loading-overlay" id="loadingOverlay"><div class="spinner"></div></div>`
        );
    }
    // ── Toast container ──
    if (!document.getElementById('toasts')) {
        document.body.insertAdjacentHTML('beforeend', `<div class="toasts" id="toasts"></div>`);
    }

    // ── Relógio ──
    _iniciarRelogio();

    // ── Expõe handlers globais ──
    window.__layoutLogout          = () => logout();
    window.__layoutToggleSidebar   = () => toggleSidebar();
    window.__layoutFecharSidebar   = () => fecharSidebar();
    window.__layoutToggleTheme     = () => toggleTheme();
}

// ─────────────────────────────────────────────────────────────
//  _buildNavHtml — monta o HTML da navegação
// ─────────────────────────────────────────────────────────────
function _buildNavHtml(perfil, paginaAtual) {
    let html = '<div class="nav-section">';
    let emSection = false;

    for (const item of NAV_ITEMS) {
        // Separador de seção
        if (item.section) {
            if (emSection) html += '</div>';
            html += `<div class="nav-section"><div class="nav-label">${escapeHtml(item.section)}</div>`;
            emSection = true;
            continue;
        }
        // Divisor visual
        if (item.divider) {
            html += `<div class="nav-divider"></div>`;
            continue;
        }
        // Item de navegação
        if (!item.visible(perfil)) continue;

        const isInterna = !!item.tela;
        const href  = isInterna ? `app.html?tela=${item.tela}` : item.href;
        const ativo = isInterna && paginaAtual.includes(`tela=${item.tela}`) ? 'active'
                    : !isInterna && paginaAtual === item.href ? 'active' : '';
        html += `
            <a class="nav-item ${ativo}" href="${href}"
               ${isInterna ? `data-tela="${item.tela}"` : ''}>
                <span class="icon">${ICONS[item.icon] ?? ''}</span>
                <span class="nav-item-label">${escapeHtml(item.label)}</span>
            </a>`;
    }

    html += '</div>';
    return html;
}

// ─────────────────────────────────────────────────────────────
//  RELÓGIO no topbar
// ─────────────────────────────────────────────────────────────
function _iniciarRelogio() {
    function atualizar() {
        const el = document.getElementById('topbarDatetime');
        if (!el) return;
        const agora = new Date();
        const data  = agora.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
        const hora  = agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
        el.textContent = `${data} · ${hora}`;
    }
    atualizar();
    setInterval(atualizar, 1000);
}

// ─────────────────────────────────────────────────────────────
//  SIDEBAR
// ─────────────────────────────────────────────────────────────
export function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    if (!s) return;
    const aberta = s.classList.contains('open');
    if (aberta) {
        s.classList.remove('open');
        o?.classList.remove('visible');
    } else {
        s.classList.add('open');
        o?.classList.add('visible');
    }
}

export function fecharSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('visible');
}

// Fecha sidebar ao clicar em item (mobile)
document.addEventListener('click', function(e) {
    if (window.innerWidth <= 768 && e.target.closest('.nav-item')) {
        fecharSidebar();
    }
});

// ─────────────────────────────────────────────────────────────
//  TEMA CLARO / ESCURO
// ─────────────────────────────────────────────────────────────
export function initTheme() {
    const saved = localStorage.getItem('audistock-theme') || 'dark';
    _applyTheme(saved);
}

export function toggleTheme() {
    const atual = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next  = atual === 'dark' ? 'light' : 'dark';
    _applyTheme(next);
    localStorage.setItem('audistock-theme', next);
}

function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
    const btn = document.getElementById('btnTema');
    if (btn) btn.innerHTML = theme === 'light' ? ICONS.moon : ICONS.sun;
}

// ─────────────────────────────────────────────────────────────
//  TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
let _toastContainer = null;

function _getToastContainer() {
    if (_toastContainer) return _toastContainer;
    _toastContainer = document.getElementById('toasts');
    if (!_toastContainer) {
        _toastContainer = document.createElement('div');
        _toastContainer.className = 'toasts';
        document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
}

/**
 * showToast(mensagem, tipo, duração)
 * tipo: 'success' | 'error' | 'warning'
 */
export function showToast(msg, tipo = 'success', duracao = 3500) {
    const container = _getToastContainer();

    const iconMap = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px"><polyline points="20,6 9,17 4,12"/></svg>',
        error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    };

    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.innerHTML = `
        <span class="toast-icon">${iconMap[tipo] ?? ''}</span>
        <span class="toast-msg">${escapeHtml(msg)}</span>`;
    container.appendChild(el);

    // Anima a entrada
    requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });

    setTimeout(() => {
        el.style.opacity    = '0';
        el.style.transform  = 'translateY(8px) scale(0.96)';
        el.style.transition = '.3s';
        setTimeout(() => el.remove(), 320);
    }, duracao);
}

// ─────────────────────────────────────────────────────────────
//  LOADING OVERLAY
// ─────────────────────────────────────────────────────────────
export function showLoading() {
    document.getElementById('loadingOverlay')?.classList.add('active');
}
export function hideLoading() {
    document.getElementById('loadingOverlay')?.classList.remove('active');
}

// ─────────────────────────────────────────────────────────────
//  MODAL DE CONFIRMAÇÃO — substitui confirm() nativo
// ─────────────────────────────────────────────────────────────
/**
 * fmConfirm({ titulo, msg, confirmTxt, cancelTxt, tipo })
 * tipo: 'perigo' | 'aviso' | 'info'
 * Retorna Promise<boolean>
 */
export function fmConfirm({
    titulo     = 'Confirmar',
    msg        = '',
    confirmTxt = 'Confirmar',
    cancelTxt  = 'Cancelar',
    tipo       = 'perigo',
} = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-backdrop active';
        overlay.style.zIndex = '2000';

        const corMap = { perigo: 'var(--danger)', aviso: 'var(--warning)', info: 'var(--primary)' };
        const cor = corMap[tipo] || corMap.perigo;

        overlay.innerHTML = `
            <div class="modal" style="max-width:420px">
                <div class="modal-title">${escapeHtml(titulo)}</div>
                ${msg ? `<div class="modal-body" style="white-space:pre-wrap">${escapeHtml(msg)}</div>` : ''}
                <div class="modal-actions">
                    <button class="btn btn-ghost fm-cancel">${escapeHtml(cancelTxt)}</button>
                    <button class="btn btn-primary fm-ok" style="background:${cor};box-shadow:none">${escapeHtml(confirmTxt)}</button>
                </div>
            </div>`;

        const fechar = r => { overlay.remove(); resolve(r); };
        overlay.querySelector('.fm-ok').onclick     = () => fechar(true);
        overlay.querySelector('.fm-cancel').onclick = () => fechar(false);
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape') fechar(false);
            if (e.key === 'Enter')  { e.preventDefault(); fechar(true); }
        });
        document.body.appendChild(overlay);
        setTimeout(() => overlay.querySelector('.fm-ok')?.focus(), 40);
    });
}

// ─────────────────────────────────────────────────────────────
//  MODAL DE ALERTA — substitui alert() nativo
// ─────────────────────────────────────────────────────────────
/**
 * fmAlert({ titulo, msg, tipo, btnTxt })
 * tipo: 'info' | 'aviso' | 'erro' | 'sucesso'
 * Retorna Promise<void>
 */
export function fmAlert({
    titulo = 'Atenção',
    msg    = '',
    tipo   = 'info',
    btnTxt = 'OK',
} = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-backdrop active';
        overlay.style.zIndex = '2000';

        const cores = {
            info: 'var(--primary)', aviso: 'var(--warning)',
            erro: 'var(--danger)',  sucesso: 'var(--success)',
        };
        const cor = cores[tipo] || cores.info;

        overlay.innerHTML = `
            <div class="modal" style="max-width:420px">
                <div class="modal-title" style="color:${cor}">${escapeHtml(titulo)}</div>
                ${msg ? `<div class="modal-body" style="white-space:pre-wrap">${escapeHtml(msg)}</div>` : ''}
                <div class="modal-actions">
                    <button class="btn btn-primary fm-ok" style="background:${cor};box-shadow:none">${escapeHtml(btnTxt)}</button>
                </div>
            </div>`;

        const fechar = () => { overlay.remove(); resolve(); };
        overlay.querySelector('.fm-ok').onclick = fechar;
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); fechar(); }
        });
        document.body.appendChild(overlay);
        setTimeout(() => overlay.querySelector('.fm-ok')?.focus(), 40);
    });
}

// ─────────────────────────────────────────────────────────────
//  BADGE HELPERS
// ─────────────────────────────────────────────────────────────
export function badgeStatus(status) {
    const map = {
        em_andamento: '<span class="badge badge-yellow">Em andamento</span>',
        finalizada:   '<span class="badge badge-green">Finalizada</span>',
        cancelada:    '<span class="badge badge-red">Cancelada</span>',
    };
    return map[status] ?? `<span class="badge badge-gray">${escapeHtml(status)}</span>`;
}

export function badgeRole(role) {
    const map = {
        supremo:       '<span class="badge badge-blue">Supremo</span>',
        administrador: '<span class="badge badge-yellow">Admin</span>',
        auditor:       '<span class="badge badge-gray">Auditor</span>',
        visualizador:  '<span class="badge badge-gray">Visualizador</span>',
    };
    return map[role] ?? `<span class="badge badge-gray">${escapeHtml(role)}</span>`;
}

export function badgeAtivo(ativo) {
    return ativo
        ? '<span class="badge badge-green">Ativo</span>'
        : '<span class="badge badge-gray">Inativo</span>';
}

// ─────────────────────────────────────────────────────────────
//  EMPTY STATE helper
// ─────────────────────────────────────────────────────────────
export function renderEmptyTable(tbodyEl, colSpan, mensagem = 'Nenhum registro encontrado.') {
    tbodyEl.innerHTML = `
        <tr>
            <td colspan="${colSpan}" class="td-vazio" style="text-align:center;padding:48px;color:var(--text-muted)">
                ${escapeHtml(mensagem)}
            </td>
        </tr>`;
}

// ─────────────────────────────────────────────────────────────
//  FORMATADORES
// ─────────────────────────────────────────────────────────────
export function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

export function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function fmtNum(n, decimais = 3) {
    if (n == null) return '—';
    return Number(n).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimais,
    });
}

// ─────────────────────────────────────────────────────────────
//  SEGURANÇA
// ─────────────────────────────────────────────────────────────
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────
//  DEBOUNCE
// ─────────────────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ─────────────────────────────────────────────────────────────
//  RENDER USER CARD (chamado externamente se necessário)
// ─────────────────────────────────────────────────────────────
export function renderUserCard(perfil) {
    if (!perfil) return;
    const nm = document.querySelector('.user-name');
    const rl = document.querySelector('.user-role');
    const av = document.querySelector('.avatar');
    if (nm) nm.textContent = perfil.nome?.split(' ')[0] ?? perfil.nome;
    if (rl) rl.textContent = perfil.role;
    if (av) av.textContent = perfil.nome?.charAt(0)?.toUpperCase() ?? '?';
}
