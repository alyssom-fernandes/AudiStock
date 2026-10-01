// ================================================================
//  AudiStock — js/telas/relatorio.js  (relatorios.html?id=…)
//  Relatório de divergências de uma auditoria: indicadores, itens
//  com filtro e ordem, produtos não contados e as exportações
//  (Excel, PDF, CSV e impressão com folha própria).
// ================================================================

import { requireAuth, getPerfil } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtDateTime, fmtInt, plural, qtdHtml, difHtml, badgeStatus, badgeSituacao,
         vazioHtml, showToast, showLoading, hideLoading, ICONS, mensagemErro } from '../ui.js';
import { buscarAuditoria } from '../auditorias.js';
import { gerarRelatorio, ordenarItens, resumoAuditoria, produtosNaoAuditados, exportarCSV, baixarArquivo } from '../relatorios.js';
import { gerarPDF, gerarExcel, nomeArquivo } from '../exportacao.js';

const FILTROS = [
  { id: 'todos', rotulo: 'Todos', teste: () => true },
  { id: 'divergencias', rotulo: 'Divergências', teste: i => i.diferenca != null && Number(i.diferenca) !== 0 },
  { id: 'faltas', rotulo: 'Faltas', teste: i => Number(i.diferenca) < 0 },
  { id: 'sobras', rotulo: 'Sobras', teste: i => Number(i.diferenca) > 0 },
];
const ROTULO_FILTRO = { todos: 'Todos os itens contados', divergencias: 'Somente divergências', faltas: 'Somente faltas', sobras: 'Somente sobras' };
const POR_PAGINA = 200;

const auth = await requireAuth();
if (auth) {
  initLayout('Relatório', { ativa: 'relatorios' });
  await iniciar();
}

