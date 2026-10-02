// ================================================================
//  AudiStock — js/telas/contagem.js  (contagem.html?id=…)
//  Registro da contagem física: teclado, leitor de código de barras
//  (cada leitura soma 1) ou câmera. Funciona sem internet: os
//  registros ficam numa fila (js/offline.js) e sobem quando há rede.
//  Na contagem visível, quem conta vê o último saldo do sistema de
//  cada produto (o da auditoria anterior da empresa).
// ================================================================

import { requireAuth, getPerfil, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, fmtDate, plural, fmtQtd, qtdHtml, unHtml, casasDaUnidade, vazioHtml,
         abrirModal, fmConfirm, showToast, debounce, normalizar, delegarAcoes, marcarInvalido, ICONS, mensagemErro } from '../ui.js';
import { buscarProdutoUnificado, buscarProdutoPorCodigo, buscarProdutoPorBarras } from '../produtos.js';
import { buscarAuditoria, progresso, listarAuditorias } from '../auditorias.js';
import { registrarContagem, buscarItemContado, editarContagem, listarItensContados } from '../contagem.js';
import { initOfflineSync, isOnline, registrarOffline, contarPendentes, listarFila, descartarRegistro } from '../offline.js';
import supabase from '../supabaseClient.js';

const auth = await requireAuth();
if (auth) {
  initLayout('Contagem', { ativa: 'auditorias' });
  await iniciar();
}

