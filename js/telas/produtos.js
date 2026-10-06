// ================================================================
//  AudiStock — js/telas/produtos.js
//  Produtos por empresa: lista paginada, busca, criar/editar,
//  importar planilha (com prévia e relatório de linhas com erro)
//  e clonar o cadastro de uma empresa para outra.
// ================================================================

import { hasRole } from '../auth.js';
import { listarEmpresas, contarProdutosPorEmpresa } from '../empresas.js';
import { listarProdutos, buscarProdutoPorId, criarProduto, atualizarProduto, importarProdutosExcel, clonarProdutos, lerPlanilha,
         listarCatalogo, buscarProdutoPorBarras, buscarCadastroPorCodigo } from '../produtos.js';
import { baixarArquivo } from '../relatorios.js';
import { escapeHtml, fmtInt, plural, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast, debounce, delegarAcoes,
         marcarInvalido, ICONS, mensagemErro, carregarScript, partesHtml } from '../ui.js';

const POR_PAGINA = 50;
const UNIDADES = ['UN', 'PCT', 'CX', 'FD', 'KG', 'G', 'L', 'ML', 'M', 'SC', 'CT', 'RL', 'GL', 'BD', 'BR', 'PR', 'DZ'];
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';

export async function render(el, { perfil, params }) {
  const admin = hasRole('administrador');
  let empresas = [], empresaId = params.get('empresa') || '', busca = '', pagina = 1, inativos = false, total = 0, req = 0, destacar = null;

  el.innerHTML = `
    <div class="toolbar">
      <label class="sr-only" for="prodEmpresa">Empresa</label>
      <select class="form-input" id="prodEmpresa" style="width:auto;min-width:220px;max-width:340px"></select>
      <label class="campo-busca filtro-lista">${ICONS.busca}<span class="sr-only">Buscar produto</span>
        <input class="form-input" type="search" id="prodBusca" placeholder="Nome, código ou EAN" autocomplete="off"/></label>
      <label class="checagem filtro-lista"><input type="checkbox" id="prodInativos"/> Mostrar inativos</label>
      ${admin ? `<div class="toolbar-acoes"><button type="button" class="btn btn-secondary" data-acao="importar">Importar planilha</button>
        <button type="button" class="btn btn-secondary" data-acao="clonar">Clonar</button>
        <button type="button" class="btn btn-primary" data-acao="novo">${ICONS.mais}Novo produto</button></div>` : ''}
    </div>
    <div class="card" id="prodCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#prodCard');
  const nomeEmpresa = () => empresas.find(e => e.id === empresaId)?.nome ?? '';

  // Os filtros funcionam desde já; a lista só carrega depois das empresas
  $('#prodEmpresa').addEventListener('change', e => trocarEmpresa(e.target.value));
  $('#prodBusca').addEventListener('input', debounce(e => { busca = e.target.value.trim(); pagina = 1; if (empresas.length) carregar(); }, 300));
  $('#prodInativos').addEventListener('change', e => { inativos = e.target.checked; pagina = 1; if (empresas.length) carregar(); });

  try { empresas = await listarEmpresas({ apenasAtivas: true }); }
  catch (err) { card.innerHTML = erroCargaHtml("irPara('produtos')"); return; }

  if (!empresas.length) {
    $('.toolbar').remove();
    card.innerHTML = perfil.empresa_id
      ? vazioHtml({ titulo: 'Sua empresa está inativa', texto: 'Os produtos voltam a aparecer quando ela for reativada. Fale com quem administra o sistema.' })
      : vazioHtml({ titulo: 'Cadastre uma empresa antes dos produtos', texto: 'Cada produto pertence a uma empresa. Depois de cadastrá-la, importe a planilha de produtos.', acoes: '<a class="btn btn-primary" href="app.html?tela=empresas&nova=1">Cadastrar empresa</a>' });
    return;
  }
  if (!empresas.some(e => e.id === empresaId)) empresaId = empresas[0].id;
  $('#prodEmpresa').innerHTML = empresas.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === empresaId ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('');

  function trocarEmpresa(id, { codigo = null } = {}) {
    empresaId = id; pagina = 1; destacar = codigo;
    busca = codigo ?? ''; $('#prodBusca').value = busca;
    $('#prodEmpresa').value = id;
    const url = new URL(location.href); url.searchParams.set('empresa', id); history.replaceState({}, '', url);
    return carregar();
  }

  async function carregar() {
    const minha = ++req;
    try {
      const { data, count } = await listarProdutos(empresaId, { q: busca, apenasAtivos: !inativos, page: pagina, limit: POR_PAGINA });
      if (minha !== req) return;   // resposta de uma busca antiga
      total = count;
      if (!data.length && pagina > 1) { pagina = Math.max(1, Math.ceil(total / POR_PAGINA)); return carregar(); }
      // Vazio sem filtro: a empresa não tem produto nenhum, ou só tem inativos?
      const inativosOcultos = !data.length && !busca && !inativos
        ? (await listarProdutos(empresaId, { apenasAtivos: false, limit: 1 })).count : 0;
      if (minha !== req) return;
      desenhar(data, inativosOcultos);
    } catch (err) {
      if (minha !== req) return;
      console.error(err);
      card.innerHTML = erroCargaHtml("irPara('produtos')");
    }
  }

  const desenhar = (data, inativosOcultos) => {
    const semNada = !data.length && !busca && !inativos && !inativosOcultos;
    el.querySelectorAll('.filtro-lista').forEach(x => { x.hidden = semNada; });
    if ($('.toolbar-acoes')) $('.toolbar-acoes').hidden = semNada;
    if (!data.length) {
      card.innerHTML = busca
        ? vazioHtml({ titulo: `Nada encontrado para “${busca}” em ${nomeEmpresa()}`, texto: inativos ? '' : 'A busca não inclui produtos inativos.',
            acoes: `<button type="button" class="btn btn-secondary btn-sm" data-acao="limpar">Limpar busca</button>${inativos ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-acao="comInativos">Buscar também nos inativos</button>'}`, compacto: true })
        : inativosOcultos
          ? vazioHtml({ titulo: `Todos os ${plural(inativosOcultos, 'produto', 'produtos')} desta empresa estão inativos`, acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="comInativos">Mostrar inativos</button>', compacto: true })
          : vazioHtml({ titulo: 'Esta empresa ainda não tem produtos', texto: admin ? 'Importe uma planilha, copie o cadastro de outra empresa ou cadastre o primeiro produto.' : 'Peça a um administrador para cadastrar os produtos.',
              acoes: admin ? '<button type="button" class="btn btn-primary" data-acao="importar">Importar planilha</button><button type="button" class="btn btn-secondary" data-acao="clonar">Clonar de outra empresa</button><button type="button" class="btn btn-secondary" data-acao="novo">Novo produto</button>' : '' });
      return;
    }
    const paginas = Math.ceil(total / POR_PAGINA);
    const ini = (pagina - 1) * POR_PAGINA + 1, fim = ini + data.length - 1;
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-lista">
      <thead><tr><th scope="col">Código</th><th scope="col">Produto</th><th scope="col">Unidade</th><th scope="col">Código de barras</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${data.map(p => `<tr class="${p.ativo ? '' : 'inativa'} ${destacar && p.codigo_produto === destacar ? 'recente' : ''}">
        <td class="codigo so-desktop">${escapeHtml(p.codigo_produto)}</td>
        <td class="l-titulo"><span class="forte">${escapeHtml(p.nome_produto)}</span>${p.ativo ? '' : ' <span class="badge badge-neutro">Inativo</span>'}
          <span class="sub so-celular-bloco">${partesHtml([`<span class="codigo">${escapeHtml(p.codigo_produto)}</span>`, escapeHtml(p.unidade_medida ?? '—'), p.codigo_barras ? `<span class="codigo">${escapeHtml(p.codigo_barras)}</span>` : ''])}</span></td>
        <td class="so-desktop">${escapeHtml(p.unidade_medida ?? '—')}</td>
        <td class="codigo so-desktop">${escapeHtml(p.codigo_barras ?? '—')}</td>
        <td>${admin ? `<div class="acoes-linha"><button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${escapeHtml(p.id)}" aria-label="Editar ${escapeHtml(p.nome_produto)}">Editar</button></div>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="tabela-rodape">
      <span>${paginas > 1 ? `${fmtInt(ini)}–${fmtInt(fim)} de ${plural(total, 'produto', 'produtos')}` : plural(total, 'produto', 'produtos')}</span>
      ${paginas > 1 ? `<nav class="paginacao" aria-label="Páginas">
        <button type="button" class="btn btn-secondary btn-sm" data-acao="pag" data-dir="-1" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="nowrap">Página ${pagina} de ${paginas}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-acao="pag" data-dir="1" ${pagina >= paginas ? 'disabled' : ''}>Próxima</button>
      </nav>` : ''}
    </div>`;
    destacar = null;
  };

  // Depois de cadastrar, importar ou clonar, a lista mostra o resultado (na empresa certa)
  const concluir = (id, opcoes) => trocarEmpresa(id ?? empresaId, opcoes);
  delegarAcoes(el, {
    pag: ({ dir }, btn) => { btn.disabled = true; pagina = Math.max(1, pagina + Number(dir)); carregar().then(() => window.scrollTo({ top: 0 })); },
    limpar: () => { busca = ''; $('#prodBusca').value = ''; carregar(); },
    comInativos: () => { inativos = true; $('#prodInativos').checked = true; pagina = 1; carregar(); },
    novo: () => abrirProduto(null, empresas, empresaId, concluir),
    editar: ({ id }) => abrirProduto(id, empresas, empresaId, () => carregar()),
    importar: () => abrirImportacao(empresas, empresaId, perfil, concluir),
    clonar: () => abrirClonagem(empresas, empresaId, concluir),
  });
  await carregar();
}

// ── Produto ─────────────────────────────────────────────────
async function abrirProduto(id, empresas, empresaAtual, aoSalvar) {
  let p = { empresa_id: empresaAtual, ativo: true };
  if (id) {
    try { p = await buscarProdutoPorId(id); }
    catch (err) { showToast(mensagemErro(err, 'abrir produto'), 'error'); return; }
  }
  const empresaDoProduto = empresas.find(e => e.id === p.empresa_id);
  abrirModal({
    titulo: id ? 'Editar produto' : 'Novo produto',
    subtitulo: id ? escapeHtml(empresaDoProduto?.nome ?? '') : '',
    corpo: `
      ${id ? '' : `<div class="form-group"><label class="form-label" for="prodEmp">Empresa</label>
        <select class="form-input" id="prodEmp">${empresas.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === p.empresa_id ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')}</select></div>`}
      <div class="form-group"><label class="form-label" for="prodNome">Nome do produto</label>
        <input class="form-input" id="prodNome" maxlength="160" value="${escapeHtml(p.nome_produto ?? '')}" required data-foco/></div>
      <div class="grade-2 grade-fixa">
        <div class="form-group"><label class="form-label" for="prodCodigo">Código</label>
          <input class="form-input" id="prodCodigo" maxlength="40" style="text-transform:uppercase" value="${escapeHtml(p.codigo_produto ?? '')}" required/></div>
        <div class="form-group"><label class="form-label" for="prodUnidade">Unidade</label>
          <input class="form-input" id="prodUnidade" list="listaUnidades" maxlength="10" style="text-transform:uppercase" placeholder="UN, CX, KG…" value="${escapeHtml(p.unidade_medida ?? '')}"/>
          <datalist id="listaUnidades">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist></div>
      </div>
      <div class="form-group"><label class="form-label" for="prodBarras">Código de barras <span class="opcional">(opcional)</span></label>
        <input class="form-input" id="prodBarras" inputmode="numeric" maxlength="20" value="${escapeHtml(p.codigo_barras ?? '')}"/></div>
      ${id ? `<div class="form-group"><label class="checagem" style="color:var(--text)"><input type="checkbox" id="prodAtivo" ${p.ativo ? 'checked' : ''}/> Produto ativo</label>
        <span class="form-hint">Produtos inativos não aparecem na contagem.</span></div>` : ''}`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: m => m.fechar() },
      { texto: id ? 'Salvar alterações' : 'Cadastrar produto', classe: 'btn-primary', tipo: 'submit' },
    ],
    aoEnviar: async m => {
      const nome = m.$('#prodNome'), codigo = m.$('#prodCodigo');
      if (!codigo.value.trim()) marcarInvalido(codigo, 'Informe o código.');
      if (!nome.value.trim()) marcarInvalido(nome, 'Informe o nome do produto.');
      const vazio = [nome, codigo].find(c => !c.value.trim());
      if (vazio) { vazio.focus(); return; }
      const cod = codigo.value.trim().toUpperCase();
      const empresaDestino = id ? p.empresa_id : m.$('#prodEmp').value;
      const barras = m.$('#prodBarras'), ean = barras.value.trim();
      const ficaAtivo = id ? m.$('#prodAtivo').checked : true;
      m.ocupado(true, 'Salvando…');
      // Dois produtos ativos com o mesmo código de barras confundem o leitor na contagem
      if (ean && ficaAtivo) {
        const dono = await buscarProdutoPorBarras(empresaDestino, ean).catch(() => null);
        if (dono && dono.id !== id) {
          m.ocupado(false);
          marcarInvalido(barras, `Este código de barras já é do produto ${dono.codigo_produto} · ${dono.nome_produto}.`);
          barras.focus(); return;
        }
      }
      const campos = {
        empresa_id: empresaDestino,
        codigo_produto: codigo.value, nome_produto: nome.value,
        unidade_medida: m.$('#prodUnidade').value, codigo_barras: m.$('#prodBarras').value,
        ...(id ? { ativo: m.$('#prodAtivo').checked } : {}),
      };
      try {
        if (id) await atualizarProduto(id, campos); else await criarProduto(campos);
        m.fechar();
        showToast(`Produto ${cod} ${id ? 'atualizado' : 'cadastrado'}.`, 'success');
        await aoSalvar(campos.empresa_id, id ? {} : { codigo: cod });
      } catch (err) {
        m.ocupado(false);
        if (/duplicate|23505/i.test(err.message) && /barras/i.test(err.message)) { marcarInvalido(barras, 'Este código de barras já é de outro produto ativo desta empresa.'); barras.focus(); return; }
        if (/duplicate|23505/i.test(err.message)) {
          const outro = await buscarCadastroPorCodigo(campos.empresa_id, cod).catch(() => null);
          marcarInvalido(codigo, outro && !outro.ativo
            ? `O código ${cod} é de um produto inativo (${outro.nome_produto}). Para usá-lo de novo, marque “Mostrar inativos” na lista e reative o produto.`
            : `Já existe um produto com o código ${cod} nesta empresa.`);
          codigo.focus(); return;
        }
        showToast(mensagemErro(err, 'salvar produto'), 'error');
      }
    },
  });
}

// ── Importação ──────────────────────────────────────────────
// A planilha é lida pelo ExcelJS (js/produtos.js, lerPlanilha). A prévia
// aponta, com o número da linha na planilha, o que vai ficar de fora:
// linha sem código ou nome, código repetido e código de barras repetido
// (na própria planilha ou já usado por outro produto ativo da empresa).
function abrirImportacao(empresas, empresaAtual, perfil, aoConcluir) {
  let lida = null, prontas = [], ignoradas = [], concluido = false, gravouAlgo = false, empresaFeita = null, seqPrevia = 0;
  const m = abrirModal({
    titulo: 'Importar planilha de produtos',
    subtitulo: 'Planilha do Excel (.xlsx) com as colunas <strong>codigo</strong> e <strong>nome</strong>; <strong>unidade</strong> e <strong>codigo_barras</strong> são opcionais. Códigos que já existem são atualizados, e uma célula vazia não apaga o que já está cadastrado.',
    largura: 'lg',
    corpo: `
      <div class="form-group" id="impGrupoEmpresa"><label class="form-label" for="impEmpresa">Empresa</label>
        <select class="form-input" id="impEmpresa">${empresas.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === empresaAtual ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')}</select></div>
      <div class="form-group" id="impGrupoArquivo"><span class="form-label" id="impRotulo">Arquivo</span>
        <label class="zona-arquivo">${ICONS.baixar.replace('<svg', '<svg style="transform:rotate(180deg);width:18px;height:18px;color:var(--text-faint)"')}
          <span class="zona-arquivo-nome" id="impNome">Escolha a planilha (.xlsx)</span>
          <input type="file" id="impArquivo" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr-only" aria-labelledby="impRotulo impNome"/></label>
        <span class="form-hint">Não tem a planilha no formato? <button type="button" class="link" id="impModelo">Baixar modelo</button></span></div>
      <div id="impPrevia" aria-live="polite"></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: mm => mm.fechar() },
      { texto: 'Importar', classe: 'btn-primary', tipo: 'submit', id: 'btnImportar' },
    ],
    aoEnviar: importar,
    aoFechar: () => { if (concluido || gravouAlgo) aoConcluir(empresaFeita); },
  });
  const btnImp = m.$('#btnImportar');
  btnImp.disabled = true;

  m.$('#impModelo').addEventListener('click', async () => {
    try {
      const ExcelJS = await carregarScript(`${CDN}/exceljs/4.4.0/exceljs.min.js`, 'ExcelJS');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Produtos', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [{ header: 'codigo', width: 12 }, { header: 'nome', width: 42 }, { header: 'unidade', width: 10 }, { header: 'codigo_barras', width: 18 }];
      ws.addRow(['100101', 'Arroz Branco Tipo 1 5kg', 'PCT', '7891234567895']);
      ws.addRow(['100102', 'Queijo Muçarela Fatiado', 'KG', '']);
      ws.getRow(1).font = { bold: true };
      ws.getColumn(1).numFmt = '@';
      ws.getColumn(4).numFmt = '@';
      baixarArquivo(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'modelo-produtos-audistock.xlsx');
    } catch (err) { showToast(mensagemErro(err, 'baixar modelo'), 'error'); }
  });

  m.$('#impArquivo').addEventListener('change', async e => {
    const arquivo = e.target.files[0];
    const previa = m.$('#impPrevia');
    lida = null; prontas = []; btnImp.disabled = true; ++seqPrevia;
    m.$('#impNome').textContent = arquivo ? arquivo.name : 'Escolha a planilha (.xlsx)';
    m.$('#impNome').classList.toggle('escolhido', !!arquivo);
    if (!arquivo) { previa.innerHTML = ''; return; }
    if (!/\.xlsx$/i.test(arquivo.name)) {
      previa.innerHTML = `<div class="aviso aviso-perigo">${ICONS.erro}<p>Este arquivo não é uma planilha .xlsx. No Excel, use “Salvar como” e escolha “Pasta de Trabalho do Excel (.xlsx)”.</p></div>`;
      return;
    }
    previa.innerHTML = '<p class="form-hint">Lendo a planilha…</p>';
    try {
      lida = await lerPlanilha(arquivo);
      await desenharPrevia();
    } catch (err) {
      console.warn('[importação]', err);
      previa.innerHTML = `<div class="aviso aviso-perigo">${ICONS.erro}<p>${escapeHtml(/carregar/.test(err.message) ? err.message : 'Não foi possível ler o arquivo. Confira se é uma planilha .xlsx válida.')}</p></div>`;
    }
  });
  // A conferência dos códigos de barras depende da empresa escolhida
  m.$('#impEmpresa').addEventListener('change', () => { if (lida) desenharPrevia(); });

  async function desenharPrevia() {
    const minha = ++seqPrevia;
    const previa = m.$('#impPrevia');
    btnImp.disabled = true;
    let catalogo = [], semConferir = false;
    try { catalogo = await listarCatalogo(m.$('#impEmpresa').value); } catch (_) { semConferir = true; }
    if (minha !== seqPrevia) return;   // trocou de arquivo ou de empresa no meio

    const donoDoEan = new Map(catalogo.filter(x => x.codigo_barras).map(x => [x.codigo_barras, x]));
    const codigos = new Map(), eans = new Map();
    prontas = []; ignoradas = [];
    for (const l of lida.linhas) {
      const codigo = l.codigo.toUpperCase(), ean = l.codigo_barras;
      let motivo = null;
      if (!codigo || !l.nome) motivo = !codigo ? 'sem código' : 'sem nome';
      else if (codigos.has(codigo)) motivo = `código ${codigo} repetido (já está na linha ${codigos.get(codigo)})`;
      else if (ean && eans.has(ean)) motivo = `código de barras ${ean} repetido (já está na linha ${eans.get(ean)})`;
      else if (ean && donoDoEan.has(ean) && donoDoEan.get(ean).codigo_produto !== codigo) {
        const dono = donoDoEan.get(ean);
        motivo = `código de barras ${ean} já é do produto ${dono.codigo_produto} · ${dono.nome_produto}`;
      }
      if (motivo) { ignoradas.push({ n: l.n, motivo }); continue; }
      codigos.set(codigo, l.n);
      if (ean) eans.set(ean, l.n);
      prontas.push({ ...l, codigo, unidade: l.unidade.toUpperCase() });
    }

    if (!prontas.length) {
      // Só linhas repetidas: mostra quais; nenhuma com código e nome: o cabeçalho não foi reconhecido
      previa.innerHTML = ignoradas.some(x => !/^sem /.test(x.motivo))
        ? avisoProblemas()
        : `<div class="aviso aviso-aviso">${ICONS.alerta}<div><p><strong>Nenhum produto reconhecido nesta planilha.</strong> A primeira linha precisa ter os cabeçalhos <strong>codigo</strong> e <strong>nome</strong> (unidade e codigo_barras são opcionais).</p>${ignoradas.length ? listaProblemas() : ''}</div></div>`;
      return;
    }
    const faltam = [!lida.colunas.unidade && 'unidade', !lida.colunas.codigo_barras && 'codigo_barras'].filter(Boolean);
    const colBarras = lida.colunas.codigo_barras;
    previa.innerHTML = `
      ${avisoProblemas()}
      ${faltam.length ? `<p class="form-hint">A planilha não tem a coluna ${faltam.map(c => `<strong>${c}</strong>`).join(' nem ')}: nos produtos que já existem, ${faltam.length > 1 ? 'esses campos ficam' : 'esse campo fica'} como ${faltam.length > 1 ? 'estão' : 'está'}.</p>` : ''}
      ${semConferir ? '<p class="form-hint">Não foi possível conferir os códigos de barras com o cadastro agora; um código repetido será recusado na gravação.</p>' : ''}
      <div class="tabela-wrap" style="border:1px solid var(--border);border-radius:var(--r)"><table>
        <thead><tr><th scope="col">Linha</th><th scope="col">Código</th><th scope="col">Nome</th><th scope="col">Unidade</th>${colBarras ? '<th scope="col">Código de barras</th>' : ''}</tr></thead>
        <tbody>${prontas.slice(0, 3).map(l => `<tr><td class="num muted">${l.n}</td><td class="codigo">${escapeHtml(l.codigo)}</td><td>${escapeHtml(l.nome)}</td><td>${escapeHtml(l.unidade || '—')}</td>${colBarras ? `<td class="codigo">${escapeHtml(l.codigo_barras || '—')}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>
      ${prontas.length > 3 ? `<p class="form-hint" style="margin-top:6px">Primeiros 3 de ${plural(prontas.length, 'produto', 'produtos')}.</p>` : ''}`;
    btnImp.disabled = false;
  }
  const listaProblemas = () => `<ul class="lista-erros">${ignoradas.slice(0, 5).map(x => `<li>Linha ${x.n}: ${escapeHtml(x.motivo)}</li>`).join('')}${ignoradas.length > 5 ? `<li>e mais ${ignoradas.length - 5}</li>` : ''}</ul>`;
  const avisoProblemas = () => `<div class="aviso ${ignoradas.length ? 'aviso-aviso' : ''}">${ignoradas.length ? ICONS.alerta : ICONS.ok}
      <div><p><strong>${plural(prontas.length, 'produto pronto', 'produtos prontos')} para importar</strong>${ignoradas.length ? ` · ${plural(ignoradas.length, 'linha será ignorada', 'linhas serão ignoradas')}` : ''}.</p>
      ${ignoradas.length ? listaProblemas() : ''}</div></div>`;

  async function importar(mm) {
    if (concluido) { mm.fechar(); return; }
    if (!prontas.length) return;
    const empresaId = mm.$('#impEmpresa').value;
    const campos = [mm.$('#impEmpresa'), mm.$('#impArquivo')];
    mm.ocupado(true, 'Importando…');
    campos.forEach(c => { c.disabled = true; });
    const previa = mm.$('#impPrevia');
    previa.insertAdjacentHTML('afterbegin', `<div class="importando" id="impProgresso"><div class="importando-linha"><span>Gravando os produtos… não feche esta janela.</span><strong id="impPct">0%</strong></div>
      <div class="barra" role="progressbar" aria-label="Progresso da importação" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div></div>`);
    const progredir = (feitos, total) => {
      const pct = total ? Math.round(feitos / total * 100) : 100;
      if (feitos) { gravouAlgo = true; empresaFeita = empresaId; }
      mm.$('#impPct').textContent = `${pct}%`;
      mm.$('#impProgresso .barra').setAttribute('aria-valuenow', pct);
      mm.$('#impProgresso .barra i').style.width = `${pct}%`;
    };
    try {
      const r = await importarProdutosExcel(empresaId, prontas, perfil.id, { aoProgredir: progredir, totalLinhas: lida.linhas.length, ignoradas });
      concluido = true; empresaFeita = empresaId;
      mm.semAlteracoes();
      const nomeEmp = empresas.find(e => e.id === empresaId)?.nome ?? '';
      const falhas = [...ignoradas.map(x => ({ linha: x.n, motivo: x.motivo })), ...r.erros].sort((a, b) => a.linha - b.linha);
      const partes = [r.criados && plural(r.criados, 'produto criado', 'produtos criados'), r.atualizados && plural(r.atualizados, 'atualizado', 'atualizados'), falhas.length && plural(falhas.length, 'linha não importada', 'linhas não importadas')].filter(Boolean);
      mm.$('#impGrupoEmpresa').hidden = true; mm.$('#impGrupoArquivo').hidden = true;
      previa.innerHTML = `<div class="aviso ${falhas.length ? 'aviso-aviso' : 'aviso-sucesso'}">${falhas.length ? ICONS.alerta : ICONS.ok}
        <div><p><strong>Importação concluída em ${escapeHtml(nomeEmp)}.</strong> ${partes.join(' · ') || 'Nenhuma alteração'}.</p>
        ${falhas.length ? `<ul class="lista-erros">${falhas.slice(0, 5).map(x => `<li>Linha ${x.linha}: ${escapeHtml(x.motivo)}</li>`).join('')}${falhas.length > 5 ? `<li>e mais ${falhas.length - 5}</li>` : ''}</ul>` : ''}</div></div>`;
      mm.ocupado(false);
      btnImp.textContent = 'Ver produtos';
      mm.$('.modal-rodape .btn-secondary').hidden = true;
      btnImp.focus();
    } catch (err) {
      mm.$('#impProgresso')?.remove(); mm.ocupado(false);
      campos.forEach(c => { c.disabled = false; });
      showToast(mensagemErro(err, 'importar planilha'), 'error', 9000);
    }
  }
}

// ── Clonagem ────────────────────────────────────────────────
function abrirClonagem(empresas, empresaAtual, aoConcluir) {
  if (empresas.length < 2) { showToast('É preciso ter pelo menos duas empresas ativas para clonar produtos.', 'warning'); return; }
  let seq = 0, nOrigem = null, nDestino = null;
  const opcoes = (excluir, sel) => empresas.filter(e => e.id !== excluir).map(e => `<option value="${escapeHtml(e.id)}" ${e.id === sel ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('');
  const nome = id => empresas.find(e => e.id === id)?.nome ?? '';
  const m = abrirModal({
    titulo: 'Clonar produtos',
    subtitulo: 'Copia o cadastro de produtos ativos de uma empresa para outra. Códigos que já existem no destino são atualizados.',
    corpo: `
      <div class="form-group"><label class="form-label" for="clOrigem">Copiar de</label>
        <select class="form-input" id="clOrigem">${opcoes(null, empresaAtual)}</select></div>
      <div class="form-group"><label class="form-label" for="clDestino">Para</label>
        <select class="form-input" id="clDestino"><option value="">Escolha a empresa de destino</option>${opcoes(empresaAtual)}</select></div>
      <p class="modal-texto" id="clResumo" aria-live="polite"></p>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: mm => mm.fechar() },
      { texto: 'Clonar produtos', classe: 'btn-primary', tipo: 'submit', id: 'btnClonar' },
    ],
    aoEnviar: async mm => {
      const origem = mm.$('#clOrigem').value, destino = mm.$('#clDestino').value;
      if (!destino) { marcarInvalido(mm.$('#clDestino'), 'Escolha a empresa de destino.'); mm.$('#clDestino').focus(); return; }
      if (nDestino) {
        const ok = await fmConfirm({ titulo: `${nome(destino)} já tem produtos`, msg: `Ela já tem ${plural(nDestino, 'produto cadastrado', 'produtos cadastrados')}. Os ${plural(nOrigem ?? 0, 'produto', 'produtos')} de ${nome(origem)} serão somados. Nos códigos repetidos, nome, unidade e código de barras são atualizados, e um produto inativo com o mesmo código volta a ficar ativo.`, confirmTxt: 'Clonar mesmo assim' });
        if (!ok) return;
      }
      mm.ocupado(true, 'Clonando…');
      try {
        const r = await clonarProdutos(origem, destino);
        mm.fechar();
        const partes = [r.criados && plural(r.criados, 'produto copiado', 'produtos copiados'), r.atualizados && plural(r.atualizados, 'atualizado', 'atualizados')].filter(Boolean);
        showToast(`${partes.join(' e ') || 'Nenhum produto copiado'} para ${nome(destino)}.${r.semEan ? ` ${plural(r.semEan, 'código de barras não foi copiado porque já é', 'códigos de barras não foram copiados porque já são')} de outro produto lá.` : ''}`, r.semEan ? 'warning' : 'success', r.semEan ? 8000 : 4000);
        await aoConcluir(destino);
      } catch (err) {
        mm.ocupado(false);
        showToast(mensagemErro(err, 'clonar produtos'), 'error', 9000);
        if (err.parcial) await aoConcluir(destino);   // parte já foi copiada: a lista mostra o destino
      }
    },
  });
  const atualizarResumo = async () => {
    const minha = ++seq;
    const origem = m.$('#clOrigem').value, atual = m.$('#clDestino').value;
    m.$('#clDestino').innerHTML = `<option value="">Escolha a empresa de destino</option>${opcoes(origem, atual !== origem ? atual : '')}`;
    const destino = m.$('#clDestino').value;
    const btn = m.$('#btnClonar');
    try {
      [nOrigem, nDestino] = await Promise.all([contarProdutosPorEmpresa(origem), destino ? contarProdutosPorEmpresa(destino) : 0]);
      if (minha !== seq) return;   // a pessoa já trocou a seleção de novo
      btn.disabled = nOrigem === 0;
      m.$('#clResumo').innerHTML = nOrigem === 0 ? `<strong>${escapeHtml(nome(origem))}</strong> não tem produtos ativos para copiar.`
        : `Serão copiados <strong>${plural(nOrigem, 'produto ativo', 'produtos ativos')}</strong> de ${escapeHtml(nome(origem))}${destino ? ` para <strong>${escapeHtml(nome(destino))}</strong>${nDestino ? `, que já tem ${plural(nDestino, 'produto', 'produtos')}` : ''}` : ''}.`;
    } catch (err) {
      if (minha !== seq) return;
      nOrigem = nDestino = null; btn.disabled = false;
      m.$('#clResumo').textContent = 'Não foi possível contar os produtos agora. Você pode clonar mesmo assim.';
    }
  };
  m.$('#clOrigem').addEventListener('change', atualizarResumo);
  m.$('#clDestino').addEventListener('change', atualizarResumo);
  atualizarResumo();
}
