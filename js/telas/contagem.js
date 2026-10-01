// ================================================================
//  AudiStock — js/telas/contagem.js  (contagem.html?id=…)
//  Registro da contagem física: teclado, leitor de código de barras
//  (cada leitura soma 1) ou câmera. Funciona sem internet: os
//  registros ficam numa fila (js/offline.js) e sobem quando a rede volta.
// ================================================================

import { requireAuth, getPerfil, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, plural, fmtQtd, qtdHtml, unHtml, casasDaUnidade, vazioHtml,
         abrirModal, fmConfirm, showToast, debounce, normalizar, delegarAcoes, ICONS, mensagemErro } from '../ui.js';
import { buscarProdutoUnificado, buscarProdutoPorCodigo, buscarProdutoPorBarras } from '../produtos.js';
import { buscarAuditoria, progresso } from '../auditorias.js';
import { registrarContagem, buscarItemContado, editarContagem, listarItensContados } from '../contagem.js';
import { initOfflineSync, isOnline, registrarOffline, contarPendentes } from '../offline.js';

const auth = await requireAuth();
if (auth) {
  initLayout('Contagem', { ativa: 'auditorias' });
  await iniciar();
}

async function iniciar() {
  const el = document.getElementById('pageBody');
  const perfil = getPerfil();
  const auditoriaId = new URLSearchParams(location.search).get('id');
  if (!auditoriaId) { location.replace('app.html?tela=auditorias'); return; }

  el.innerHTML = `<div class="carregando-bloco"><span class="skel" style="width:30%;height:22px"></span><span class="skel" style="width:50%"></span></div>`;
  let aud;
  try { aud = await buscarAuditoria(auditoriaId); }
  catch (err) {
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({ titulo: 'Auditoria não encontrada', texto: 'Ela pode ter sido excluída, ou o link está incompleto.', acoes: '<a class="btn btn-secondary" href="app.html?tela=auditorias">Ver auditorias</a>' })}</div>`;
    return;
  }
  definirTitulo(`Contagem ${aud.numero_auditoria}`);

  if (aud.status !== 'em_andamento') {
    const finalizada = aud.status === 'finalizada';
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({
      titulo: `A ${aud.numero_auditoria} já foi ${finalizada ? 'finalizada' : 'cancelada'}`,
      texto: 'Não é possível registrar novas contagens nesta auditoria.',
      acoes: `${finalizada ? `<a class="btn btn-primary" href="relatorios.html?id=${encodeURIComponent(aud.id)}">Ver relatório</a>` : ''}<a class="btn btn-secondary" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">Ver detalhes</a>`,
    })}</div>`;
    return;
  }

  const podeContar = hasRole('auditor');
  const estado = { modo: 'manual', produto: null, existente: null, lista: [], filtro: '', sug: [], sugIdx: -1, prog: null, limite: 40 };

  el.innerHTML = `
    <a class="voltar" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">${ICONS.voltar}Detalhes da auditoria</a>
    <div class="cabecalho">
      <div>
        <h2 class="cabecalho-titulo"><span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span> <span class="estado-conexao" id="conexao" role="status">Online</span></h2>
        <div class="cabecalho-meta"><span>${escapeHtml(aud.empresas?.nome ?? '—')}</span><span>Contagem ${aud.auditoria_cega ? 'cega' : 'visível'}</span></div>
      </div>
      ${podeContar ? `<div class="cabecalho-acoes"><button type="button" class="btn btn-secondary" id="btnFechamento">Ir para o fechamento</button></div>` : ''}
    </div>
    <div class="count-layout">
      ${podeContar ? `<section class="count-panel" aria-label="Registrar contagem">
        <div class="count-zona">
          <div class="seg" role="tablist" aria-label="Forma de leitura">
            <button type="button" role="tab" id="tabManual" aria-selected="true" data-modo="manual">Teclado</button>
            <button type="button" role="tab" id="tabScanner" aria-selected="false" data-modo="scanner">Leitor</button>
            <button type="button" role="tab" id="tabCamera" aria-selected="false" data-modo="camera">Câmera</button>
          </div>
          <div id="zonaCamera"></div>
          <form id="formContagem" novalidate>
            <p class="count-ajuda" id="ajudaModo" hidden></p>
            <div class="form-group busca-wrap" id="grupoBusca">
              <label class="form-label" for="codigoInput" id="rotuloBusca">Produto</label>
              <input class="form-input" id="codigoInput" placeholder="Código, nome ou código de barras" autocomplete="off" spellcheck="false"
                role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug"/>
              <ul class="sug" id="sug" role="listbox" aria-label="Produtos encontrados" hidden></ul>
            </div>
            <div class="prod-preview" id="preview" hidden aria-live="polite"></div>
            <div class="form-group" id="grupoQtd">
              <label class="form-label" for="qtdInput">Quantidade contada</label>
              <div class="qtd-wrap"><input class="form-input qtd-input" id="qtdInput" inputmode="decimal" autocomplete="off" placeholder="0"/><span class="qtd-un" id="qtdUn"></span></div>
            </div>
            <button type="submit" class="btn btn-primary btn-bloco" id="saveBtn" style="min-height:44px">Registrar contagem</button>
          </form>
        </div>
        <div class="count-progresso">
          <div class="count-progresso-linha"><span id="progTexto">Progresso</span><strong id="progPct">—</strong></div>
          <div class="barra" role="progressbar" aria-label="Progresso da contagem" aria-valuemin="0" aria-valuemax="100" id="progBarra"><i style="width:0%"></i></div>
        </div>
      </section>` : `<div class="aviso">${ICONS.info}<p>Seu perfil pode acompanhar a contagem, mas não registrar itens.</p></div>`}
      <section class="card" style="margin:0" aria-labelledby="tLista">
        <div class="card-header">
          <h3 class="card-title" id="tLista">Itens contados <span class="badge" id="qtdItens">0</span></h3>
          <label class="campo-busca">${ICONS.busca}<span class="sr-only">Filtrar itens contados</span>
            <input class="form-input" type="search" id="filtroLista" placeholder="Buscar na lista" autocomplete="off" style="width:220px"/></label>
        </div>
        <div class="lista-contagem" id="lista"></div>
      </section>
    </div>`;
  const $ = s => el.querySelector(s);

  // ── Lista de itens contados ───────────────────────────────
  const paraEntrada = i => ({ id: i.id, produtoId: i.produto_id ?? i.produtos?.id, codigo: i.produtos?.codigo_produto ?? '', nome: i.produtos?.nome_produto ?? '', un: i.produtos?.unidade_medida ?? '', qtd: i.quantidade_contada, hora: i.atualizado_em ?? i.data_registro, por: i.usuarios?.nome ?? '', offline: false });
  try {
    const { data } = await listarItensContados(auditoriaId, { limit: 5000 });
    estado.lista = data.map(paraEntrada);
  } catch (err) { showToast(mensagemErro(err, 'carregar itens'), 'error'); }

  const hora = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const desenharLista = (destacar = null) => {
    $('#qtdItens').textContent = fmtInt(estado.lista.length);
    const t = normalizar(estado.filtro);
    const visiveis = t ? estado.lista.filter(i => normalizar(i.codigo).includes(t) || normalizar(i.nome).includes(t)) : estado.lista;
    const alvo = $('#lista');
    if (!estado.lista.length) {
      alvo.innerHTML = vazioHtml({
        titulo: 'Nenhum item contado ainda',
        texto: estado.prog?.totalProdutos === 0
          ? 'Esta empresa ainda não tem produtos cadastrados.' + (hasRole('administrador') ? '' : ' Fale com um administrador.')
          : podeContar ? 'Busque o produto, informe a quantidade e registre. Os itens aparecem aqui, o mais recente primeiro.' : 'Os itens aparecem aqui conforme a equipe registra a contagem.',
        acoes: estado.prog?.totalProdutos === 0 && hasRole('administrador') ? `<a class="btn btn-secondary btn-sm" href="app.html?tela=produtos&empresa=${encodeURIComponent(aud.empresa_id)}">Cadastrar produtos</a>` : '',
      });
      return;
    }
    if (!visiveis.length) {
      alvo.innerHTML = vazioHtml({ titulo: `Nenhum item corresponde a “${escapeHtml(estado.filtro)}”`, acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="limparFiltro">Limpar busca</button>', compacto: true });
      return;
    }
    alvo.innerHTML = `<table class="tabela-lista">
      <thead><tr><th scope="col">Produto</th><th scope="col" class="num">Quantidade</th><th scope="col">Hora</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.slice(0, estado.limite).map(i => `<tr class="${i.id === destacar ? 'recente' : ''}">
        <td class="l-titulo"><span class="forte">${escapeHtml(i.nome)}</span><span class="sub"><span class="codigo">${escapeHtml(i.codigo)}</span><span class="so-celular"> · ${i.offline ? 'na fila' : hora(i.hora)}</span></span></td>
        <td class="num"><span class="forte">${fmtQtd(i.qtd, i.un)}</span>${unHtml(i.un)}</td>
        <td class="so-desktop">${i.offline ? '<span class="badge badge-aviso">Na fila</span>' : `<span class="muted">${hora(i.hora)}</span>`}</td>
        <td>${podeContar && !i.offline ? `<div class="acoes-linha"><button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${escapeHtml(i.id)}" aria-label="Corrigir ${escapeHtml(i.nome)}">Corrigir</button></div>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>
    ${visiveis.length > estado.limite ? `<div class="tabela-rodape"><span>Os ${fmtInt(estado.limite)} registros mais recentes de ${fmtInt(visiveis.length)}</span><button type="button" class="btn btn-secondary btn-sm" data-acao="todos">Mostrar todos</button></div>` : ''}`;
    if (destacar) $('#lista').scrollTop = 0;
  };

  const atualizarProgresso = async () => {
    try {
      estado.prog = await progresso(auditoriaId);
      if (!$('#progPct')) return;
      $('#progTexto').textContent = `${fmtInt(estado.prog.contados)} de ${plural(estado.prog.totalProdutos, 'produto', 'produtos')}`;
      $('#progPct').textContent = `${estado.prog.pct}%`;
      $('#progBarra').setAttribute('aria-valuenow', estado.prog.pct);
      $('#progBarra i').style.width = `${Math.min(100, estado.prog.pct)}%`;
    } catch (err) { console.warn('[contagem] progresso', err); }
  };

  await atualizarProgresso();
  desenharLista();
  $('#filtroLista').addEventListener('input', debounce(e => { estado.filtro = e.target.value; desenharLista(); }, 150));

  initOfflineSync(({ online, pendentes }) => {
    const c = $('#conexao'); if (!c) return;
    c.classList.toggle('off', !online || pendentes > 0);
    c.textContent = !online ? `Sem internet${pendentes ? ` · ${pendentes} na fila` : ''}` : pendentes ? `Enviando ${pendentes}…` : 'Online';
  });

  delegarAcoes(el, {
    limparFiltro: () => { estado.filtro = ''; $('#filtroLista').value = ''; desenharLista(); },
    todos: () => { estado.limite = Infinity; desenharLista(); },
    editar: ({ id }) => corrigir(estado.lista.find(i => i.id === id)),
  });

  $('#btnFechamento')?.addEventListener('click', async () => {
    if (await contarPendentes().catch(() => 0)) { showToast('Ainda há contagens na fila esperando internet. Aguarde o envio antes do fechamento.', 'warning', 6000); return; }
    const p = estado.prog;
    const ok = await fmConfirm({
      titulo: 'Ir para o fechamento?',
      msg: `${p ? `Foram contados ${fmtInt(p.contados)} de ${plural(p.totalProdutos, 'produto', 'produtos')} (${p.pct}%). ` : ''}Na próxima etapa você informa o saldo do sistema de cada item. A auditoria só é encerrada quando você concluir.`,
      confirmTxt: 'Ir para o fechamento',
    });
    if (ok) location.href = `estoque-sistema.html?id=${encodeURIComponent(auditoriaId)}`;
  });

  if (!podeContar) return;

  // ── Busca de produto (combobox) ───────────────────────────
  const inp = $('#codigoInput'), sug = $('#sug'), qtd = $('#qtdInput');
  const fecharSug = () => { sug.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); estado.sugIdx = -1; };
  const desenharSug = () => {
    if (!estado.sug.length) { sug.innerHTML = `<li class="sug-vazia" role="option" aria-disabled="true">Nenhum produto encontrado</li>`; }
    else sug.innerHTML = estado.sug.map((p, i) => `<li role="option" id="sug${i}" data-i="${i}" aria-selected="${i === estado.sugIdx}">
      <span class="codigo">${escapeHtml(p.codigo_produto)}</span><span>${escapeHtml(p.nome_produto)}</span>${unHtml(p.unidade_medida)}</li>`).join('');
    sug.hidden = false; inp.setAttribute('aria-expanded', 'true');
    if (estado.sugIdx >= 0) { inp.setAttribute('aria-activedescendant', `sug${estado.sugIdx}`); sug.querySelector(`#sug${estado.sugIdx}`)?.scrollIntoView({ block: 'nearest' }); }
  };

  const buscar = debounce(async termo => {
    if (estado.modo !== 'manual') return;
    if (termo.trim().length < 2) { fecharSug(); return; }
    try {
      estado.sug = await buscarProdutoUnificado(aud.empresa_id, termo);
      if (inp.value !== termo) return;
      estado.sugIdx = estado.sug.length ? 0 : -1;
      desenharSug();
    } catch (err) {
      sug.innerHTML = `<li class="sug-vazia" role="option" aria-disabled="true">Não foi possível buscar. Tente de novo.</li>`; sug.hidden = false;
    }
  }, 220);

  inp.addEventListener('input', () => { limparProduto(false); buscar(inp.value); });
  inp.addEventListener('keydown', async e => {
    const aberta = !sug.hidden && estado.sug.length;
    if (e.key === 'ArrowDown' && aberta) { e.preventDefault(); estado.sugIdx = (estado.sugIdx + 1) % estado.sug.length; desenharSug(); }
    else if (e.key === 'ArrowUp' && aberta) { e.preventDefault(); estado.sugIdx = (estado.sugIdx - 1 + estado.sug.length) % estado.sug.length; desenharSug(); }
    else if (e.key === 'Escape' && !sug.hidden) { e.preventDefault(); e.stopPropagation(); fecharSug(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (estado.modo === 'scanner') { await lerCodigo(inp.value); return; }
      if (aberta && estado.sugIdx >= 0) { await escolher(estado.sug[estado.sugIdx]); return; }
      if (estado.produto) { qtd.focus(); return; }
      const t = inp.value.trim(); if (!t) return;
      const p = await buscarProdutoPorCodigo(aud.empresa_id, t) ?? await buscarProdutoPorBarras(aud.empresa_id, t);
      if (p) await escolher(p); else showToast(`Nenhum produto com o código “${t}” nesta empresa.`, 'warning');
    }
  });
  sug.addEventListener('mousedown', e => e.preventDefault());   // não tira o foco do campo
  sug.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) escolher(estado.sug[li.dataset.i]); });
  inp.addEventListener('blur', () => setTimeout(fecharSug, 120));

  async function escolher(p) {
    fecharSug();
    estado.produto = p;
    inp.value = `${p.codigo_produto} · ${p.nome_produto}`;
    $('#qtdUn').textContent = (p.unidade_medida ?? '').toUpperCase();
    try { estado.existente = await buscarItemContado(auditoriaId, p.id); } catch (_) { estado.existente = null; }
    const pv = $('#preview');
    pv.innerHTML = `<div class="codigo">${escapeHtml(p.codigo_produto)}${p.codigo_barras ? ` · ${escapeHtml(p.codigo_barras)}` : ''}</div>
      <div class="prod-preview-nome">${escapeHtml(p.nome_produto)}</div>
      <div class="prod-preview-estado ${estado.existente ? 'ja' : ''}">${estado.existente ? `Já contado: ${qtdHtml(estado.existente.quantidade_contada, p.unidade_medida)}` : `Ainda não contado nesta auditoria${p.unidade_medida ? ` · unidade ${escapeHtml(p.unidade_medida)}` : ''}`}</div>`;
    pv.hidden = false;
    if (estado.modo === 'manual') { qtd.focus(); qtd.select(); }
  }

  function limparProduto(limparCampo = true) {
    estado.produto = null; estado.existente = null;
    $('#preview').hidden = true; $('#qtdUn').textContent = '';
    if (limparCampo) { inp.value = ''; qtd.value = ''; }
  }

  // ── Registrar ─────────────────────────────────────────────
  const lerQtd = () => {
    const bruto = qtd.value.trim().replace(/\s/g, '');
    const n = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
    return bruto === '' || !Number.isFinite(n) ? NaN : n;
  };

  $('#formContagem').addEventListener('submit', async e => {
    e.preventDefault();
    if (estado.modo !== 'manual') return;
    if (!estado.produto) { inp.focus(); showToast('Escolha o produto primeiro.', 'warning'); return; }
    const q = lerQtd();
    if (Number.isNaN(q) || q < 0) { qtd.setAttribute('aria-invalid', 'true'); qtd.focus(); showToast('Informe uma quantidade válida (zero ou mais).', 'warning'); return; }
    qtd.removeAttribute('aria-invalid');
    const casas = casasDaUnidade(estado.produto.unidade_medida);
    const valor = Math.round(q * 10 ** Math.max(casas, 3)) / 10 ** Math.max(casas, 3);
    if (estado.existente) { conflito(estado.produto, estado.existente, valor); return; }
    await persistir(estado.produto, valor, 'novo');
  });

  function conflito(produto, existente, valor) {
    const un = produto.unidade_medida, soma = Number(existente.quantidade_contada) + valor;
    abrirModal({
      titulo: 'Este produto já foi contado',
      largura: 'sm',
      corpo: `<p class="modal-texto"><strong>${escapeHtml(produto.nome_produto)}</strong> já tem <strong>${qtdHtml(existente.quantidade_contada, un)}</strong> registrados nesta auditoria. Você informou <strong>${qtdHtml(valor, un)}</strong>.</p>
        <p class="modal-texto" style="margin-top:10px">Somar é o mais comum quando o produto está em mais de um lugar. Substituir troca o valor anterior; a troca fica no histórico.</p>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-ghost', acao: m => m.fechar() },
        { texto: `Substituir por ${fmtQtd(valor, un)}`, classe: 'btn-secondary', acao: m => { m.fechar(); persistir(produto, valor, 'sobrescrever'); } },
        { texto: `Somar (fica ${fmtQtd(soma, un)})`, classe: 'btn-primary', tipo: 'submit' },
      ],
      aoEnviar: m => { m.fechar(); persistir(produto, valor, 'somar'); },
    });
  }

  async function persistir(produto, valor, acao) {
    const btn = $('#saveBtn'); btn.disabled = true;
    try {
      let item;
      if (isOnline()) {
        item = await registrarContagem({ auditoriaId, produtoId: produto.id, quantidade: valor, usuarioId: perfil.id, acao });
      } else {
        await registrarOffline({ auditoriaId, produtoId: produto.id, quantidade: valor, usuarioId: perfil.id, acao });
        const anterior = estado.lista.find(i => i.produtoId === produto.id);
        item = { id: `fila-${Date.now()}`, produtos: produto, quantidade_contada: acao === 'somar' && anterior ? Number(anterior.qtd) + valor : valor, data_registro: new Date().toISOString() };
      }
      const entrada = { ...paraEntrada({ ...item, produtos: produto, usuarios: { nome: perfil.nome } }), produtoId: produto.id, offline: !isOnline() };
      estado.lista = [entrada, ...estado.lista.filter(i => i.produtoId !== produto.id)];
      desenharLista(entrada.id);
      if (estado.modo === 'manual') limparProduto();
      showToast(`${acao === 'somar' && estado.modo !== 'manual' ? '+1 · ' : ''}${fmtQtd(entrada.qtd, produto.unidade_medida)} ${(produto.unidade_medida ?? '').toUpperCase()} · ${produto.nome_produto}${entrada.offline ? ' (na fila)' : ''}`, 'success', 2500);
      atualizarProgresso();
    } catch (err) {
      showToast(mensagemErro(err, 'registrar contagem'), 'error');
    } finally {
      btn.disabled = false;
      inp.focus();
    }
  }

  // ── Leitor e câmera: cada leitura soma 1 ───────────────────
  async function lerCodigo(codigo) {
    const c = String(codigo).trim();
    inp.value = '';
    if (!c) return;
    const p = await buscarProdutoPorBarras(aud.empresa_id, c) ?? await buscarProdutoPorCodigo(aud.empresa_id, c);
    if (!p) { showToast(`Código ${c} não encontrado nesta empresa.`, 'warning'); return; }
    await escolher(p);
    await persistir(p, 1, 'somar');
  }

  let camStream = null, camLaco = null, ultimo = '', ultimoTs = 0;
  const pararCamera = () => { clearInterval(camLaco); camLaco = null; camStream?.getTracks().forEach(t => t.stop()); camStream = null; };
  window.addEventListener('pagehide', pararCamera);

  async function iniciarCamera() {
    const zona = $('#zonaCamera');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      zona.innerHTML = `<div class="camera-indisponivel"><strong>Câmera indisponível neste navegador</strong>
        <p>A leitura pela câmera precisa do Chrome ou do Edge no celular. Use o leitor de código de barras ou digite o código.</p>
        <button type="button" class="btn btn-secondary btn-sm" data-modo="manual">Usar o teclado</button></div>`;
      return;
    }
    zona.innerHTML = `<div id="scannerContainer"><video id="scannerVideo" autoplay playsinline muted></video><div id="scannerOverlay"></div><div id="scannerStatus">Aponte para o código de barras</div></div>`;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = $('#scannerVideo'); video.srcObject = camStream; await video.play();
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
      camLaco = setInterval(async () => {
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
        try {
          const [lido] = await detector.detect(video);
          if (!lido) return;
          const agora = Date.now();
          if (lido.rawValue === ultimo && agora - ultimoTs < 2000) return;
          ultimo = lido.rawValue; ultimoTs = agora;
          await lerCodigo(lido.rawValue);
        } catch (err) { console.warn('[câmera]', err); }
      }, 300);
    } catch (err) {
      zona.innerHTML = `<div class="camera-indisponivel"><strong>Sem acesso à câmera</strong>
        <p>Permita o uso da câmera nas configurações do navegador, ou use o teclado.</p>
        <button type="button" class="btn btn-secondary btn-sm" data-modo="manual">Usar o teclado</button></div>`;
    }
  }

  function setModo(modo) {
    estado.modo = modo;
    el.querySelectorAll('[role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.modo === modo)));
    pararCamera(); $('#zonaCamera').innerHTML = ''; fecharSug(); limparProduto();
    const ajuda = $('#ajudaModo');
    $('#grupoQtd').hidden = modo !== 'manual';
    $('#saveBtn').hidden = modo !== 'manual';
    $('#grupoBusca').hidden = modo === 'camera';
    ajuda.hidden = modo === 'manual';
    ajuda.innerHTML = modo === 'scanner' ? '<span class="leitor-pronto" style="margin:0"><span class="ponto-vivo"></span>Pronto para ler. Cada leitura soma 1 unidade ao produto.</span>'
      : modo === 'camera' ? 'Cada código lido soma 1 unidade ao produto.' : '';
    $('#rotuloBusca').textContent = modo === 'scanner' ? 'Código de barras' : 'Produto';
    inp.placeholder = modo === 'scanner' ? 'Bipe o código com o leitor' : 'Código, nome ou código de barras';
    if (modo === 'camera') iniciarCamera(); else setTimeout(() => inp.focus(), 50);
  }
  el.addEventListener('click', e => { const b = e.target.closest('[data-modo]'); if (b) setModo(b.dataset.modo); });
  el.querySelector('[role=tablist]').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const abas = [...el.querySelectorAll('[role=tab]')], i = abas.findIndex(a => a.getAttribute('aria-selected') === 'true');
    const prox = abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
    setModo(prox.dataset.modo); prox.focus();
  });

  // ── Correção ──────────────────────────────────────────────
  function corrigir(item) {
    if (!item) return;
    abrirModal({
      titulo: 'Corrigir contagem',
      subtitulo: `${escapeHtml(item.nome)} · <span class="codigo">${escapeHtml(item.codigo)}</span>`,
      corpo: `<p class="modal-texto" style="margin-bottom:14px">Registrado agora: <strong>${qtdHtml(item.qtd, item.un)}</strong></p>
        <div class="form-group"><label class="form-label" for="editQtd">Quantidade correta</label>
          <div class="qtd-wrap"><input class="form-input qtd-input" id="editQtd" inputmode="decimal" autocomplete="off" value="${escapeHtml(fmtQtd(item.qtd, item.un))}"/><span class="qtd-un">${escapeHtml((item.un ?? '').toUpperCase())}</span></div></div>
        <div class="form-group"><label class="form-label" for="editMotivo">Motivo <span class="opcional">(opcional)</span></label>
          <input class="form-input" id="editMotivo" maxlength="200" placeholder="Ex.: recontagem do corredor 3"/></div>
        <p class="form-hint">A correção fica registrada no histórico da auditoria, com o valor anterior.</p>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-secondary', acao: m => m.fechar() },
        { texto: 'Salvar correção', classe: 'btn-primary', tipo: 'submit' },
      ],
      aoEnviar: async m => {
        const campo = m.$('#editQtd'), bruto = campo.value.trim().replace(/\s/g, '');
        const n = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
        if (bruto === '' || !Number.isFinite(n) || n < 0) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); showToast('Informe uma quantidade válida (zero ou mais).', 'warning'); return; }
        m.ocupado(true, 'Salvando…');
        try {
          await editarContagem(item.id, n, perfil.id, m.$('#editMotivo').value);
          item.qtd = n; item.hora = new Date().toISOString();
          m.fechar();
          desenharLista(item.id);
          showToast(`Contagem corrigida: ${fmtQtd(n, item.un)} ${(item.un ?? '').toUpperCase()}.`, 'success');
        } catch (err) { m.ocupado(false); showToast(mensagemErro(err, 'corrigir contagem'), 'error'); }
      },
    }).$('#editQtd').select();
  }

  setTimeout(() => inp.focus(), 50);
}