async function iniciar() {
  const el = document.getElementById('pageBody');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('app.html?tela=relatorios'); return; }

  el.innerHTML = `<div class="carregando-bloco"><span class="skel" style="width:30%;height:22px"></span><span class="skel" style="width:55%"></span></div>`;
  let aud, resumo, todos, naoContados;
  try {
    aud = await buscarAuditoria(id);
    [resumo, { itens: todos }, { data: naoContados }] = await Promise.all([
      resumoAuditoria(id), gerarRelatorio(id, { filtro: 'todos', ordem: 'diferenca' }), produtosNaoAuditados(id),
    ]);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<a class="voltar" href="app.html?tela=relatorios">${ICONS.voltar}Relatórios</a>
      <div class="card">${vazioHtml({ titulo: aud ? 'Não foi possível carregar o relatório' : 'Relatório não encontrado', texto: aud ? mensagemErro(err) : 'A auditoria pode ter sido excluída, ou o link está incompleto.', acoes: '<a class="btn btn-secondary" href="app.html?tela=relatorios">Ver relatórios</a>' })}</div>`;
    return;
  }

  definirTitulo(`Relatório ${aud.numero_auditoria}`);
  let filtro = 'todos', ordem = 'diferenca', limite = POR_PAGINA;
  const emissor = getPerfil()?.nome ?? '';
  const pctOk = resumo.auditados ? Math.round(resumo.ok / resumo.auditados * 100) : 0;

  el.innerHTML = `
    <a class="voltar" href="app.html?tela=relatorios">${ICONS.voltar}Relatórios</a>

    <header class="print-only" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #999;padding-bottom:6px;margin-bottom:8px">
        <strong style="font-size:15pt">Relatório de divergências</strong><span style="color:#9a3412;font-weight:600">AudiStock</span>
      </div>
      <dl class="dados" style="grid-template-columns:auto 1fr auto 1fr;gap:2px 14px;font-size:9pt">
        <dt>Auditoria</dt><dd>${escapeHtml(aud.numero_auditoria)}</dd><dt>Empresa</dt><dd>${escapeHtml(aud.empresas?.nome ?? '—')}</dd>
        <dt>Início</dt><dd>${fmtDateTime(aud.data_inicio)}</dd><dt>Término</dt><dd>${fmtDateTime(aud.data_fim)}</dd>
        <dt>Responsável</dt><dd>${escapeHtml(aud.usuarios?.nome ?? '—')}</dd><dt>Contagem</dt><dd>${aud.auditoria_cega ? 'Cega' : 'Visível'}</dd>
        <dt>Itens listados</dt><dd id="pFiltro">${ROTULO_FILTRO.todos}</dd><dt>Emitido em</dt><dd id="pEmitido"></dd>
      </dl>
    </header>

    <div class="cabecalho no-print">
      <div>
        <h2 class="cabecalho-titulo"><span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span> ${badgeStatus(aud.status)}</h2>
        <div class="cabecalho-meta">
          <span>${escapeHtml(aud.empresas?.nome ?? '—')}</span>
          <span>${aud.data_fim ? `Finalizada em ${fmtDateTime(aud.data_fim)}` : `Iniciada em ${fmtDateTime(aud.data_inicio)}`}</span>
          <span>Contagem ${aud.auditoria_cega ? 'cega' : 'visível'}</span>
          <span>Responsável ${escapeHtml(aud.usuarios?.nome ?? '—')}</span>
        </div>
      </div>
      <div class="cabecalho-acoes" role="group" aria-label="Exportar relatório">
        <button type="button" class="btn btn-secondary" data-exp="excel">${ICONS.baixar}Excel</button>
        <button type="button" class="btn btn-secondary" data-exp="pdf">${ICONS.baixar}PDF</button>
        <button type="button" class="btn btn-secondary" data-exp="csv">${ICONS.baixar}CSV</button>
        <button type="button" class="btn btn-secondary" data-exp="imprimir">${ICONS.imprimir}Imprimir</button>
      </div>
    </div>

    ${aud.status === 'em_andamento' ? `<div class="aviso aviso-aviso">${ICONS.alerta}<p><strong>Relatório parcial.</strong> A auditoria ainda está em andamento: o saldo do sistema só entra no fechamento, então ainda não há divergências calculadas.</p></div>` : ''}
    ${aud.status === 'cancelada' ? `<div class="aviso aviso-perigo">${ICONS.alerta}<p><strong>Auditoria cancelada.</strong> Os números abaixo são só as contagens registradas até o cancelamento.</p></div>` : ''}

    <div class="kpis">
      <div class="kpi"><div class="kpi-rotulo">Itens contados</div><div class="kpi-valor">${fmtInt(resumo.auditados)}<small> de ${fmtInt(resumo.total_produtos)}</small></div><div class="kpi-apoio">${resumo.nao_auditados ? plural(resumo.nao_auditados, 'produto não contado', 'produtos não contados') : 'Contagem completa'}</div></div>
      <div class="kpi"><div class="kpi-rotulo">Sem divergência</div><div class="kpi-valor">${fmtInt(resumo.ok)}</div><div class="kpi-apoio">${pctOk}% dos itens contados</div></div>
      <div class="kpi kpi-falta"><div class="kpi-rotulo">Itens com falta</div><div class="kpi-valor">${fmtInt(resumo.faltas)}</div><div class="kpi-apoio">contado abaixo do sistema</div></div>
      <div class="kpi kpi-sobra"><div class="kpi-rotulo">Itens com sobra</div><div class="kpi-valor">${fmtInt(resumo.sobras)}</div><div class="kpi-apoio">contado acima do sistema</div></div>
      ${resumo.sem_saldo ? `<div class="kpi"><div class="kpi-rotulo">Sem saldo do sistema</div><div class="kpi-valor">${fmtInt(resumo.sem_saldo)}</div><div class="kpi-apoio">não informado no fechamento</div></div>` : ''}
    </div>

    <section class="card" aria-labelledby="tItens">
      <div class="card-header no-print">
        <h3 class="card-title sr-only" id="tItens">Itens</h3>
        <div class="seg" role="group" aria-label="Filtrar itens" id="segFiltro"></div>
        <div style="display:flex;align-items:center;gap:8px">
          <label class="form-label" for="selOrdem" style="white-space:nowrap">Ordenar por</label>
          <select class="form-input" id="selOrdem" style="width:auto">
            <option value="diferenca">Maior divergência</option><option value="nome">Nome do produto</option><option value="codigo">Código</option>
          </select>
        </div>
      </div>
      <div id="relCorpo"></div>
    </section>

    ${naoContados.length ? `<section class="card no-print" aria-labelledby="tNao">
      <details>
        <summary class="card-header" style="cursor:pointer;list-style:none;border-bottom:0"><span><span class="card-title" id="tNao">Produtos não contados</span> <span class="badge">${fmtInt(naoContados.length)}</span></span><span class="muted detalhes-rotulo" style="font-size:13px"></span></summary>
        <div class="tabela-wrap" style="border-top:1px solid var(--border)"><table class="tabela-resp">
          <thead><tr><th scope="col">Código</th><th scope="col">Produto</th><th scope="col">Unidade</th></tr></thead>
          <tbody>${naoContados.map(p => `<tr><td class="codigo" data-label="Código">${escapeHtml(p.codigo_produto)}</td><td class="cel-titulo">${escapeHtml(p.nome_produto)}</td><td data-label="Unidade">${escapeHtml(p.unidade_medida ?? '—')}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>
    </section>` : ''}

    <div class="print-only" style="margin-top:36px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;font-size:9pt;color:#444">
        <div style="border-top:1px solid #555;padding-top:4px">Auditor responsável</div>
        <div style="border-top:1px solid #555;padding-top:4px">Conferência / gestor</div>
      </div>
    </div>`;

  const $ = s => el.querySelector(s);

  const visiveis = () => ordenarItens(todos.filter(FILTROS.find(f => f.id === filtro).teste), ordem);
  const desenhar = () => {
    $('#segFiltro').innerHTML = FILTROS.map(f => `<button type="button" data-f="${f.id}" aria-pressed="${f.id === filtro}">${f.rotulo}<span class="qtd">${fmtInt(todos.filter(f.teste).length)}</span></button>`).join('');
    $('#pFiltro').textContent = ROTULO_FILTRO[filtro];
    const lista = visiveis();
    if (!lista.length) {
      $('#relCorpo').innerHTML = !todos.length
        ? vazioHtml({ titulo: 'Nenhum item contado nesta auditoria', compacto: true })
        : vazioHtml({ titulo: `Nenhum item com ${{ divergencias: 'divergência', faltas: 'falta', sobras: 'sobra' }[filtro]}`, texto: 'Boa notícia para o estoque.', acoes: '<button type="button" class="btn btn-secondary btn-sm" data-f="todos">Mostrar todos</button>', compacto: true });
      return;
    }
    const pagina = lista.slice(0, limite);
    $('#relCorpo').innerHTML = `<div class="tabela-wrap"><table class="tabela-lista">
      <thead><tr><th scope="col">Código</th><th scope="col">Produto</th><th scope="col" class="num">Sistema</th><th scope="col" class="num">Contado</th><th scope="col" class="num">Diferença</th><th scope="col">Situação</th></tr></thead>
      <tbody>${pagina.map(r => `<tr>
        <td class="codigo so-desktop">${escapeHtml(r.codigo_produto)}</td>
        <td class="l-titulo"><span class="forte">${escapeHtml(r.nome_produto)}</span>
          <span class="sub so-celular-bloco"><span class="codigo">${escapeHtml(r.codigo_produto)}</span> · sistema ${qtdHtml(r.estoque_sistema, r.unidade_medida)} · contado ${qtdHtml(r.quantidade_contada, r.unidade_medida)}</span></td>
        <td class="num so-desktop">${qtdHtml(r.estoque_sistema, r.unidade_medida)}</td>
        <td class="num so-desktop">${qtdHtml(r.quantidade_contada, r.unidade_medida)}</td>
        <td class="num">${difHtml(r.diferenca, r.unidade_medida)}</td>
        <td>${badgeSituacao(r.diferenca)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="tabela-rodape no-print"><span>${lista.length > limite ? `Mostrando ${fmtInt(limite)} de ${plural(lista.length, 'item', 'itens')}` : plural(lista.length, 'item', 'itens')}</span>
      ${lista.length > limite ? '<button type="button" class="btn btn-secondary btn-sm" id="relMais">Mostrar mais</button>' : ''}</div>`;
    $('#relMais')?.addEventListener('click', () => { limite += POR_PAGINA; desenhar(); });
  };
  desenhar();

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) { filtro = b.dataset.f; limite = POR_PAGINA; desenhar(); }
  });
  $('#selOrdem').addEventListener('change', e => { ordem = e.target.value; desenhar(); });

  // A impressão leva a lista inteira do filtro, não só a primeira página
  window.addEventListener('beforeprint', () => { $('#pEmitido').textContent = fmtDateTime(new Date().toISOString()); limite = Infinity; desenhar(); });
  window.addEventListener('afterprint', () => { limite = POR_PAGINA; desenhar(); });

  const doc = () => ({ aud, resumo, itens: visiveis(), naoContados, filtroRotulo: ROTULO_FILTRO[filtro], emissor });
  const acoes = {
    excel: async () => baixarArquivo(await gerarExcel(doc()), nomeArquivo(aud, 'xlsx')),
    pdf: () => gerarPDF(doc()),
    csv: async () => baixarArquivo(await exportarCSV(aud.id, filtro, ordem), nomeArquivo(aud, 'csv')),
  };
  el.querySelector('.cabecalho-acoes').addEventListener('click', async e => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    if (b.dataset.exp === 'imprimir') { window.print(); return; }
    const [gerando, pronto] = { excel: ['a planilha', 'Planilha baixada.'], pdf: ['o PDF', 'PDF baixado.'], csv: ['o CSV', 'CSV baixado.'] }[b.dataset.exp];
    b.disabled = true;
    showLoading(`Gerando ${gerando}…`);
    try {
      await acoes[b.dataset.exp]();
      showToast(pronto, 'success');
    } catch (err) {
      console.error(err);
      showToast(mensagemErro(err, `exportar ${b.dataset.exp}`), 'error');
    } finally { hideLoading(); b.disabled = false; }
  });
}
