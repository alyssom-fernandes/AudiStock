// ================================================================
//  AudiStock — js/telas/auditorias.js
//  Lista de auditorias com filtro por situação e busca; criação de
//  auditoria (só administradores).
// ================================================================

import { hasRole } from '../auth.js';
import { listarAuditorias, iniciarAuditoria, auditoriaEmAndamentoPorEmpresa } from '../auditorias.js';
import { listarEmpresas } from '../empresas.js';
import { escapeHtml, fmtDate, badgeStatus, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast,
         normalizar, debounce, ICONS, mensagemErro } from '../ui.js';

const FILTROS = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'em_andamento', rotulo: 'Em andamento' },
  { id: 'finalizada', rotulo: 'Finalizadas' },
  { id: 'cancelada', rotulo: 'Canceladas' },
];

export async function render(el, { perfil, params }) {
  let filtro = FILTROS.some(f => f.id === params.get('status')) ? params.get('status') : 'todas';
  let busca = '';
  let lista = [];
  const admin = hasRole('administrador');

  el.innerHTML = `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filtrar por situação" id="segFiltro"></div>
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar auditoria</span>
        <input class="form-input" type="search" id="audBusca" placeholder="Número ou empresa" autocomplete="off"/></label>
      <span class="espaco"></span>
      ${admin ? `<button type="button" class="btn btn-primary" id="btnNovaAud">${ICONS.mais}Nova auditoria</button>` : ''}
    </div>
    <div class="card" id="audCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:80%"></span><span class="skel" style="width:60%"></span></div></div>`;

  const $ = s => el.querySelector(s);
  const card = $('#audCard');

  const desenharFiltros = () => {
    const qtd = id => id === 'todas' ? lista.length : lista.filter(a => a.status === id).length;
    $('#segFiltro').innerHTML = FILTROS.map(f => `<button type="button" data-f="${f.id}" aria-pressed="${f.id === filtro}">${f.rotulo}<span class="qtd">${qtd(f.id)}</span></button>`).join('');
  };

  const desenhar = () => {
    desenharFiltros();
    const termo = normalizar(busca);
    const visiveis = lista.filter(a => (filtro === 'todas' || a.status === filtro)
      && (!termo || normalizar(a.numero_auditoria).includes(termo) || normalizar(a.empresas?.nome).includes(termo)));

    if (!lista.length) {
      card.innerHTML = vazioHtml({
        titulo: 'Nenhuma auditoria criada ainda',
        texto: admin ? 'Inicie a primeira para contar o estoque de uma empresa.' : 'Quando um administrador iniciar uma auditoria, ela aparece aqui.',
        acoes: admin ? '<button type="button" class="btn btn-primary" data-nova>Nova auditoria</button>' : '',
      });
      return;
    }
    if (!visiveis.length) {
      const nomeFiltro = FILTROS.find(f => f.id === filtro).rotulo.toLowerCase();
      card.innerHTML = vazioHtml({
        titulo: termo ? `Nada encontrado para “${escapeHtml(busca)}”` : `Nenhuma auditoria ${filtro === 'todas' ? '' : nomeFiltro.replace(/s$/, '')}`.trim(),
        acoes: `<button type="button" class="btn btn-secondary btn-sm" data-limpar>Mostrar todas</button>`,
        compacto: true,
      });
      return;
    }
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-resp">
      <thead><tr><th scope="col">Número</th><th scope="col">Empresa</th><th scope="col">Início</th><th scope="col">Contagem</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(a => `<tr>
        <td class="cel-titulo"><a class="linha-link codigo forte" href="app.html?tela=historico&id=${encodeURIComponent(a.id)}">${escapeHtml(a.numero_auditoria)}</a></td>
        <td data-label="Empresa"><span class="forte">${escapeHtml(a.empresas?.nome ?? '—')}</span></td>
        <td data-label="Início" class="nowrap">${fmtDate(a.data_inicio)}</td>
        <td data-label="Contagem">${a.auditoria_cega ? 'Cega' : 'Visível'}</td>
        <td data-label="Situação">${badgeStatus(a.status)}</td>
        <td class="cel-acoes"><div class="acoes-linha">
          ${a.status === 'em_andamento' ? `<a class="btn btn-secondary btn-sm" href="contagem.html?id=${encodeURIComponent(a.id)}">Continuar contagem</a>` : ''}
          ${a.status === 'finalizada' ? `<a class="btn btn-secondary btn-sm" href="relatorios.html?id=${encodeURIComponent(a.id)}">Relatório</a>` : ''}
          <a class="btn btn-ghost btn-sm" href="app.html?tela=historico&id=${encodeURIComponent(a.id)}" aria-label="Detalhes da ${escapeHtml(a.numero_auditoria)}">Detalhes</a>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  };

  const carregar = async () => {
    try {
      ({ data: lista } = await listarAuditorias({ limit: 200 }));
      desenhar();
    } catch (err) {
      console.error(err);
      card.innerHTML = erroCargaHtml("irPara('auditorias')");
    }
  };

  $('#segFiltro').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filtro = b.dataset.f;
    const url = new URL(location.href);
    filtro === 'todas' ? url.searchParams.delete('status') : url.searchParams.set('status', filtro);
    history.replaceState({}, '', url);
    desenhar();
  });
  $('#audBusca').addEventListener('input', debounce(e => { busca = e.target.value; desenhar(); }, 200));
  card.addEventListener('click', e => {
    if (e.target.closest('[data-limpar]')) { filtro = 'todas'; busca = ''; $('#audBusca').value = ''; desenhar(); }
    if (e.target.closest('[data-nova]')) abrirNovaAuditoria(perfil);
  });
  $('#btnNovaAud')?.addEventListener('click', () => abrirNovaAuditoria(perfil));

  await carregar();
  if (admin && params.get('nova') === '1') abrirNovaAuditoria(perfil);
}

async function abrirNovaAuditoria(perfil) {
  const modal = abrirModal({
    titulo: 'Nova auditoria',
    subtitulo: 'A contagem começa em seguida. Só pode haver uma auditoria em andamento por empresa.',
    corpo: `
      <div class="form-group">
        <label class="form-label" for="audEmpresa">Empresa</label>
        <select class="form-input" id="audEmpresa" required><option value="">Carregando…</option></select>
      </div>
      <fieldset class="form-group" style="border:0">
        <legend class="form-label" style="margin-bottom:6px">Tipo de contagem</legend>
        <label class="checagem" style="align-items:flex-start;color:var(--text)"><input type="radio" name="audModo" value="cega" checked style="margin-top:3px"/>
          <span><span class="forte">Cega</span><span class="sub">A equipe conta sem consultar o saldo do sistema. Recomendado: o resultado é mais confiável.</span></span></label>
        <label class="checagem" style="align-items:flex-start;color:var(--text)"><input type="radio" name="audModo" value="visivel" style="margin-top:3px"/>
          <span><span class="forte">Visível</span><span class="sub">A equipe pode consultar o saldo do sistema durante a contagem.</span></span></label>
      </fieldset>
      <div class="form-group">
        <label class="form-label" for="audObs">Observações <span class="opcional">(opcional)</span></label>
        <input class="form-input" type="text" id="audObs" placeholder="Ex.: inventário mensal" maxlength="200"/>
      </div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: m => m.fechar() },
      { texto: 'Iniciar contagem', classe: 'btn-primary', tipo: 'submit', id: 'btnCriarAud' },
    ],
    aoEnviar: criar,
  });

  const sel = modal.$('#audEmpresa');
  try {
    const emps = await listarEmpresas({ apenasAtivas: true });
    sel.innerHTML = emps.length
      ? '<option value="">Selecione a empresa</option>' + emps.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}</option>`).join('')
      : '<option value="">Nenhuma empresa ativa</option>';
  } catch (err) {
    sel.innerHTML = '<option value="">Não foi possível carregar</option>';
    showToast('Não foi possível carregar as empresas.', 'error');
  }

  async function criar(m) {
    const empresaId = sel.value;
    if (!empresaId) { sel.setAttribute('aria-invalid', 'true'); sel.focus(); showToast('Escolha a empresa da auditoria.', 'warning'); return; }
    m.ocupado(true, 'Iniciando…');
    try {
      const ativa = await auditoriaEmAndamentoPorEmpresa(empresaId);
      if (ativa) {
        m.ocupado(false);
        const nomeEmp = sel.selectedOptions[0]?.textContent ?? 'Esta empresa';
        m.fechar();
        const abrir = await fmConfirm({
          titulo: 'Já existe uma auditoria em andamento',
          msg: `${nomeEmp} já tem a ${ativa.numero_auditoria} em andamento. Termine ou cancele essa antes de começar outra.`,
          confirmTxt: 'Abrir a contagem', cancelTxt: 'Fechar',
        });
        if (abrir) window.location.href = `contagem.html?id=${encodeURIComponent(ativa.id)}`;
        return;
      }
      const nova = await iniciarAuditoria({
        empresaId, usuarioId: perfil.id,
        auditoriaCega: m.$('input[name=audModo]:checked').value === 'cega',
        observacoes: m.$('#audObs').value,
      });
      window.location.href = `contagem.html?id=${encodeURIComponent(nova.id)}`;
    } catch (err) {
      m.ocupado(false);
      showToast(mensagemErro(err, 'criar auditoria'), 'error');
    }
  }
}
