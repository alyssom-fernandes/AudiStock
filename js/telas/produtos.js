// ================================================================
//  AudiStock — js/telas/produtos.js
//  Produtos por empresa: lista paginada, busca, criar/editar,
//  importar planilha (com prévia e relatório de linhas com erro)
//  e clonar o cadastro de uma empresa para outra.
// ================================================================

import { hasRole } from '../auth.js';
import { listarEmpresas, contarProdutosPorEmpresa } from '../empresas.js';
import { listarProdutos, buscarProdutoPorId, criarProduto, atualizarProduto, importarProdutosExcel, clonarProdutos, normalizarLinhaPlanilha } from '../produtos.js';
import { baixarArquivo } from '../relatorios.js';
import { escapeHtml, fmtInt, plural, vazioHtml, erroCargaHtml, abrirModal, fmConfirm, showToast, debounce, delegarAcoes,
         marcarInvalido, ICONS, mensagemErro, carregarScript } from '../ui.js';

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
    card.innerHTML = vazioHtml({ titulo: 'Cadastre uma empresa antes dos produtos', texto: 'Cada produto pertence a uma empresa. Depois de cadastrá-la, importe a planilha de produtos.', acoes: '<a class="btn btn-primary" href="app.html?tela=empresas&nova=1">Cadastrar empresa</a>' });
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
          <span class="sub so-celular-bloco"><span class="codigo">${escapeHtml(p.codigo_produto)}</span> · ${escapeHtml(p.unidade_medida ?? '—')}${p.codigo_barras ? ` · <span class="codigo">${escapeHtml(p.codigo_barras)}</span>` : ''}</span></td>
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
      const campos = {
        empresa_id: id ? p.empresa_id : m.$('#prodEmp').value,
        codigo_produto: codigo.value, nome_produto: nome.value,
        unidade_medida: m.$('#prodUnidade').value, codigo_barras: m.$('#prodBarras').value,
        ...(id ? { ativo: m.$('#prodAtivo').checked } : {}),
      };
      m.ocupado(true, 'Salvando…');
      try {
        if (id) await atualizarProduto(id, campos); else await criarProduto(campos);
        m.fechar();
        showToast(`Produto ${cod} ${id ? 'atualizado' : 'cadastrado'}.`, 'success');
        await aoSalvar(campos.empresa_id, id ? {} : { codigo: cod });
      } catch (err) {
        m.ocupado(false);
        if (/duplicate|23505/i.test(err.message)) { marcarInvalido(codigo, `Já existe um produto com o código ${cod} nesta empresa.`); codigo.focus(); return; }
        showToast(mensagemErro(err, 'salvar produto'), 'error');
      }
    },
  });
}