// Declarações de função (e não const): a tela roda no await acima, antes desta linha
function lerNumero(txt) {
  const b = String(txt ?? '').trim().replace(/\s/g, '');
  const n = Number(b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b);
  return b === '' || !Number.isFinite(n) ? NaN : n;
}
function arredondar(n, un) { const f = 10 ** Math.max(casasDaUnidade(un), 3); return Math.round(n * f) / f; }

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
  definirTitulo('Contagem');
  document.title = `Contagem ${aud.numero_auditoria} · AudiStock`;

  if (aud.status !== 'em_andamento') {
    const finalizada = aud.status === 'finalizada';
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({
      titulo: `A auditoria ${aud.numero_auditoria} já foi ${finalizada ? 'finalizada' : 'cancelada'}`,
      texto: 'Não é possível registrar novas contagens nela.',
      acoes: `${finalizada ? `<a class="btn btn-primary" href="relatorios.html?id=${encodeURIComponent(aud.id)}">Ver relatório</a>` : ''}<a class="btn btn-secondary" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">Ver detalhes</a>`,
    })}</div>`;
    return;
  }

  const podeContar = hasRole('auditor');
  const visivel = !aud.auditoria_cega;
  const estado = { modo: 'manual', produto: null, existente: null, lista: [], filtro: '', sug: [], sugIdx: -1, prog: null, limite: 40, anteriores: null };
  try { estado.prog = await progresso(auditoriaId); } catch (err) { console.warn('[contagem] progresso', err); }
  const semProdutos = estado.prog?.totalProdutos === 0;

  el.innerHTML = `
    <a class="voltar" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">${ICONS.voltar}Detalhes da auditoria</a>
    <div class="cabecalho">
      <div>
        <h2 class="cabecalho-titulo"><span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span> <span class="estado-conexao" id="conexao" role="status">Online</span></h2>
        <div class="cabecalho-meta"><span>${escapeHtml(aud.empresas?.nome ?? '—')}</span><span>Contagem ${visivel ? 'visível' : 'cega'}</span></div>
      </div>
      ${podeContar && !semProdutos ? `<div class="cabecalho-acoes"><button type="button" class="btn btn-secondary" id="btnFechamento">Ir para o fechamento</button></div>` : ''}
    </div>
    <div class="count-layout">
      ${semProdutos ? `<section class="count-panel" aria-label="Sem produtos"><div class="count-zona">${vazioHtml({
          titulo: 'Esta empresa ainda não tem produtos',
          texto: hasRole('administrador') ? 'Cadastre ou importe os produtos para começar a contar.' : 'Peça a um administrador para cadastrar os produtos.',
          acoes: hasRole('administrador') ? `<a class="btn btn-primary" href="app.html?tela=produtos&empresa=${encodeURIComponent(aud.empresa_id)}">Cadastrar produtos</a>` : '', compacto: true })}</div></section>`
      : podeContar ? `<section class="count-panel" aria-label="Registrar contagem">
        <div class="count-zona">
          <div class="seg" role="tablist" aria-label="Forma de leitura">
            <button type="button" role="tab" id="tabManual" aria-selected="true" aria-controls="formContagem" data-modo="manual">Teclado</button>
            <button type="button" role="tab" id="tabScanner" aria-selected="false" aria-controls="formContagem" tabindex="-1" data-modo="scanner">Leitor</button>
            <button type="button" role="tab" id="tabCamera" aria-selected="false" aria-controls="formContagem" tabindex="-1" data-modo="camera">Câmera</button>
          </div>
          <div id="zonaCamera"></div>
          <form id="formContagem" role="tabpanel" aria-labelledby="tabManual" novalidate>
            <div class="count-ajuda" id="ajudaModo" hidden></div>
            <div class="form-group busca-wrap" id="grupoBusca">
              <label class="form-label" for="codigoInput" id="rotuloBusca">Produto</label>
              <input class="form-input" id="codigoInput" placeholder="Código, nome ou código de barras" autocomplete="off" spellcheck="false"
                role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug"/>
              <ul class="sug" id="sug" role="listbox" aria-label="Produtos encontrados" hidden></ul>
            </div>
            <div class="prod-preview" id="preview" hidden aria-live="polite"></div>
            <p class="ultima-leitura" id="ultimaLeitura" hidden aria-live="polite"></p>
            <div class="form-group" id="grupoQtd">
              <label class="form-label" for="qtdInput">Quantidade contada</label>
              <div class="qtd-wrap"><input class="form-input qtd-input" id="qtdInput" inputmode="decimal" autocomplete="off" placeholder="0"/><span class="qtd-un" id="qtdUn"></span></div>
            </div>
            <button type="submit" class="btn btn-primary btn-bloco" id="saveBtn">Registrar contagem</button>
          </form>
        </div>
        <div class="count-progresso">
          <div class="count-progresso-linha"><span id="progTexto">Progresso</span><strong id="progPct">—</strong></div>
          <div class="barra" role="progressbar" aria-label="Progresso da contagem" aria-valuemin="0" aria-valuemax="100" id="progBarra"><i style="width:0%"></i></div>
        </div>
      </section>` : `<div class="aviso">${ICONS.info}<p>Seu perfil acompanha a contagem, mas não registra itens.</p></div>`}
      <section class="card" style="margin:0" aria-labelledby="tLista">
        <div class="card-header">
          <h3 class="card-title" id="tLista">Itens contados <span class="badge badge-neutro" id="qtdItens">0</span></h3>
          <label class="campo-busca" id="buscaLista">${ICONS.busca}<span class="sr-only">Buscar nos itens contados</span>
            <input class="form-input" type="search" id="filtroLista" placeholder="Buscar na lista" autocomplete="off"/></label>
        </div>
        <div class="lista-contagem" id="lista"></div>
      </section>
    </div>`;
  const $ = s => el.querySelector(s);

  // ── Lista de itens contados ───────────────────────────────
  const paraEntrada = i => ({ id: i.id, produtoId: i.produto_id ?? i.produtos?.id, codigo: i.produtos?.codigo_produto ?? '', nome: i.produtos?.nome_produto ?? '', un: i.produtos?.unidade_medida ?? '', qtd: i.quantidade_contada, hora: i.atualizado_em ?? i.data_registro, situacao: 'ok' });

  // Junta o que já está no servidor com o que ainda está no aparelho.
  // Para a fila, mostra o total que o produto vai ter quando ela subir.
  async function recarregarLista() {
    try {
      const [{ data }, fila] = await Promise.all([listarItensContados(auditoriaId), listarFila(auditoriaId).catch(() => [])]);
      const servidor = data.map(paraEntrada);
      const noServidor = new Map(servidor.map(i => [i.produtoId, i]));
      const dados = r => ({ produtoId: r.produto_id, codigo: r.produto?.codigo ?? '', nome: r.produto?.nome ?? 'Produto', un: r.produto?.un ?? '', hora: r.criado_em });
      const projetadas = new Map();
      for (const r of fila.filter(r => r.status === 'pending')) {
        const base = Number(projetadas.get(r.produto_id)?.qtd ?? noServidor.get(r.produto_id)?.qtd ?? 0);
        const d = dados(r);
        projetadas.delete(r.produto_id);
        projetadas.set(r.produto_id, { ...d, id: `fila-${r.produto_id}`, qtd: arredondar(r.acao === 'somar' ? base + Number(r.quantidade) : Number(r.quantidade), d.un), situacao: 'fila' });
      }
      const recusadas = fila.filter(r => r.status === 'error').reverse()
        .map(r => ({ ...dados(r), id: `erro-${r.id}`, filaId: r.id, qtd: r.quantidade, acao: r.acao, situacao: 'erro' }));
      estado.lista = [...recusadas, ...[...projetadas.values()].reverse(), ...servidor.filter(i => !projetadas.has(i.produtoId))];
    } catch (err) { showToast(mensagemErro(err, 'carregar itens'), 'error'); }
  }

  const hora = iso => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const rotuloSituacao = i => i.situacao === 'fila' ? 'na fila' : i.situacao === 'erro' ? 'não enviada' : hora(i.hora);
  const desenharLista = (destacar = null) => {
    $('#qtdItens').textContent = fmtInt(estado.lista.length);
    $('#buscaLista').hidden = !estado.lista.length;
    const t = normalizar(estado.filtro);
    const visiveis = t ? estado.lista.filter(i => normalizar(i.codigo).includes(t) || normalizar(i.nome).includes(t)) : estado.lista;
    const alvo = $('#lista');
    if (!estado.lista.length) {
      alvo.innerHTML = vazioHtml({
        titulo: semProdutos ? 'Nada para contar ainda' : `Nenhum dos ${plural(estado.prog?.totalProdutos ?? 0, 'produto', 'produtos')} contado ainda`,
        texto: semProdutos ? 'Os itens aparecem aqui quando a empresa tiver produtos e a contagem começar.'
          : podeContar ? 'Busque o produto, informe a quantidade e registre. Os itens aparecem aqui, o mais recente primeiro.' : 'Os itens aparecem aqui conforme a equipe registra a contagem.',
      });
      return;
    }
    if (!visiveis.length) {
      alvo.innerHTML = vazioHtml({ titulo: `Nada encontrado para “${estado.filtro.trim()}”`, acoes: '<button type="button" class="btn btn-secondary btn-sm" data-acao="limparFiltro">Limpar busca</button>', compacto: true });
      return;
    }
    alvo.innerHTML = `<table class="tabela-lista">
      <thead><tr><th scope="col">Produto</th><th scope="col" class="num">Quantidade</th><th scope="col">Hora</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.slice(0, estado.limite).map(i => `<tr class="${i.id === destacar ? 'recente' : ''}">
        <td class="l-titulo"><span class="forte">${escapeHtml(i.nome)}</span><span class="sub"><span class="codigo">${escapeHtml(i.codigo)}</span><span class="so-celular"> · ${rotuloSituacao(i)}</span></span></td>
        <td class="num"><span class="forte">${i.situacao === 'erro' && i.acao === 'somar' ? '+' : ''}${fmtQtd(i.qtd, i.un)}</span>${unHtml(i.un)}</td>
        <td class="so-desktop">${i.situacao === 'fila' ? '<span class="badge badge-aviso">Na fila</span>' : i.situacao === 'erro' ? '<span class="badge badge-perigo">Não enviada</span>' : `<span class="muted">${hora(i.hora)}</span>`}</td>
        <td>${!podeContar ? '' : i.situacao === 'ok' ? `<div class="acoes-linha"><button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${escapeHtml(i.id)}" aria-label="Corrigir ${escapeHtml(i.nome)}">Corrigir</button></div>`
          : i.situacao === 'erro' ? `<div class="acoes-linha"><button type="button" class="btn btn-ghost btn-sm" data-acao="descartar" data-id="${escapeHtml(i.id)}">Descartar</button></div>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>
    ${visiveis.length > estado.limite ? `<div class="tabela-rodape"><span>Os ${fmtInt(estado.limite)} registros mais recentes de ${fmtInt(visiveis.length)}</span><button type="button" class="btn btn-secondary btn-sm" data-acao="todos">Mostrar todos</button></div>` : ''}`;
    if (destacar) $('#lista').scrollTop = 0;
  };

  const desenharProgresso = () => {
    const p = estado.prog;
    if (!p || !$('#progPct')) return;
    $('#progTexto').textContent = `${fmtInt(p.contados)} de ${plural(p.totalProdutos, 'produto', 'produtos')}`;
    $('#progPct').textContent = `${p.pct}%`;
    $('#progBarra').setAttribute('aria-valuenow', p.pct);
    $('#progBarra i').style.width = `${Math.min(100, p.pct)}%`;
  };
  const atualizarProgresso = async () => {
    try { estado.prog = await progresso(auditoriaId); desenharProgresso(); }
    catch (err) { console.warn('[contagem] progresso', err); }
  };

  await recarregarLista();
  desenharProgresso();
  desenharLista();
  $('#filtroLista').addEventListener('input', debounce(e => { estado.filtro = e.target.value; desenharLista(); }, 150));

  const offline = initOfflineSync(async ({ online, pendentes, enviados }) => {
    const c = $('#conexao'); if (!c) return;
    c.classList.toggle('off', !online || pendentes > 0);
    c.textContent = !online ? `Sem internet${pendentes ? ` · ${pendentes} na fila` : ''}` : pendentes ? `Enviando ${pendentes}…` : 'Online';
    if (enviados) { await recarregarLista(); desenharLista(); atualizarProgresso(); }
  }, { auditoriaId });

  delegarAcoes(el, {
    limparFiltro: () => { estado.filtro = ''; $('#filtroLista').value = ''; desenharLista(); },
    todos: () => { estado.limite = Infinity; desenharLista(); },
    editar: ({ id }) => corrigir(estado.lista.find(i => i.id === id)),
    descartar: async ({ id }) => {
      const item = estado.lista.find(i => i.id === id); if (!item) return;
      const ok = await fmConfirm({ titulo: 'Descartar esta contagem?', msg: `${item.nome}: ${item.acao === 'somar' ? '+' : ''}${fmtQtd(item.qtd, item.un)} ${(item.un ?? '').toUpperCase()} não foi aceita pelo servidor. Se precisar, registre o produto de novo.`, confirmTxt: 'Descartar', tipo: 'perigo' });
      if (!ok) return;
      await descartarRegistro(item.filaId);
      estado.lista = estado.lista.filter(i => i.id !== id);
      desenharLista();
    },
  });

  $('#btnFechamento')?.addEventListener('click', async () => {
    if (await contarPendentes(auditoriaId).catch(() => 0)) {
      if (isOnline()) await offline.enviar();
      if (await contarPendentes(auditoriaId).catch(() => 0)) { showToast('Ainda há contagens guardadas neste aparelho esperando internet. Elas precisam ser enviadas antes do fechamento.', 'warning', 7000); return; }
    }
    const p = estado.prog;
    const ok = await fmConfirm({
      titulo: 'Ir para o fechamento?',
      msg: `${p ? `Foram contados ${fmtInt(p.contados)} de ${plural(p.totalProdutos, 'produto', 'produtos')} (${p.pct}%). ` : ''}Na próxima etapa você informa o saldo do sistema de cada item. A auditoria só é finalizada quando você concluir o fechamento.`,
      confirmTxt: 'Ir para o fechamento',
    });
    if (ok) location.href = `estoque-sistema.html?id=${encodeURIComponent(auditoriaId)}`;
  });

  if (!podeContar || semProdutos) return;

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

  inp.addEventListener('input', () => { if (estado.modo === 'manual') { limparProduto(false); buscar(inp.value); } });
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

  // Contagem visível: o saldo do sistema da auditoria finalizada mais recente da empresa
  async function saldoAnterior(produtoId) {
    if (!visivel) return null;
    estado.anteriores ??= await listarAuditorias({ empresaId: aud.empresa_id, status: 'finalizada', limit: 5 }).then(r => r.data).catch(() => []);
    if (!estado.anteriores.length) return null;
    const { data } = await supabase.from('auditoria_itens').select('auditoria_id, estoque_sistema')
      .eq('produto_id', produtoId).in('auditoria_id', estado.anteriores.map(a => a.id));
    const porAud = new Map((data ?? []).filter(i => i.estoque_sistema != null).map(i => [i.auditoria_id, i.estoque_sistema]));
    const a = estado.anteriores.find(x => porAud.has(x.id));
    return a ? { saldo: porAud.get(a.id), numero: a.numero_auditoria, data: a.data_fim } : null;
  }

  async function escolher(p) {
    fecharSug();
    estado.produto = p;
    if (estado.modo === 'manual') inp.value = `${p.codigo_produto} · ${p.nome_produto}`;
    $('#qtdUn').textContent = (p.unidade_medida ?? '').toUpperCase();
    const [existente, anterior] = await Promise.all([buscarItemContado(auditoriaId, p.id).catch(() => null), saldoAnterior(p.id).catch(() => null)]);
    estado.existente = existente;
    if (estado.modo !== 'manual') return;
    const pv = $('#preview');
    pv.innerHTML = `<span>${[p.codigo_barras ? `EAN <span class="codigo">${escapeHtml(p.codigo_barras)}</span>` : '', p.unidade_medida ? `unidade ${escapeHtml(p.unidade_medida)}` : ''].filter(Boolean).join(' · ')}</span>
      <span class="ref ${existente ? 'prod-preview-estado ja' : ''}">${existente ? `Já contado nesta auditoria: ${qtdHtml(existente.quantidade_contada, p.unidade_medida)}` : 'Ainda não contado nesta auditoria'}</span>
      ${visivel ? `<span class="ref">${anterior ? `Saldo do sistema na ${escapeHtml(anterior.numero)} (${fmtDate(anterior.data)}): <strong>${qtdHtml(anterior.saldo, p.unidade_medida)}</strong>` : 'Sem saldo anterior do sistema para este produto'}</span>` : ''}`;
    pv.hidden = false;
    qtd.focus(); qtd.select();
  }

  function limparProduto(limparCampo = true) {
    estado.produto = null; estado.existente = null;
    $('#preview').hidden = true; $('#qtdUn').textContent = '';
    if (limparCampo) { inp.value = ''; qtd.value = ''; }
  }

  // ── Registrar ─────────────────────────────────────────────
  $('#formContagem').addEventListener('submit', async e => {
    e.preventDefault();
    if (estado.modo !== 'manual') return;
    if (!estado.produto) { marcarInvalido(inp, 'Escolha o produto primeiro.'); inp.focus(); return; }
    const q = lerNumero(qtd.value);
    if (Number.isNaN(q) || q < 0) { marcarInvalido(qtd, 'Informe uma quantidade válida (zero ou mais).'); qtd.focus(); return; }
    const valor = arredondar(q, estado.produto.unidade_medida);
    if (estado.existente) { conflito(estado.produto, estado.existente, valor); return; }
    await persistir(estado.produto, valor, 'novo');
  });

  function conflito(produto, existente, valor) {
    const un = produto.unidade_medida, soma = arredondar(Number(existente.quantidade_contada) + valor, un);
    const q = n => `${fmtQtd(n, un)} ${(un ?? '').toUpperCase()}`.trim();
    abrirModal({
      titulo: 'Este produto já foi contado',
      largura: 'sm',
      corpo: `<p class="modal-texto"><strong>${escapeHtml(produto.nome_produto)}</strong> já tem <strong>${qtdHtml(existente.quantidade_contada, un)}</strong> registrados nesta auditoria. Você informou <strong>${qtdHtml(valor, un)}</strong>.</p>
        <p class="modal-texto" style="margin-top:10px">Somar é o mais comum quando o produto está em mais de um lugar. Substituir troca o valor anterior; a troca fica no histórico.</p>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-ghost', acao: m => m.fechar() },
        { texto: `Substituir: ${q(valor)}`, classe: 'btn-secondary', acao: m => { m.fechar(); persistir(produto, valor, 'sobrescrever'); } },
        { texto: `Somar: ${q(soma)}`, classe: 'btn-primary', tipo: 'submit' },
      ],
      aoEnviar: m => { m.fechar(); persistir(produto, valor, 'somar'); },
    });
  }

  async function persistir(produto, valor, acao) {
    const btn = $('#saveBtn'); btn.disabled = true;
    const un = produto.unidade_medida;
    try {
      let entrada;
      if (isOnline()) {
        const item = await registrarContagem({ auditoriaId, produtoId: produto.id, quantidade: valor, usuarioId: perfil.id, acao });
        entrada = { ...paraEntrada({ ...item, produtos: produto }), produtoId: produto.id };
        estado.lista = [entrada, ...estado.lista.filter(i => i.produtoId !== produto.id || i.situacao === 'erro')];
      } else {
        await registrarOffline({ auditoriaId, produtoId: produto.id, quantidade: valor, usuarioId: perfil.id, acao, produto });
        await recarregarLista();
        entrada = estado.lista.find(i => i.id === `fila-${produto.id}`);
      }
      desenharLista(entrada.id);
      const qtdTxt = `${fmtQtd(entrada.qtd, un)} ${(un ?? '').toUpperCase()}`.trim();
      if (estado.modo === 'manual') {
        limparProduto();
        showToast(`Registrado: ${qtdTxt} de ${produto.nome_produto}${entrada.situacao === 'fila' ? ' (guardado no aparelho)' : ''}.`, 'success', 2500);
      } else {
        // Leitor e câmera: o campo já foi limpo no Enter. Limpar aqui
        // apagaria a próxima leitura, que o leitor pode estar digitando.
        estado.produto = null;
        const ul = $('#ultimaLeitura');
        ul.innerHTML = `Última leitura: <strong>${escapeHtml(produto.nome_produto)}</strong> · agora ${qtdHtml(entrada.qtd, un)}${entrada.situacao === 'fila' ? ' (na fila)' : ''}`;
        ul.hidden = false;
      }
      atualizarProgresso();
    } catch (err) {
      showToast(mensagemErro(err, 'registrar contagem'), 'error');
    } finally {
      btn.disabled = false;
      if (estado.modo !== 'camera') inp.focus();
    }
  }

  // ── Leitor e câmera: cada leitura soma 1 ───────────────────
  // O leitor físico pode mandar várias leituras antes de a primeira
  // terminar: o campo é limpo na hora e as leituras entram numa fila,
  // processadas na ordem em que chegaram.
  let filaLeituras = Promise.resolve();
  function lerCodigo(codigo) {
    const c = String(codigo).trim();
    inp.value = '';
    if (!c) return filaLeituras;
    filaLeituras = filaLeituras.then(async () => {
      const p = await buscarProdutoPorBarras(aud.empresa_id, c) ?? await buscarProdutoPorCodigo(aud.empresa_id, c);
      if (!p) { showToast(`Código ${c} não encontrado nesta empresa.`, 'warning'); return; }
      await persistir(p, 1, 'somar');
    }).catch(err => showToast(mensagemErro(err, 'leitura do código'), 'error'));
    return filaLeituras;
  }

  const temCamera = 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
  if (!temCamera) $('#tabCamera').title = 'Indisponível neste navegador';
  let camStream = null, camLaco = null, ultimo = '', ultimoTs = 0;
  const pararCamera = () => { clearInterval(camLaco); camLaco = null; camStream?.getTracks().forEach(t => t.stop()); camStream = null; };
  window.addEventListener('pagehide', pararCamera);

  async function iniciarCamera() {
    const zona = $('#zonaCamera');
    if (!temCamera) {
      zona.innerHTML = `<div class="camera-indisponivel"><strong>Leitura pela câmera indisponível neste dispositivo</strong>
        <p>Ela funciona no Chrome para Android. Aqui, use um leitor de código de barras ou digite o código.</p>
        <button type="button" class="btn btn-secondary btn-sm" data-modo="manual">Usar o teclado</button></div>`;
      return false;
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
      return true;
    } catch (err) {
      zona.innerHTML = `<div class="camera-indisponivel"><strong>Sem acesso à câmera</strong>
        <p>Permita o uso da câmera nas configurações do navegador, ou use o teclado.</p>
        <button type="button" class="btn btn-secondary btn-sm" data-modo="manual">Usar o teclado</button></div>`;
      return false;
    }
  }

  // Estado do leitor: só está "pronto" enquanto o campo tem o foco
  const ajuda = $('#ajudaModo');
  const estadoLeitor = () => {
    if (estado.modo !== 'scanner') return;
    const pronto = document.activeElement === inp;
    ajuda.innerHTML = `<span class="leitor-estado ${pronto ? '' : 'pausado'}" ${pronto ? '' : 'role="button" tabindex="0"'}>${pronto ? 'Pronto para ler. Cada leitura soma 1 unidade ao produto.' : 'Leitor pausado. Toque aqui para continuar lendo.'}</span>`;
  };
  inp.addEventListener('focus', estadoLeitor);
  inp.addEventListener('blur', () => setTimeout(estadoLeitor, 150));
  ajuda.addEventListener('click', e => { if (e.target.closest('.pausado')) inp.focus(); });
  ajuda.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pausado')) { e.preventDefault(); inp.focus(); } });

  async function setModo(modo) {
    estado.modo = modo;
    el.querySelectorAll('[role=tab]').forEach(t => {
      const ativa = t.dataset.modo === modo;
      t.setAttribute('aria-selected', String(ativa));
      t.tabIndex = ativa ? 0 : -1;
    });
    $('#formContagem').setAttribute('aria-labelledby', { manual: 'tabManual', scanner: 'tabScanner', camera: 'tabCamera' }[modo]);
    pararCamera(); $('#zonaCamera').innerHTML = ''; fecharSug(); limparProduto();
    $('#ultimaLeitura').hidden = true;
    $('#grupoQtd').hidden = modo !== 'manual';
    $('#saveBtn').hidden = modo !== 'manual';
    $('#grupoBusca').hidden = modo === 'camera';
    $('#rotuloBusca').textContent = modo === 'scanner' ? 'Código de barras' : 'Produto';
    inp.placeholder = modo === 'scanner' ? 'Bipe o código com o leitor' : 'Código, nome ou código de barras';
    ajuda.hidden = modo === 'manual';
    ajuda.innerHTML = '';
    if (modo === 'camera') {
      const ok = await iniciarCamera();
      ajuda.hidden = !ok;
      if (ok) ajuda.textContent = 'Cada código lido soma 1 unidade ao produto.';
    } else {
      setTimeout(() => { inp.focus(); estadoLeitor(); }, 50);
    }
  }
  el.addEventListener('click', e => { const b = e.target.closest('[data-modo]'); if (b) setModo(b.dataset.modo); });
  el.querySelector('[role=tablist]').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const abas = [...el.querySelectorAll('[role=tab]')], i = abas.findIndex(a => a.getAttribute('aria-selected') === 'true');
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length;
    setModo(abas[j].dataset.modo); abas[j].focus();
  });

  // ── Correção ──────────────────────────────────────────────
  function corrigir(item) {
    if (!item) return;
    const unTxt = (item.un ?? '').toUpperCase();
    abrirModal({
      titulo: 'Corrigir contagem',
      subtitulo: `${escapeHtml(item.nome)} · <span class="codigo">${escapeHtml(item.codigo)}</span>`,
      corpo: `<p class="modal-texto" style="margin-bottom:14px">Valor atual: <strong>${qtdHtml(item.qtd, item.un)}</strong></p>
        <div class="form-group"><label class="form-label" for="editQtd">Quantidade correta</label>
          <div class="qtd-wrap"><input class="form-input qtd-input" id="editQtd" inputmode="decimal" autocomplete="off" value="${escapeHtml(fmtQtd(item.qtd, item.un))}"/><span class="qtd-un">${escapeHtml(unTxt)}</span></div></div>
        <div class="form-group"><label class="form-label" for="editMotivo">Motivo <span class="opcional">(opcional)</span></label>
          <input class="form-input" id="editMotivo" maxlength="200" placeholder="Ex.: recontagem do corredor 3"/></div>
        <p class="form-hint">A correção fica registrada no histórico da auditoria, com o valor anterior.</p>`,
      acoes: [
        { texto: 'Cancelar', classe: 'btn-secondary', acao: m => m.fechar() },
        { texto: 'Salvar correção', classe: 'btn-primary', tipo: 'submit' },
      ],
      aoEnviar: async m => {
        const campo = m.$('#editQtd'), n = lerNumero(campo.value);
        if (Number.isNaN(n) || n < 0) { marcarInvalido(campo, 'Informe uma quantidade válida (zero ou mais).'); campo.focus(); return; }
        const valor = arredondar(n, item.un);
        if (valor === Number(item.qtd)) { m.fechar(); showToast('A quantidade é a mesma; nada foi alterado.', 'info', 2500); return; }
        m.ocupado(true, 'Salvando…');
        try {
          await editarContagem(item.id, valor, perfil.id, m.$('#editMotivo').value);
          item.qtd = valor; item.hora = new Date().toISOString();
          m.fechar();
          desenharLista(item.id);
          showToast(`Contagem corrigida para ${fmtQtd(valor, item.un)} ${unTxt}.`.replace(' .', '.'), 'success');
        } catch (err) { m.ocupado(false); showToast(mensagemErro(err, 'corrigir contagem'), 'error'); }
      },
    }).$('#editQtd').select();
  }

  setTimeout(() => inp.focus(), 50);
}
