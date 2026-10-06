// ================================================================
//  AudiStock — js/telas/relatorio.js  (relatorios.html?id=…)
//  Relatório de uma auditoria: indicadores, itens com filtro e ordem,
//  produtos não contados e as exportações (Excel, PDF, CSV e
//  impressão com folha própria). Sem saldo do sistema (auditoria em
//  andamento ou cancelada) não há divergência: mostra só a contagem.
// ================================================================

import { requireAuth, getPerfil } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtDateTime, fmtInt, plural, qtdHtml, difHtml, badgeStatus, badgeSituacao,
         vazioHtml, showToast, showLoading, hideLoading, ICONS, mensagemErro, partesHtml } from '../ui.js';
import { buscarAuditoria } from '../auditorias.js';
import { gerarRelatorio, ordenarItens, resumoAuditoria, produtosNaoAuditados, exportarCSV, baixarArquivo } from '../relatorios.js';
import { gerarPDF, gerarExcel, nomeArquivo, tituloRelatorio, temComparacao, semDivergenciaMotivo, fimRotulo } from '../exportacao.js';

const FILTROS = [
  { id: 'todos', rotulo: 'Todos', teste: () => true },
  { id: 'divergencias', rotulo: 'Divergências', teste: i => i.diferenca != null && Number(i.diferenca) !== 0 },
  { id: 'faltas', rotulo: 'Faltas', teste: i => i.diferenca != null && Number(i.diferenca) < 0 },
  { id: 'sobras', rotulo: 'Sobras', teste: i => i.diferenca != null && Number(i.diferenca) > 0 },
];
const ROTULO_FILTRO = { todos: 'Todos os itens contados', divergencias: 'Somente divergências', faltas: 'Somente faltas', sobras: 'Somente sobras' };
const STATUS = { em_andamento: 'Em andamento (parcial)', finalizada: 'Finalizada', cancelada: 'Cancelada' };
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
    el.innerHTML = `<a class="voltar" href="app.html?tela=relatorios">${ICONS.voltar}Relatórios</a>
      <div class="card">${vazioHtml({ titulo: aud ? 'Não foi possível carregar o relatório' : 'Relatório não encontrado', texto: aud ? mensagemErro(err, 'carregar relatório') : 'A auditoria pode ter sido excluída, ou o link está incompleto.', acoes: '<a class="btn btn-secondary" href="app.html?tela=relatorios">Ver relatórios</a>' })}</div>`;
    return;
  }

  // O número fica no título da página; a barra diz só "Relatório"
  definirTitulo('Relatório');
  document.title = `Relatório ${aud.numero_auditoria} · AudiStock`;
  const comparado = temComparacao(resumo, aud);
  const titulo = tituloRelatorio(aud);
  let filtro = 'todos', ordem = comparado ? 'diferenca' : 'nome', limite = POR_PAGINA;
  const emissor = getPerfil()?.nome ?? '';
  const comSaldo = resumo.auditados - resumo.sem_saldo;
  const pctOk = comSaldo ? Math.floor(resumo.ok / comSaldo * 1000) / 10 : 0;
  const pctContados = resumo.total_produtos ? Math.floor(resumo.auditados / resumo.total_produtos * 100) : 0;   // 299 de 300 não vira 100%
  const empresa = aud.empresas?.nome ?? '—';
  const criador = aud.usuarios?.nome ?? '—';

  // Rodapé de cada folha impressa (@page em css/style.css)
  const cssTexto = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  document.documentElement.style.setProperty('--rodape-folha', cssTexto(`AudiStock · ${aud.numero_auditoria} · ${empresa}`));

  const kpiNum = n => `<div class="kpi-valor${n ? '' : ' zero'}">${fmtInt(n)}</div>`;
  const naoContadosApoio = resumo.nao_auditados
    ? `<a href="#tNao" class="link" data-ir-nao>${plural(resumo.nao_auditados, 'produto não contado', 'produtos não contados')}</a>`
    : '<span class="positivo">Contagem completa</span>';

  el.innerHTML = `
    ${aud.status === 'finalizada' ? `<a class="voltar" href="app.html?tela=relatorios">${ICONS.voltar}Relatórios</a>`
      : `<a class="voltar" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">${ICONS.voltar}Detalhes da auditoria</a>`}

    <header class="print-only folha">
      <div class="folha-cab"><strong>${escapeHtml(titulo)}</strong><span class="folha-marca">AudiStock</span></div>
      <dl class="dados folha-dados">
        <dt>Auditoria</dt><dd>${escapeHtml(aud.numero_auditoria)}</dd><dt>Empresa</dt><dd>${escapeHtml(empresa)}</dd>
        <dt>Status da auditoria</dt><dd>${STATUS[aud.status] ?? escapeHtml(aud.status)}</dd><dt>Contagem</dt><dd>${aud.auditoria_cega ? 'Cega' : 'Visível'}</dd>
        <dt>Início</dt><dd>${fmtDateTime(aud.data_inicio)}</dd><dt>${fimRotulo(aud)[0]}</dt><dd>${fmtDateTime(fimRotulo(aud)[1])}</dd>
        <dt>Criada por</dt><dd>${escapeHtml(criador)}</dd><dt>Itens listados</dt><dd id="pFiltro">${ROTULO_FILTRO.todos}</dd>
        <dt>Emitido em</dt><dd id="pEmitido"></dd><dt>Emitido por</dt><dd>${escapeHtml(emissor || '—')}</dd>
      </dl>
      ${aud.observacoes ? `<p class="folha-obs"><strong>Observações:</strong> ${escapeHtml(aud.observacoes)}</p>` : ''}
    </header>

    <div class="cabecalho no-print">
      <div>
        <h2 class="cabecalho-titulo"><span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span> ${badgeStatus(aud.status)}</h2>
        <div class="cabecalho-meta">
          <span>${escapeHtml(empresa)}</span>
          <span>${aud.status === 'finalizada' ? `Finalizada em ${fmtDateTime(aud.data_fim)}` : aud.status === 'cancelada' ? `Cancelada em ${fmtDateTime(aud.cancelado_em)}` : `Iniciada em ${fmtDateTime(aud.data_inicio)}`}</span>
          <span>Contagem ${aud.auditoria_cega ? 'cega' : 'visível'}</span>
          <span>Criada por ${escapeHtml(criador)}</span>
        </div>
      </div>
      <div class="cabecalho-acoes" role="group" aria-label="Exportar relatório">
        <button type="button" class="btn btn-primary" data-exp="excel">${ICONS.baixar}Excel</button>
        <button type="button" class="btn btn-secondary" data-exp="pdf">${ICONS.baixar}PDF</button>
        <button type="button" class="btn btn-secondary" data-exp="csv">${ICONS.baixar}CSV</button>
        <button type="button" class="btn btn-secondary" data-exp="imprimir">${ICONS.imprimir}Imprimir</button>
      </div>
    </div>

    ${aud.status === 'em_andamento' ? `<div class="aviso aviso-aviso no-print">${ICONS.alerta}<p><strong>Relatório parcial.</strong> A auditoria ainda está em andamento. O saldo do sistema entra no fechamento; só então as divergências são calculadas.</p></div>` : ''}
    ${aud.status === 'cancelada' ? `<div class="aviso aviso-perigo no-print">${ICONS.alerta}<p><strong>Auditoria cancelada.</strong> Abaixo estão só as contagens registradas até o cancelamento, sem comparação com o sistema.</p></div>` : ''}

    <div class="kpis">
      <div class="kpi"><div class="kpi-rotulo">Itens contados</div><div class="kpi-valor">${fmtInt(resumo.auditados)}<small> de ${fmtInt(resumo.total_produtos)}</small></div><div class="kpi-apoio">${comparado ? naoContadosApoio : `${pctContados}% dos produtos ativos`}</div></div>
      ${comparado ? `
      <div class="kpi"><div class="kpi-rotulo">Sem divergência</div>${kpiNum(resumo.ok)}<div class="kpi-apoio">${pctOk.toLocaleString('pt-BR')}% dos itens com saldo</div></div>
      <div class="kpi kpi-falta"><div class="kpi-rotulo">Itens com falta</div>${kpiNum(resumo.faltas)}<div class="kpi-apoio">contado abaixo do sistema</div></div>
      <div class="kpi kpi-sobra"><div class="kpi-rotulo">Itens com sobra</div>${kpiNum(resumo.sobras)}<div class="kpi-apoio">contado acima do sistema</div></div>
      ${resumo.sem_saldo ? `<div class="kpi"><div class="kpi-rotulo">Sem saldo do sistema</div>${kpiNum(resumo.sem_saldo)}<div class="kpi-apoio">não informado no fechamento</div></div>` : ''}`
      : `
      <div class="kpi"><div class="kpi-rotulo">Não contados</div>${kpiNum(resumo.nao_auditados)}<div class="kpi-apoio">${resumo.nao_auditados ? '<a href="#tNao" class="link no-print" data-ir-nao>ver a lista</a><span class="print-only">produtos ativos sem contagem</span>' : '<span class="positivo">Contagem completa</span>'}</div></div>
      <div class="kpi"><div class="kpi-rotulo">Divergências</div><div class="kpi-valor zero">—</div><div class="kpi-apoio">${semDivergenciaMotivo(aud)}</div></div>`}
    </div>

    <section class="card" aria-labelledby="tItens">
      <div class="card-header no-print${comparado ? ' card-header-filtros' : ''}">
        <h3 class="card-title${comparado ? ' sr-only' : ''}" id="tItens">Itens contados</h3>
        ${comparado ? `<div class="seg" role="group" aria-label="Filtrar itens" id="segFiltro"></div>
        <div class="campo-ordem">
          <label class="form-label" for="selOrdem">Ordenar por</label>
          <select class="form-input" id="selOrdem">
            <option value="diferenca">Maior divergência</option><option value="nome">Nome do produto</option><option value="codigo">Código</option>
          </select>
        </div>` : ''}
      </div>
      <div id="relCorpo"></div>
    </section>

    ${naoContados.length ? `<section class="card secao-nao-contados" aria-labelledby="tNao">
      <details id="detNao">
        <summary class="card-header"><span><span class="card-title" id="tNao">Produtos não contados</span> <span class="badge badge-neutro">${fmtInt(naoContados.length)}</span></span>
          <span class="detalhes-rotulo">${ICONS.chevron}</span></summary>
        <table class="tabela-lista">
          <thead><tr><th scope="col" class="so-desktop">Código</th><th scope="col">Produto</th><th scope="col">Unidade</th></tr></thead>
          <tbody>${naoContados.map(p => `<tr>
            <td class="so-desktop"><span class="codigo">${escapeHtml(p.codigo_produto)}</span></td>
            <td class="l-titulo"><span class="forte">${escapeHtml(p.nome_produto)}</span><span class="sub so-celular-bloco"><span class="codigo">${escapeHtml(p.codigo_produto)}</span></span></td>
            <td><span class="un">${escapeHtml(String(p.unidade_medida ?? '—').toUpperCase())}</span></td>
          </tr>`).join('')}</tbody>
        </table>
      </details>
    </section>` : ''}

    <div class="print-only folha-assinaturas"><div>Auditor responsável</div><div>Conferência / gestor</div></div>`;

  const $ = s => el.querySelector(s);

  const visiveis = () => ordenarItens(todos.filter(FILTROS.find(f => f.id === filtro).teste), ordem);
  const linhaComparada = r => `<tr>
        <td class="so-desktop col-larga"><span class="codigo">${escapeHtml(r.codigo_produto)}</span></td>
        <td class="l-titulo"><span class="forte">${escapeHtml(r.nome_produto)}</span>
          <span class="sub so-celular-bloco">${partesHtml([`<span class="codigo">${escapeHtml(r.codigo_produto)}</span>`, `sistema ${qtdHtml(r.estoque_sistema, r.unidade_medida)}`, `contado ${qtdHtml(r.quantidade_contada, r.unidade_medida)}`])}</span>
          <span class="sub so-medio-bloco"><span class="codigo">${escapeHtml(r.codigo_produto)}</span></span></td>
        <td class="num so-desktop">${qtdHtml(r.estoque_sistema, r.unidade_medida)}</td>
        <td class="num so-desktop">${qtdHtml(r.quantidade_contada, r.unidade_medida)}</td>
        <td class="num">${difHtml(r.diferenca, r.unidade_medida)}</td>
        <td>${badgeSituacao(r.diferenca)}</td>
      </tr>`;
  const linhaSimples = r => `<tr>
        <td class="so-desktop col-larga"><span class="codigo">${escapeHtml(r.codigo_produto)}</span></td>
        <td class="l-titulo"><span class="forte">${escapeHtml(r.nome_produto)}</span><span class="sub so-celular-bloco so-medio-bloco"><span class="codigo">${escapeHtml(r.codigo_produto)}</span></span></td>
        <td class="num">${qtdHtml(r.quantidade_contada, r.unidade_medida)}</td>
      </tr>`;

  const desenhar = () => {
    if (comparado) $('#segFiltro').innerHTML = FILTROS.map(f => `<button type="button" data-f="${f.id}" aria-pressed="${f.id === filtro}">${f.rotulo}<span class="qtd">${fmtInt(todos.filter(f.teste).length)}</span></button>`).join('');
    $('#pFiltro').textContent = ROTULO_FILTRO[filtro];
    const lista = visiveis();
    if (!lista.length) {
      const nome = { divergencias: 'divergência', faltas: 'falta', sobras: 'sobra' }[filtro];
      $('#relCorpo').innerHTML = !todos.length
        ? vazioHtml({ titulo: 'Nenhum item contado nesta auditoria', texto: aud.status === 'em_andamento' ? 'Os itens aparecem aqui conforme a contagem avança.' : '', compacto: true })
        : vazioHtml({ titulo: `Nenhum item com ${nome}`, texto: resumo.sem_saldo ? 'Itens sem saldo do sistema não entram nesta comparação.' : 'Boa notícia para o estoque.', acoes: '<button type="button" class="btn btn-secondary btn-sm" data-f="todos">Mostrar todos</button>', compacto: true });
      return;
    }
    const pagina = lista.slice(0, limite);
    $('#relCorpo').innerHTML = `<div class="tabela-wrap"><table class="tabela-lista ${comparado ? 'tabela-relatorio' : 'tabela-relatorio-simples'}">
      ${comparado
        ? '<colgroup><col class="c-codigo"><col><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-sit"></colgroup><thead><tr><th scope="col" class="so-desktop col-larga">Código</th><th scope="col">Produto</th><th scope="col" class="num">Sistema</th><th scope="col" class="num">Contado</th><th scope="col" class="num">Diferença</th><th scope="col">Situação</th></tr></thead>'
        : '<colgroup><col class="c-codigo"><col><col class="c-num"></colgroup><thead><tr><th scope="col" class="so-desktop col-larga">Código</th><th scope="col">Produto</th><th scope="col" class="num">Contado</th></tr></thead>'}
      <tbody>${pagina.map(comparado ? linhaComparada : linhaSimples).join('')}</tbody>
    </table></div>
    <div class="tabela-rodape no-print"><span>${lista.length > limite ? `Mostrando ${fmtInt(limite)} de ${plural(lista.length, 'item', 'itens')}` : plural(lista.length, 'item', 'itens')}</span>
      ${lista.length > limite ? '<button type="button" class="btn btn-secondary btn-sm" id="relMais">Mostrar mais</button>' : ''}</div>`;
    $('#relMais')?.addEventListener('click', () => { limite += POR_PAGINA; desenhar(); });
  };
  desenhar();

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (b) { filtro = b.dataset.f; limite = POR_PAGINA; desenhar(); return; }
    if (e.target.closest('[data-ir-nao]')) {
      e.preventDefault();
      const det = $('#detNao'); det.open = true;
      det.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      det.querySelector('summary').focus({ preventScroll: true });
    }
  });
  $('#selOrdem')?.addEventListener('change', e => { ordem = e.target.value; desenhar(); });

  // A impressão leva a lista inteira do filtro e os não contados abertos
  let estavaAberto = false;
  window.addEventListener('beforeprint', () => {
    $('#pEmitido').textContent = fmtDateTime(new Date().toISOString());
    limite = Infinity; desenhar();
    const det = $('#detNao'); if (det) { estavaAberto = det.open; det.open = true; }
  });
  window.addEventListener('afterprint', () => {
    limite = POR_PAGINA; desenhar();
    const det = $('#detNao'); if (det) det.open = estavaAberto;
  });

  const doc = () => ({ aud, resumo, itens: visiveis(), naoContados, filtroRotulo: ROTULO_FILTRO[filtro], emissor });
  const acoes = {
    excel: async () => baixarArquivo(await gerarExcel(doc()), nomeArquivo(aud, 'xlsx')),
    pdf: () => gerarPDF(doc()),
    csv: async () => baixarArquivo(await exportarCSV(aud.id, filtro, ordem, aud, { comparado }), nomeArquivo(aud, 'csv')),
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
      showToast(mensagemErro(err, `exportar ${b.dataset.exp}`), 'error');
    } finally { hideLoading(); b.disabled = false; }
  });
}
