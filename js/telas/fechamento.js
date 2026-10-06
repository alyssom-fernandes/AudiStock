// ================================================================
//  AudiStock — js/telas/fechamento.js  (estoque-sistema.html?id=…)
//  Fechamento da auditoria: informa o saldo do sistema (ERP) de cada
//  item contado, vê a diferença na hora e finaliza a auditoria.
//
//  Antes de finalizar, confere de novo os itens no servidor: um produto
//  contado (ou recontado) por outra pessoa depois que esta tela abriu não
//  fica de fora. A finalização grava os saldos de todos os itens e
//  encerra numa só operação (finalizar_auditoria), que também recusa um
//  item contado enquanto o diálogo de confirmação estava aberto. Um saldo
//  apagado é gravado como vazio (sem saldo).
// ================================================================

import { requireAuth, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, plural, qtdHtml, unHtml, difHtml, vazioHtml, lerQuantidade, fmtEntrada,
         fmConfirm, showToast, showLoading, hideLoading, ICONS, mensagemErro } from '../ui.js';
import { buscarAuditoria } from '../auditorias.js';
import { listarItensContados, finalizarComSaldos, ITENS_NOVOS, JA_ENCERRADA } from '../contagem.js';
import { resumoFila, sincronizar, initOfflineSync } from '../offline.js';

// Saldos digitados e ainda não gravados, guardados quando a tela precisa
// recarregar (itens novos contados por outra pessoa). Declarada antes do
// primeiro await do módulo, para já existir quando iniciar() rodar.
const chaveRascunho = id => `audistock-saldos-${id}`;

const auth = await requireAuth();
if (auth) {
  initLayout('Fechamento', { ativa: 'auditorias' });
  await iniciar();
}

