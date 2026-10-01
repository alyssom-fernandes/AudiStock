// ================================================================
//  AudiStock — js/telas/produtos.js
//  Produtos por empresa: lista paginada, busca, criar/editar,
//  importar planilha (com prévia e relatório de linhas com erro)
//  e clonar o cadastro de uma empresa para outra.
// ================================================================

import { hasRole } from '../auth.js';
import { listarEmpresas, contarProdutosPorEmpresa } from '../empresas.js';
import { listarProdutos, buscarProdutoPorId, criarProduto, atualizarProduto, importarProdutosExcel, clonarProdutos, normalizarLinhaPlanilha } from '../produtos.js';
import { escapeHtml, fmtInt, plural, vazioHtml, erroCargaHtml, abrirModal, showToast, debounce, delegarAcoes, ICONS,
         mensagemErro, carregarScript } from '../ui.js';

const POR_PAGINA = 50;
const UNIDADES = ['UN', 'PCT', 'CX', 'FD', 'KG', 'G', 'L', 'ML', 'M', 'SC', 'CT', 'RL', 'GL', 'BD', 'BR', 'PR', 'DZ'];
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

export async function render(el, { perfil, params }) {
  const admin = hasRole('administrador');
  let empresas = [], empresaId = params.get('empresa') || '', busca = '', pagina = 1, inativos = false, total = 0, req = 0;

  el.innerHTML = `
    <div class="toolbar">
      <label class="sr-only" for="prodEmpresa">Empresa</label>
      <select class="form-input" id="prodEmpresa" style="width:230px"></select>
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar produto</span>
        <input class="form-input" type="search" id="prodBusca" placeholder="Nome, código ou código de barras" autocomplete="off"/></label>
      <label class="checagem"><input type="checkbox" id="prodInativos"/> Mostrar inativos</label>
      ${admin ? `<div class="toolbar-acoes"><button type="button" class="btn btn-secondary" data-acao="importar">Importar planilha</button>
        <button type="button" class="btn btn-secondary" data-acao="clonar">Clonar</button>
        <button type="button" class="btn btn-primary" data-acao="novo">${ICONS.mais}Novo produto</button></div>` : ''}
    </div>
    <div class="card" id="prodCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#prodCard');
  const nomeEmpresa = () => empresas.find(e => e.id === empresaId)?.nome ?? '';

  try { empresas = await listarEmpresas({ apenasAtivas: true }); }
  catch (err) { card.innerHTML = erroCargaHtml("irPara('produtos')"); return; }

  if (!empresas.length) {
    $('.toolbar').remove();
    card.innerHTML = vazioHtml({ titulo: 'Cadastre uma empresa antes dos produtos', texto: 'Cada produto pertence a uma empresa. Depois de cadastrá-la, importe a planilha de produtos.', acoes: '<a class="btn btn-primary" href="app.html?tela=empresas&nova=1">Cadastrar empresa</a>' });
    return;
  }
  if (!empresas.some(e => e.id === empresaId)) empresaId = empresas[0].id;
  $('#prodEmpresa').innerHTML = empresas.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === empresaId ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('');

  const carregar = async () => {
    const minha = ++req;
    try {
      const { data, count } = await listarProdutos(empresaId, { q: busca, apenasAtivos: !inativos, page: pagina, limit: POR_PAGINA });
      if (minha !== req) return;   // resposta de uma busca antiga
      total = count;
      if (!data.length && pagina > 1) { pagina = Math.max(1, Math.ceil(total / POR_PAGINA)); return carregar(); }
      desenhar(data);
    } catch (err) {
      if (minha !== req) return;
      console.error(err);
      card.innerHTML = erroCargaHtml("irPara('produtos')");
    }
  };

  const desenhar = data => {
    if (!data.length) {
      card.innerHTML = busca
        ? vazioHtml({ titulo: `Nenhum produto para “${escapeHtml(busca)}”`, texto: `em ${escapeHtml(nomeEmpresa())}`, acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="limpar">Limpar busca</button>', compacto: true })
        : vazioHtml({ titulo: 'Esta empresa ainda não tem produtos', texto: 'Importe uma planilha, copie o cadastro de outra empresa ou cadastre o primeiro produto.',
            acoes: admin ? '<button type="button" class="btn btn-primary" data-acao="importar">Importar planilha</button><button type="button" class="btn btn-secondary" data-acao="clonar">Clonar de outra empresa</button><button type="button" class="btn btn-secondary" data-acao="novo">Novo produto</button>' : '' });
      return;
    }
    const paginas = Math.ceil(total / POR_PAGINA);
    const ini = (pagina - 1) * POR_PAGINA + 1, fim = ini + data.length - 1;
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-lista">
      <thead><tr><th scope="col">Código</th><th scope="col">Produto</th><th scope="col">Unidade</th><th scope="col">Código de barras</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${data.map(p => `<tr class="${p.ativo ? '' : 'inativa'}">
        <td class="codigo so-desktop">${escapeHtml(p.codigo_produto)}</td>
        <td class="l-titulo"><span class="forte">${escapeHtml(p.nome_produto)}</span>${p.ativo ? '' : ' <span class="badge">Inativo</span>'}
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
  };

  $('#prodEmpresa').addEventListener('change', e => {
    empresaId = e.target.value; pagina = 1;
    const url = new URL(location.href); url.searchParams.set('empresa', empresaId); history.replaceState({}, '', url);
    carregar();
  });
  $('#prodBusca').addEventListener('input', debounce(e => { busca = e.target.value.trim(); pagina = 1; carregar(); }, 300));
  $('#prodInativos').addEventListener('change', e => { inativos = e.target.checked; pagina = 1; carregar(); });

  const recarregar = () => carregar();
  delegarAcoes(el, {
    pag: ({ dir }, btn) => { btn.disabled = true; pagina = Math.max(1, pagina + Number(dir)); carregar().then(() => window.scrollTo({ top: 0 })); },
    limpar: () => { busca = ''; $('#prodBusca').value = ''; carregar(); },
    novo: () => abrirProduto(null, empresas, empresaId, recarregar),
    editar: ({ id }) => abrirProduto(id, empresas, empresaId, recarregar),
    importar: () => abrirImportacao(empresas, empresaId, perfil, recarregar),
    clonar: () => abrirClonagem(empresas, empresaId, recarregar),
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
        <input class="form-input" id="prodNome" maxlength="160" value="${escapeHtml(p.nome_produto ?? '')}" required/></div>
      <div class="grade-2">
        <div class="form-group"><label class="form-label" for="prodCodigo">Código</label>
          <input class="form-input" id="prodCodigo" maxlength="40" style="text-transform:uppercase" value="${escapeHtml(p.codigo_produto ?? '')}" required/></div>
        <div class="form-group"><label class="form-label" for="prodUnidade">Unidade</label>
          <input class="form-input" id="prodUnidade" list="listaUnidades" maxlength="10" style="text-transform:uppercase" placeholder="UN, CX, KG…" value="${escapeHtml(p.unidade_medida ?? '')}"/>
          <datalist id="listaUnidades">${UNIDADES.map(u => `<option value="${u}">`).join('')}</datalist></div>
      </div>
      <div class="form-group"><label class="form-label" for="prodBarras">Código de barras <span class="opcional">(opcional)</span></label>
        <input class="form-input" id="prodBarras" inputmode="numeric" maxlength="20" value="${escapeHtml(p.codigo_barras ?? '')}"/></div>
      ${id ? `<label class="checagem"><input type="checkbox" id="prodAtivo" ${p.ativo ? 'checked' : ''}/> Produto ativo <span class="opcional muted">— inativos não aparecem na contagem</span></label>` : ''}`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: m => m.fechar() },
      { texto: id ? 'Salvar alterações' : 'Cadastrar produto', classe: 'btn-primary', tipo: 'submit' },
    ],
    aoEnviar: async m => {
      const nome = m.$('#prodNome'), codigo = m.$('#prodCodigo');
      const vazio = [nome, codigo].find(c => !c.value.trim());
      if (vazio) { vazio.setAttribute('aria-invalid', 'true'); vazio.focus(); showToast('Informe o nome e o código do produto.', 'warning'); return; }
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
        showToast(`Produto ${campos.codigo_produto.trim().toUpperCase()} ${id ? 'atualizado' : 'cadastrado'}.`, 'success');
        await aoSalvar();
      } catch (err) {
        m.ocupado(false);
        const dup = /duplicate|23505/i.test(err.message);
        if (dup) { codigo.setAttribute('aria-invalid', 'true'); codigo.focus(); }
        showToast(dup ? `Já existe um produto com o código ${campos.codigo_produto.trim().toUpperCase()} nesta empresa.` : mensagemErro(err, 'salvar produto'), 'error');
      }
    },
  });
}

// ── Importação ──────────────────────────────────────────────
function abrirImportacao(empresas, empresaAtual, perfil, aoConcluir) {
  let linhas = [], concluido = false;
  const m = abrirModal({
    titulo: 'Importar planilha de produtos',
    subtitulo: 'Planilha Excel (.xlsx) com as colunas <strong>codigo</strong>, <strong>nome</strong>, <strong>unidade</strong> e <strong>codigo_barras</strong>. Códigos que já existem são atualizados.',
    largura: 'lg',
    corpo: `
      <div class="form-group"><label class="form-label" for="impEmpresa">Empresa</label>
        <select class="form-input" id="impEmpresa">${empresas.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === empresaAtual ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label" for="impArquivo">Arquivo</label>
        <input class="form-input" type="file" id="impArquivo" accept=".xlsx,.xls"/>
        <span class="form-hint">Não tem a planilha no formato? <button type="button" class="link" id="impModelo">Baixar modelo</button></span></div>
      <div id="impPrevia" aria-live="polite"></div>`,
    acoes: [
      { texto: 'Cancelar', classe: 'btn-secondary', acao: mm => mm.fechar() },
      { texto: 'Importar', classe: 'btn-primary', tipo: 'submit', id: 'btnImportar' },
    ],
    aoEnviar: importar,
  });
  const btnImp = m.$('#btnImportar');
  btnImp.disabled = true;

  m.$('#impModelo').addEventListener('click', async () => {
    try {
      const XLSX = await carregarScript(XLSX_URL, 'XLSX');
      const ws = XLSX.utils.aoa_to_sheet([['codigo', 'nome', 'unidade', 'codigo_barras'], ['100101', 'Arroz Branco Tipo 1 5kg', 'PCT', '7891234567895'], ['100102', 'Queijo Muçarela Fatiado', 'KG', '']]);
      ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 16 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
      XLSX.writeFile(wb, 'modelo-produtos-audistock.xlsx');
    } catch (err) { showToast(err.message, 'error'); }
  });

  m.$('#impArquivo').addEventListener('change', async e => {
    const arquivo = e.target.files[0];
    const previa = m.$('#impPrevia');
    linhas = []; btnImp.disabled = true;
    if (!arquivo) { previa.innerHTML = ''; return; }
    try {
      const XLSX = await carregarScript(XLSX_URL, 'XLSX');
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
      const brutas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      linhas = brutas.map(normalizarLinhaPlanilha);
      const invalidas = linhas.map((l, i) => ({ l, n: i + 2 })).filter(x => !x.l.codigo || !x.l.nome);
      const validas = linhas.length - invalidas.length;
      if (!linhas.length) {
        previa.innerHTML = `<div class="aviso aviso-aviso">${ICONS.alerta}<p>A planilha está vazia ou a primeira linha não tem os cabeçalhos esperados.</p></div>`;
        return;
      }
      previa.innerHTML = `
        <div class="aviso ${invalidas.length ? 'aviso-aviso' : ''}">${invalidas.length ? ICONS.alerta : ICONS.ok}
          <div><p><strong>${plural(validas, 'produto pronto', 'produtos prontos')} para importar</strong>${invalidas.length ? ` · ${plural(invalidas.length, 'linha será ignorada', 'linhas serão ignoradas')}` : ''}.</p>
          ${invalidas.length ? `<ul class="lista-erros">${invalidas.slice(0, 5).map(x => `<li>Linha ${x.n}: ${!x.l.codigo ? 'sem código' : 'sem nome'}</li>`).join('')}${invalidas.length > 5 ? `<li>e mais ${invalidas.length - 5}</li>` : ''}</ul>` : ''}</div></div>
        <div class="tabela-wrap" style="border:1px solid var(--border);border-radius:var(--r)"><table>
          <thead><tr><th scope="col">Código</th><th scope="col">Nome</th><th scope="col">Unidade</th></tr></thead>
          <tbody>${linhas.slice(0, 3).map(l => `<tr><td class="codigo">${escapeHtml(l.codigo || '—')}</td><td>${escapeHtml(l.nome || '—')}</td><td>${escapeHtml(l.unidade || '—')}</td></tr>`).join('')}</tbody>
        </table></div>
        ${linhas.length > 3 ? `<p class="form-hint" style="margin-top:6px">Primeiras 3 de ${plural(linhas.length, 'linha', 'linhas')}.</p>` : ''}`;
      btnImp.disabled = validas === 0;
    } catch (err) {
      previa.innerHTML = `<div class="aviso aviso-perigo">${ICONS.erro}<p>${escapeHtml(err.message.startsWith('Não foi') ? err.message : 'Não foi possível ler o arquivo. Confira se é uma planilha .xlsx válida.')}</p></div>`;
    }
  });

  async function importar(mm) {
    if (concluido) { mm.fechar(); return; }
    const empresaId = mm.$('#impEmpresa').value;
    mm.ocupado(true, 'Importando…');
    try {
      const r = await importarProdutosExcel(empresaId, linhas, perfil.id);
      concluido = true;
      const nomeEmp = empresas.find(e => e.id === empresaId)?.nome ?? '';
      mm.$('#impPrevia').innerHTML = `<div class="aviso ${r.erros.length ? 'aviso-aviso' : 'aviso-sucesso'}">${r.erros.length ? ICONS.alerta : ICONS.ok}
        <div><p><strong>Importação concluída em ${escapeHtml(nomeEmp)}.</strong> ${plural(r.criados, 'produto criado', 'produtos criados')} · ${plural(r.atualizados, 'atualizado', 'atualizados')}${r.erros.length ? ` · ${plural(r.erros.length, 'linha com erro', 'linhas com erro')}` : ''}.</p>
        ${r.erros.length ? `<ul class="lista-erros">${r.erros.slice(0, 5).map(x => `<li>Linha ${x.linha}: ${escapeHtml(x.motivo)}</li>`).join('')}${r.erros.length > 5 ? `<li>e mais ${r.erros.length - 5}</li>` : ''}</ul>` : ''}</div></div>`;
      mm.$('#impArquivo').disabled = true; mm.$('#impEmpresa').disabled = true;
      mm.ocupado(false);
      btnImp.textContent = 'Concluir';
      mm.$('.modal-rodape .btn-secondary').hidden = true;
      await aoConcluir();
    } catch (err) { mm.ocupado(false); showToast(mensagemErro(err, 'importar planilha'), 'error'); }
  }
}

// ── Clonagem ────────────────────────────────────────────────
function abrirClonagem(empresas, empresaAtual, aoConcluir) {
  if (empresas.length < 2) { showToast('É preciso ter pelo menos duas empresas ativas para clonar produtos.', 'warning'); return; }
  const opcoes = (excluir, sel) => empresas.filter(e => e.id !== excluir).map(e => `<option value="${escapeHtml(e.id)}" ${e.id === sel ? 'selected' : ''}>${escapeHtml(e.nome)}</option>`).join('');
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
      if (!destino) { mm.$('#clDestino').setAttribute('aria-invalid', 'true'); mm.$('#clDestino').focus(); showToast('Escolha a empresa de destino.', 'warning'); return; }
      mm.ocupado(true, 'Clonando…');
      try {
        const r = await clonarProdutos(origem, destino);
        mm.fechar();
        showToast(`${plural(r.criados, 'produto criado', 'produtos criados')} e ${plural(r.atualizados, 'atualizado', 'atualizados')} em ${empresas.find(e => e.id === destino)?.nome}.`, 'success');
        await aoConcluir();
      } catch (err) { mm.ocupado(false); showToast(mensagemErro(err, 'clonar produtos'), 'error'); }
    },
  });
  const atualizarResumo = async () => {
    const origem = m.$('#clOrigem').value, destino = m.$('#clDestino').value;
    const atual = destino;
    m.$('#clDestino').innerHTML = `<option value="">Escolha a empresa de destino</option>${opcoes(origem, atual !== origem ? atual : '')}`;
    const btn = m.$('#btnClonar');
    const n = await contarProdutosPorEmpresa(origem);
    btn.disabled = n === 0;
    const nomeO = empresas.find(e => e.id === origem)?.nome, nomeD = empresas.find(e => e.id === m.$('#clDestino').value)?.nome;
    m.$('#clResumo').innerHTML = n === 0 ? `<strong>${escapeHtml(nomeO)}</strong> não tem produtos ativos para copiar.`
      : `Serão copiados <strong>${plural(n, 'produto ativo', 'produtos ativos')}</strong> de ${escapeHtml(nomeO)}${nomeD ? ` para <strong>${escapeHtml(nomeD)}</strong>` : ''}.`;
  };
  m.$('#clOrigem').addEventListener('change', atualizarResumo);
  m.$('#clDestino').addEventListener('change', e => { e.target.removeAttribute('aria-invalid'); atualizarResumo(); });
  atualizarResumo();
}