// ── Importação ──────────────────────────────────────────────
function abrirImportacao(empresas, empresaAtual, perfil, aoConcluir) {
  let linhas = [], concluido = false, empresaFeita = null;
  const m = abrirModal({
    titulo: 'Importar planilha de produtos',
    subtitulo: 'Planilha Excel (.xlsx) com as colunas <strong>codigo</strong>, <strong>nome</strong>, <strong>unidade</strong> e <strong>codigo_barras</strong>. Códigos que já existem são atualizados.',
    largura: 'lg',
    corpo: `
      <div class="form-group" id="impGrupoEmpresa"><label class="form-label" for="impEmpresa">Empresa</label>
        <select class="form-input" id="impEmpresa">${empresas.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === empresaAtual ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')}</select></div>
      <div class="form-group" id="impGrupoArquivo"><span class="form-label" id="impRotulo">Arquivo</span>
        <label class="zona-arquivo">${ICONS.baixar.replace('<svg', '<svg style="transform:rotate(180deg);width:18px;height:18px;color:var(--text-faint)"')}
          <span class="zona-arquivo-nome" id="impNome">Escolha a planilha (.xlsx)</span>
          <input type="file" id="impArquivo" accept=".xlsx,.xls" class="sr-only" aria-labelledby="impRotulo impNome"/></label>
        <span class="form-hint">Não tem a planilha no formato? <button type="button" class="link" id="impModelo">Baixar modelo</button></span></div>
      <div id="impPrevia" aria-live="polite"></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: mm => mm.fechar() },
      { texto: 'Importar', classe: 'btn-primary', tipo: 'submit', id: 'btnImportar' },
    ],
    aoEnviar: importar,
    aoFechar: () => { if (concluido) aoConcluir(empresaFeita); },
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
      ws.getColumn(4).numFmt = '@';
      baixarArquivo(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'modelo-produtos-audistock.xlsx');
    } catch (err) { showToast(mensagemErro(err, 'baixar modelo'), 'error'); }
  });

  m.$('#impArquivo').addEventListener('change', async e => {
    const arquivo = e.target.files[0];
    const previa = m.$('#impPrevia');
    linhas = []; btnImp.disabled = true;
    m.$('#impNome').textContent = arquivo ? arquivo.name : 'Escolha a planilha (.xlsx)';
    m.$('#impNome').classList.toggle('escolhido', !!arquivo);
    if (!arquivo) { previa.innerHTML = ''; return; }
    try {
      const XLSX = await carregarScript(`${CDN}/xlsx/0.18.5/xlsx.full.min.js`, 'XLSX');
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
      linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).map(normalizarLinhaPlanilha)
        .map(l => ({ ...l, codigo: l.codigo.toUpperCase(), unidade: l.unidade.toUpperCase() }));
      // Linha sem código ou nome, ou código repetido na própria planilha, fica de fora
      const vistos = new Map();
      const problemas = [];
      linhas.forEach((l, i) => {
        const n = i + 2;
        if (!l.codigo || !l.nome) { problemas.push({ n, motivo: !l.codigo ? 'sem código' : 'sem nome' }); l.ignorar = true; return; }
        if (vistos.has(l.codigo)) { problemas.push({ n, motivo: `código ${l.codigo} repetido (já está na linha ${vistos.get(l.codigo)})` }); l.ignorar = true; return; }
        vistos.set(l.codigo, n);
      });
      const validas = linhas.filter(l => !l.ignorar).length;
      if (!validas) {
        previa.innerHTML = `<div class="aviso aviso-aviso">${ICONS.alerta}<div><p><strong>Nenhum produto reconhecido nesta planilha.</strong> A primeira linha precisa ter os cabeçalhos <strong>codigo</strong> e <strong>nome</strong> (unidade e codigo_barras são opcionais).</p></div></div>`;
        return;
      }
      previa.innerHTML = `
        <div class="aviso ${problemas.length ? 'aviso-aviso' : ''}">${problemas.length ? ICONS.alerta : ICONS.ok}
          <div><p><strong>${plural(validas, 'produto pronto', 'produtos prontos')} para importar</strong>${problemas.length ? ` · ${plural(problemas.length, 'linha será ignorada', 'linhas serão ignoradas')}` : ''}.</p>
          ${problemas.length ? `<ul class="lista-erros">${problemas.slice(0, 5).map(x => `<li>Linha ${x.n}: ${escapeHtml(x.motivo)}</li>`).join('')}${problemas.length > 5 ? `<li>e mais ${problemas.length - 5}</li>` : ''}</ul>` : ''}</div></div>
        <div class="tabela-wrap" style="border:1px solid var(--border);border-radius:var(--r)"><table>
          <thead><tr><th scope="col">Código</th><th scope="col">Nome</th><th scope="col">Unidade</th></tr></thead>
          <tbody>${linhas.filter(l => !l.ignorar).slice(0, 3).map(l => `<tr><td class="codigo">${escapeHtml(l.codigo)}</td><td>${escapeHtml(l.nome)}</td><td>${escapeHtml(l.unidade || '—')}</td></tr>`).join('')}</tbody>
        </table></div>
        ${validas > 3 ? `<p class="form-hint" style="margin-top:6px">Primeiros 3 de ${plural(validas, 'produto', 'produtos')}.</p>` : ''}`;
      btnImp.disabled = false;
    } catch (err) {
      previa.innerHTML = `<div class="aviso aviso-perigo">${ICONS.erro}<p>${escapeHtml(/carregar/.test(err.message) ? err.message : 'Não foi possível ler o arquivo. Confira se é uma planilha .xlsx válida.')}</p></div>`;
    }
  });

  async function importar(mm) {
    if (concluido) { mm.fechar(); return; }
    const empresaId = mm.$('#impEmpresa').value;
    mm.ocupado(true, 'Importando…');
    try {
      const r = await importarProdutosExcel(empresaId, linhas.filter(l => !l.ignorar), perfil.id);
      concluido = true; empresaFeita = empresaId;
      mm.semAlteracoes();
      const nomeEmp = empresas.find(e => e.id === empresaId)?.nome ?? '';
      const partes = [r.criados && plural(r.criados, 'produto criado', 'produtos criados'), r.atualizados && plural(r.atualizados, 'atualizado', 'atualizados'), r.erros.length && plural(r.erros.length, 'linha com erro', 'linhas com erro')].filter(Boolean);
      mm.$('#impGrupoEmpresa').hidden = true; mm.$('#impGrupoArquivo').hidden = true;
      mm.$('#impPrevia').innerHTML = `<div class="aviso ${r.erros.length ? 'aviso-aviso' : 'aviso-sucesso'}">${r.erros.length ? ICONS.alerta : ICONS.ok}
        <div><p><strong>Importação concluída em ${escapeHtml(nomeEmp)}.</strong> ${partes.join(' · ') || 'Nenhuma alteração'}.</p>
        ${r.erros.length ? `<ul class="lista-erros">${r.erros.slice(0, 5).map(x => `<li>Linha ${x.linha}: ${escapeHtml(x.motivo)}</li>`).join('')}${r.erros.length > 5 ? `<li>e mais ${r.erros.length - 5}</li>` : ''}</ul>` : ''}</div></div>`;
      mm.ocupado(false);
      btnImp.textContent = 'Ver produtos';
      mm.$('.modal-rodape .btn-secondary').hidden = true;
    } catch (err) { mm.ocupado(false); showToast(mensagemErro(err, 'importar planilha'), 'error'); }
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
        const ok = await fmConfirm({ titulo: `${nome(destino)} já tem produtos`, msg: `Ela já tem ${plural(nDestino, 'produto cadastrado', 'produtos cadastrados')}. Os ${plural(nOrigem ?? 0, 'produto', 'produtos')} de ${nome(origem)} serão somados, e os códigos repetidos terão nome, unidade e código de barras atualizados.`, confirmTxt: 'Clonar mesmo assim' });
        if (!ok) return;
      }
      mm.ocupado(true, 'Clonando…');
      try {
        const r = await clonarProdutos(origem, destino);
        mm.fechar();
        const partes = [r.criados && plural(r.criados, 'produto copiado', 'produtos copiados'), r.atualizados && plural(r.atualizados, 'atualizado', 'atualizados')].filter(Boolean);
        showToast(`${partes.join(' e ') || 'Nenhum produto copiado'} para ${nome(destino)}.`, 'success');
        await aoConcluir(destino);
      } catch (err) { mm.ocupado(false); showToast(mensagemErro(err, 'clonar produtos'), 'error'); }
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
