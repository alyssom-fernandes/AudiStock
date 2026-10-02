// ================================================================
//  AudiStock — js/telas/auditorias.js
//  Lista de auditorias com filtro por situação e busca; criação de
//  auditoria (só administradores).
// ================================================================

import { hasRole } from '../auth.js';
import { listarAuditorias, iniciarAuditoria, auditoriaEmAndamentoPorEmpresa } from '../auditorias.js';
import { listarEmpresas, contarProdutosPorEmpresa } from '../empresas.js';
import { escapeHtml, fmtDate, fmtInt, badgeStatus, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast,
         normalizar, debounce, marcarInvalido, ICONS, mensagemErro } from '../ui.js';

const FILTROS = [
  { id: 'todas', rotulo: 'Todas', vazio: 'Nenhuma auditoria' },
  { id: 'em_andamento', rotulo: 'Em andamento', vazio: 'Nenhuma auditoria em andamento' },
  { id: 'finalizada', rotulo: 'Finalizadas', vazio: 'Nenhuma auditoria finalizada' },
  { id: 'cancelada', rotulo: 'Canceladas', vazio: 'Nenhuma auditoria cancelada' },
];
const LIMITE = 200;

export async function render(el, { perfil, params }) {
  let filtro = FILTROS.some(f => f.id === params.get('status')) ? params.get('status') : 'todas';
  let busca = '', lista = [], total = 0;
  const admin = hasRole('administrador');

  el.innerHTML = `
    <div class="toolbar" id="audToolbar">
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

  const acoes = a => {
    const det = `href="app.html?tela=historico&id=${encodeURIComponent(a.id)}"`;
    if (a.status === 'em_andamento') return `<a class="btn btn-secondary btn-sm" href="contagem.html?id=${encodeURIComponent(a.id)}">Continuar contagem</a><a class="btn btn-ghost btn-sm" ${det}>Detalhes</a>`;
    if (a.status === 'finalizada') return `<a class="btn btn-secondary btn-sm" href="relatorios.html?id=${encodeURIComponent(a.id)}">Relatório</a><a class="btn btn-ghost btn-sm" ${det}>Detalhes</a>`;
    return `<a class="btn btn-secondary btn-sm" ${det}>Detalhes</a>`;
  };

  const desenhar = () => {
    $('#audToolbar').hidden = !lista.length;
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
      card.innerHTML = vazioHtml({
        titulo: termo ? `Nada encontrado para “${busca.trim()}”` : FILTROS.find(f => f.id === filtro).vazio,
        acoes: `<button type="button" class="btn btn-secondary btn-sm" data-limpar>${termo ? 'Limpar busca' : 'Mostrar todas'}</button>`,
        compacto: true,
      });
      return;
    }
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-lista tabela-fixa">
      <colgroup><col style="width:150px"><col><col style="width:110px"><col style="width:100px"><col style="width:140px"><col style="width:250px"></colgroup>
      <thead><tr><th scope="col">Número</th><th scope="col">Empresa</th><th scope="col">Início</th><th scope="col">Contagem</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(a => `<tr>
        <td class="l-titulo"><a class="linha-link codigo forte" href="app.html?tela=historico&id=${encodeURIComponent(a.id)}">${escapeHtml(a.numero_auditoria)}</a>
          <span class="sub so-celular-bloco"><span class="forte" style="color:var(--text)">${escapeHtml(a.empresas?.nome ?? '—')}</span> · <span class="nowrap">${fmtDate(a.data_inicio)}</span> · ${a.auditoria_cega ? 'cega' : 'visível'}</span></td>
        <td class="so-desktop"><span class="forte">${escapeHtml(a.empresas?.nome ?? '—')}</span></td>
        <td class="so-desktop nowrap">${fmtDate(a.data_inicio)}</td>
        <td class="so-desktop">${a.auditoria_cega ? 'Cega' : 'Visível'}</td>
        <td>${badgeStatus(a.status)}</td>
        <td class="l-linha"><div class="acoes-linha">${acoes(a)}</div></td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${total > lista.length ? `<div class="tabela-rodape"><span>Mostrando as ${fmtInt(lista.length)} auditorias mais recentes de ${fmtInt(total)}.</span></div>` : ''}`;
  };

  const carregar = async () => {
    try {
      ({ data: lista, count: total } = await listarAuditorias({ limit: LIMITE }));
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
    if (e.target.closest('[data-limpar]')) { if (busca.trim()) { busca = ''; $('#audBusca').value = ''; } else filtro = 'todas'; desenhar(); }
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
      <fieldset class="form-group">
        <legend class="form-label" style="margin-bottom:6px">Tipo de contagem</legend>
        <label class="checagem" style="align-items:flex-start;color:var(--text)"><input type="radio" name="audModo" value="cega" checked style="margin-top:3px"/>
          <span><span class="forte">Cega</span><span class="sub">Quem conta não vê nenhum saldo do sistema. Recomendado: o resultado é mais confiável.</span></span></label>
        <label class="checagem" style="align-items:flex-start;color:var(--text)"><input type="radio" name="audModo" value="visivel" style="margin-top:3px"/>
          <span><span class="forte">Visível</span><span class="sub">Quem conta vê, para cada produto, o saldo do sistema informado na auditoria anterior da empresa.</span></span></label>
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

  // Empresas com auditoria aberta ou sem produtos aparecem marcadas e não podem ser escolhidas
  const sel = modal.$('#audEmpresa');
  try {
    const [emps, { data: abertas }] = await Promise.all([listarEmpresas({ apenasAtivas: true }), listarAuditorias({ status: 'em_andamento', limit: 500 })]);
    const nProdutos = await Promise.all(emps.map(e => contarProdutosPorEmpresa(e.id).catch(() => null)));
    const aberta = new Map(abertas.map(a => [a.empresa_id, a.numero_auditoria]));
    sel.innerHTML = !emps.length ? '<option value="">Nenhuma empresa ativa</option>'
      : '<option value="">Selecione a empresa</option>' + emps.map((e, i) => {
        const motivo = aberta.has(e.id) ? `${aberta.get(e.id)} em andamento` : nProdutos[i] === 0 ? 'sem produtos' : '';
        return `<option value="${escapeHtml(e.id)}" ${motivo ? 'disabled' : ''}>${escapeHtml(e.nome)}${motivo ? ` (${motivo})` : ''}</option>`;
      }).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Não foi possível carregar</option>';
    showToast(mensagemErro(err, 'carregar empresas'), 'error');
  }

  async function criar(m) {
    const empresaId = sel.value;
    if (!empresaId) { marcarInvalido(sel, 'Escolha a empresa da auditoria.'); sel.focus(); return; }
    m.ocupado(true, 'Iniciando…');
    try {
      // Confere de novo: outra pessoa pode ter aberto uma auditoria enquanto o modal estava aberto
      const ativa = await auditoriaEmAndamentoPorEmpresa(empresaId);
      if (ativa) {
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