async function iniciar() {
  const el = document.getElementById('pageBody');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('app.html?tela=auditorias'); return; }

  el.innerHTML = `<div class="carregando-bloco"><span class="skel" style="width:30%;height:22px"></span><span class="skel" style="width:50%"></span></div>`;
  let aud, itens, fila = { meus: 0, deOutros: 0, comErro: 0 };
  try {
    aud = await buscarAuditoria(id);
    // Contagens guardadas neste aparelho sobem antes, para o fechamento ver tudo
    fila = await resumoFila(id).catch(() => fila);
    if (fila.meus) { await sincronizar().catch(() => {}); fila = await resumoFila(id).catch(() => fila); }
    ({ data: itens } = await listarItensContados(id));
  } catch (err) {
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({ titulo: aud ? 'Não foi possível carregar os itens' : 'Auditoria não encontrada', texto: aud ? mensagemErro(err, 'carregar fechamento') : 'Ela pode ter sido excluída, ou o link está incompleto.', acoes: '<button type="button" class="btn btn-secondary" onclick="location.reload()">Tentar de novo</button>' })}</div>`;
    return;
  }
  definirTitulo('Fechamento');
  document.title = `Fechamento ${aud.numero_auditoria} · AudiStock`;

  if (aud.status !== 'em_andamento') {
    const fin = aud.status === 'finalizada';
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({
      titulo: `A auditoria ${aud.numero_auditoria} já foi ${fin ? 'finalizada' : 'cancelada'}`,
      texto: fin ? 'Os saldos já foram informados e o relatório está disponível.' : 'Auditorias canceladas não têm fechamento.',
      acoes: fin ? `<a class="btn btn-primary" href="relatorios.html?id=${encodeURIComponent(aud.id)}">Ver relatório</a>` : `<a class="btn btn-secondary" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">Ver detalhes</a>`,
    })}</div>`;
    return;
  }

  const voltarContagem = `contagem.html?id=${encodeURIComponent(id)}`;
  if (!itens.length) {
    el.innerHTML = `<a class="voltar" href="${voltarContagem}">${ICONS.voltar}Contagem</a><div class="card">${vazioHtml({
      titulo: 'Nenhum item foi contado nesta auditoria',
      texto: fila.meus ? 'Há contagens guardadas neste aparelho esperando internet. Elas aparecem aqui depois de enviadas.' : 'Registre ao menos um produto na contagem para depois informar os saldos do sistema.',
      acoes: `<a class="btn btn-primary" href="${voltarContagem}">Voltar à contagem</a>`,
    })}</div>`;
    return;
  }

  const podeFinalizar = hasRole('auditor');
  itens.sort((a, b) => String(a.produtos?.nome_produto).localeCompare(String(b.produtos?.nome_produto), 'pt-BR'));
  let rascunho = {};
  try { rascunho = JSON.parse(sessionStorage.getItem(chaveRascunho(id)) || '{}'); sessionStorage.removeItem(chaveRascunho(id)); } catch (_) {}
  const valorInicial = i => i.produto_id in rascunho ? rascunho[i.produto_id] : fmtEntrada(i.estoque_sistema, i.produtos?.unidade_medida);
  const comRascunho = Object.keys(rascunho).length > 0;
  let naFila = fila.meus;
  const avisoFila = n => `<div class="aviso aviso-aviso" id="avisoFila">${ICONS.info}<p>${n === 1 ? 'Uma contagem guardada neste aparelho ainda não foi enviada' : `${fmtInt(n)} contagens guardadas neste aparelho ainda não foram enviadas`}. Ela${n === 1 ? ' sobe sozinha' : 's sobem sozinhas'} quando houver internet, e então dá para finalizar.</p></div>`;

  el.innerHTML = `
    <a class="voltar" href="${voltarContagem}">${ICONS.voltar}Contagem</a>
    <div class="cabecalho">
      <div>
        <h2 class="cabecalho-titulo"><span>Fechamento da <span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span></span></h2>
        <div class="cabecalho-meta"><span>${escapeHtml(aud.empresas?.nome ?? '—')}</span><span>${plural(itens.length, 'item contado', 'itens contados')}</span><span>Contagem ${aud.auditoria_cega ? 'cega' : 'visível'}</span></div>
        <p class="cabecalho-texto">${podeFinalizar
          ? 'Informe o saldo que consta no sistema (ERP) para cada produto. A diferença aparece ao lado, e a auditoria só é finalizada quando você confirmar.'
          : 'Aqui você vê os itens contados. O saldo do sistema de cada um é informado por quem finaliza a auditoria: um auditor ou administrador.'}</p>
      </div>
    </div>
    ${naFila ? avisoFila(naFila) : ''}
    ${fila.deOutros ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${fila.deOutros === 1 ? 'Uma contagem de outra pessoa está guardada' : `${fmtInt(fila.deOutros)} contagens de outra pessoa estão guardadas`} neste aparelho e só ${fila.deOutros === 1 ? 'sobe' : 'sobem'} quando ela entrar aqui de novo. Se você finalizar antes, ${fila.deOutros === 1 ? 'ela fica' : 'elas ficam'} de fora.</p></div>` : ''}
    ${fila.comErro ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${plural(fila.comErro, 'contagem deste aparelho foi recusada', 'contagens deste aparelho foram recusadas')} pelo servidor e não ${fila.comErro === 1 ? 'entra' : 'entram'} no fechamento. <a class="link" href="${voltarContagem}">Ver na contagem</a></p></div>` : ''}
    ${comRascunho ? `<div class="aviso">${ICONS.info}<p>A lista foi atualizada com o que foi contado depois que você abriu o fechamento. Os saldos que você já tinha digitado foram mantidos.</p></div>` : ''}
    <section class="card" aria-label="Saldos do sistema">
      <div class="tabela-wrap"><table class="tabela-resp tabela-fechamento">
        <thead><tr><th scope="col">Produto</th><th scope="col" class="num">Saldo no sistema</th><th scope="col" class="num">Contado</th><th scope="col" class="num">Diferença</th></tr></thead>
        <tbody>${itens.map((i, n) => {
          const un = i.produtos?.unidade_medida;
          return `<tr>
            <td class="cel-titulo"><span class="forte">${escapeHtml(i.produtos?.nome_produto ?? '—')}</span><span class="sub codigo">${escapeHtml(i.produtos?.codigo_produto ?? '')}</span></td>
            <td class="num" data-label="Saldo no sistema">${podeFinalizar ? `<span class="saldo-wrap">
              <label class="sr-only" for="saldo${n}">Saldo no sistema de ${escapeHtml(i.produtos?.nome_produto ?? '')}</label>
              <input class="form-input saldo-input" id="saldo${n}" data-n="${n}" inputmode="decimal" autocomplete="off" placeholder="—"
                value="${escapeHtml(valorInicial(i))}" aria-describedby="dif${n}"/>${unHtml(un)}</span>`
              : i.estoque_sistema != null ? qtdHtml(i.estoque_sistema, un) : '<span class="dif-nula">—</span>'}</td>
            <td class="num" data-label="Contado">${qtdHtml(i.quantidade_contada, un)}</td>
            <td class="num" data-label="Diferença" id="dif${n}">${podeFinalizar || i.estoque_sistema == null ? '<span class="dif-nula">—</span>' : difHtml(i.diferenca, un)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
    <div class="barra-acoes">
      <span class="resumo" id="resumoSaldos" aria-live="polite"></span>
      <div class="barra-acoes-botoes">
        <a class="btn btn-secondary" href="${voltarContagem}">Voltar à contagem</a>
        ${podeFinalizar ? `<button type="button" class="btn btn-primary" id="btnFinalizar" ${naFila ? 'disabled' : ''}>Finalizar auditoria</button>` : ''}
      </div>
    </div>`;
  const $ = s => el.querySelector(s);
  const inputs = [...el.querySelectorAll('.saldo-input')];
  let alterado = comRascunho, saindo = false;   // saldos que voltaram do rascunho também pedem aviso ao sair

  const ler = n => lerQuantidade(inputs[n].value, itens[n].produtos?.unidade_medida);
  const atualizar = n => {
    const i = itens[n], lida = ler(n);
    inputs[n].toggleAttribute('aria-invalid', !!lida.erro);
    inputs[n].title = lida.erro ?? '';
    $(`#dif${n}`).innerHTML = lida.erro ? `<span class="dif-nula dif-erro">${escapeHtml(lida.erro)}</span>`
      : lida.vazio ? '<span class="dif-nula">—</span>'
      : difHtml(Math.round((Number(i.quantidade_contada) - lida.valor) * 1000) / 1000, i.produtos?.unidade_medida);
  };
  let ultimoResumo = -1;
  const resumir = () => {
    if (!podeFinalizar) return 0;
    const preenchidos = inputs.filter((_, n) => ler(n).valor != null).length;
    // A região é anunciada pelo leitor de tela: só reescreve quando o número muda
    if (preenchidos !== ultimoResumo) {
      $('#resumoSaldos').innerHTML = `<strong>${fmtInt(preenchidos)}</strong> de ${plural(inputs.length, 'saldo informado', 'saldos informados')}`;
      ultimoResumo = preenchidos;
    }
    return preenchidos;
  };
  inputs.forEach((x, n) => {
    atualizar(n);
    x.addEventListener('input', () => { alterado = true; atualizar(n); resumir(); });
    x.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const prox = inputs[n + 1] ?? $('#btnFinalizar');
      prox?.focus(); inputs[n + 1]?.select();
      prox?.scrollIntoView({ block: 'nearest' });
    });
  });
  resumir();

  // Os saldos só são gravados ao finalizar: avisa antes de sair com eles preenchidos
  window.addEventListener('beforeunload', e => { if (alterado && !saindo) { e.preventDefault(); e.returnValue = ''; } });

  // Recarrega a lista (itens novos ou recontados) guardando o que foi digitado
  const recarregar = msg => {
    const r = {};
    inputs.forEach((x, n) => { r[itens[n].produto_id ?? itens[n].produtos?.id] = x.value; });
    try { sessionStorage.setItem(chaveRascunho(id), JSON.stringify(r)); } catch (_) {}
    showToast(msg, 'warning', 6000);
    saindo = true;
    setTimeout(() => location.reload(), 1800);
  };
  const relatorio = `relatorios.html?id=${encodeURIComponent(id)}`;

  // A fila deste aparelho continua sendo enviada com o fechamento aberto:
  // quando esvazia, Finalizar libera; o que subiu entra na lista
  if (podeFinalizar) initOfflineSync(({ pendentes, enviados }) => {
    if (saindo) return;
    if (enviados) { recarregar(`${plural(enviados, 'contagem guardada foi enviada', 'contagens guardadas foram enviadas')}. A lista vai ser atualizada, com os saldos que você já digitou.`); return; }
    naFila = pendentes;
    const aviso = $('#avisoFila');
    if (!pendentes) aviso?.remove();
    else if (aviso) aviso.outerHTML = avisoFila(pendentes);
    const btn = $('#btnFinalizar');
    if (btn && !btn.dataset.ocupado) btn.disabled = pendentes > 0;
  }, { auditoriaId: id });

  $('#btnFinalizar')?.addEventListener('click', async () => {
    const invalido = inputs.findIndex((_, n) => ler(n).erro);
    if (invalido >= 0) { inputs[invalido].focus(); showToast(`Saldo inválido em ${itens[invalido].produtos?.nome_produto ?? 'um item'}: ${ler(invalido).erro}`, 'warning', 6000); return; }
    const btn = $('#btnFinalizar');
    const liberar = () => { delete btn.dataset.ocupado; btn.disabled = naFila > 0; };
    btn.disabled = true; btn.dataset.ocupado = '1';

    // Algum produto foi contado, ou recontado, depois que esta tela abriu?
    try {
      const { data: atuais } = await listarItensContados(id);
      const porId = new Map(itens.map(i => [i.id, i]));
      const novos = atuais.filter(i => !porId.has(i.id)).length;
      const mudaram = atuais.filter(i => porId.has(i.id) && Number(porId.get(i.id).quantidade_contada) !== Number(i.quantidade_contada)).length;
      if (novos || mudaram) {
        recarregar(novos
          ? `${plural(novos, 'item foi contado', 'itens foram contados')} depois que você abriu o fechamento. A lista vai ser atualizada, com os saldos que você já digitou.`
          : `${plural(mudaram, 'item foi recontado', 'itens foram recontados')} depois que você abriu o fechamento. A lista vai ser atualizada, com os saldos que você já digitou.`);
        return;
      }
    } catch (err) { liberar(); showToast(mensagemErro(err, 'conferir itens'), 'error'); return; }

    const vazios = inputs.length - resumir();
    const ok = await fmConfirm(vazios
      ? { titulo: vazios === inputs.length ? 'Nenhum saldo foi informado' : `${plural(vazios, 'saldo está', 'saldos estão')} em branco`, msg: 'Esses itens ficam como “sem saldo” no relatório, sem divergência calculada. Depois de finalizada, a auditoria não pode mais ser alterada.', confirmTxt: 'Finalizar mesmo assim', tipo: 'perigo' }
      : { titulo: 'Finalizar a auditoria?', msg: `${inputs.length === 1 ? 'O saldo está informado' : `Os ${fmtInt(inputs.length)} saldos estão informados`}. Depois de finalizada, a contagem e os saldos não podem mais ser alterados; o relatório de divergências fica disponível em seguida.`, confirmTxt: 'Finalizar auditoria' });
    if (!ok) { liberar(); return; }

    showLoading('Finalizando a auditoria…');
    try {
      // Todos os saldos, inclusive o apagado (vira vazio no banco), e a
      // finalização numa só operação
      const saldos = Object.fromEntries(itens.map((i, n) => [i.id, ler(n).valor ?? null]));
      await finalizarComSaldos(id, saldos);
      saindo = true;
      location.href = relatorio;
    } catch (err) {
      hideLoading(); liberar();
      if (err.code === ITENS_NOVOS) {
        const n = Number(err.details) || 1;
        recarregar(`${plural(n, 'item foi contado', 'itens foram contados')} enquanto você confirmava, e nada foi finalizado. A lista vai ser atualizada, com os saldos que você já digitou.`);
        return;
      }
      if (err.code === JA_ENCERRADA) {
        const atual = await buscarAuditoria(id).catch(() => null);
        if (atual?.status === 'finalizada') {
          saindo = true;
          showToast('A auditoria já estava finalizada. Abrindo o relatório…', 'info', 4000);
          setTimeout(() => { location.href = relatorio; }, 1500);
          return;
        }
        showToast('A auditoria foi cancelada por outra pessoa; o fechamento não vale mais.', 'warning', 8000);
        return;
      }
      showToast(mensagemErro(err, 'finalizar auditoria'), 'error', 8000);
    }
  });
}
