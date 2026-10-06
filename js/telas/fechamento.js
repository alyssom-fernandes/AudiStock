// ================================================================
//  AudiStock — js/telas/fechamento.js  (estoque-sistema.html?id=…)
//  Fechamento da auditoria: informa o saldo do sistema (ERP) de cada
//  item contado, vê a diferença na hora e finaliza a auditoria.
//
//  Antes de finalizar, confere de novo os itens no servidor: um produto
//  contado (ou recontado) por outra pessoa depois que esta tela abriu não
//  fica de fora. A finalização grava os saldos de todos os itens e
//  encerra numa só operação (finalizar_auditoria), que também recusa um
//  item contado ou recontado enquanto o diálogo de confirmação estava
//  aberto: a diferença que a pessoa revisou é a que vai para o relatório.
//  Um saldo apagado é gravado como vazio (sem saldo).
// ================================================================

import { requireAuth, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, plural, qtdHtml, unHtml, difHtml, vazioHtml, lerQuantidade, fmtEntrada,
         fmConfirm, showToast, showLoading, hideLoading, ICONS, mensagemErro } from '../ui.js';
import { buscarAuditoria } from '../auditorias.js';
import { listarItensContados, finalizarComSaldos, ITENS_NOVOS, JA_ENCERRADA, RECONTADOS } from '../contagem.js';
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
  const doBanco = i => fmtEntrada(i.estoque_sistema, i.produtos?.unidade_medida);
  const valorInicial = i => i.produto_id in rascunho ? rascunho[i.produto_id] : doBanco(i);
  const comRascunho = Object.keys(rascunho).length > 0;   // o rascunho só guarda o que foi digitado
  let naFila = fila.meus;
  const voltarContagemLink = `<a class="link" href="${voltarContagem}">Ver na contagem</a>`;
  // Avisos da fila deste aparelho; refeitos quando ela muda com a tela aberta
  const avisosFila = ({ meus, deOutros, comErro }) => `${meus ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${meus === 1 ? 'Uma contagem guardada neste aparelho ainda não foi enviada' : `${fmtInt(meus)} contagens guardadas neste aparelho ainda não foram enviadas`}. Ela${meus === 1 ? ' sobe sozinha' : 's sobem sozinhas'} quando houver internet, e então dá para finalizar.</p></div>` : ''}
    ${deOutros ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${deOutros === 1 ? 'Uma contagem de outra pessoa está guardada' : `${fmtInt(deOutros)} contagens de outra pessoa estão guardadas`} neste aparelho e só ${deOutros === 1 ? 'sobe' : 'sobem'} quando ela entrar aqui de novo. Se você finalizar antes, ${deOutros === 1 ? 'ela fica' : 'elas ficam'} de fora.</p></div>` : ''}
    ${comErro ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${plural(comErro, 'contagem deste aparelho foi recusada', 'contagens deste aparelho foram recusadas')} pelo servidor e não ${comErro === 1 ? 'entra' : 'entram'} no fechamento. ${voltarContagemLink}</p></div>` : ''}`;

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
    <div id="avisosFila">${avisosFila(fila)}</div>
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
  const primeiroInvalido = () => {
    const n = inputs.findIndex((_, k) => ler(k).erro);
    if (n >= 0) { inputs[n].focus(); showToast(`Saldo inválido em ${itens[n].produtos?.nome_produto ?? 'um item'}: ${ler(n).erro}`, 'warning', 6000); }
    return n >= 0;
  };
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

  // Recarrega a lista (itens novos ou recontados) guardando o que foi
  // digitado: só os saldos diferentes dos que estavam no banco
  const recarregar = motivo => {
    const r = {};
    inputs.forEach((x, n) => { if (x.value.trim() !== doBanco(itens[n])) r[itens[n].produto_id ?? itens[n].produtos?.id] = x.value; });
    const guardou = Object.keys(r).length > 0;
    try { if (guardou) sessionStorage.setItem(chaveRascunho(id), JSON.stringify(r)); } catch (_) {}
    showToast(`${motivo} A lista vai ser atualizada${guardou ? ', com os saldos que você já digitou' : ''}.`, 'warning', 6000);
    saindo = true;
    setTimeout(() => location.reload(), 1800);
  };
  const relatorio = `relatorios.html?id=${encodeURIComponent(id)}`;
  const detalhes = `app.html?tela=historico&id=${encodeURIComponent(id)}`;

  // Auditoria encerrada por outra pessoa enquanto esta tela estava aberta:
  // os campos ficam só para consulta, e o aviso diz o que aconteceu
  const encerrarTela = html => {
    saindo = true; alterado = false;
    inputs.forEach(x => { x.disabled = true; });
    const btn = $('#btnFinalizar');
    if (btn) { btn.disabled = true; btn.dataset.ocupado = '1'; }
    const aviso = document.createElement('div');
    aviso.className = 'aviso aviso-aviso';
    aviso.setAttribute('role', 'alert');
    aviso.innerHTML = `${ICONS.info}<p>${html}</p>`;
    $('.cabecalho').after(aviso);
    aviso.scrollIntoView({ block: 'nearest' });
  };
  const mesmoSaldo = (a, b) => (a == null && b == null) || (a != null && b != null && Math.round(Number(a) * 1000) === Math.round(Number(b) * 1000));

  // A fila deste aparelho continua sendo enviada com o fechamento aberto:
  // quando esvazia, Finalizar libera; o que subiu entra na lista, e o que
  // foi recusado fica de fora, com aviso
  if (podeFinalizar) initOfflineSync(({ pendentes, deOutros, comErro, enviados }) => {
    if (saindo) return;
    if (enviados) { recarregar(`${plural(enviados, 'contagem guardada foi enviada', 'contagens guardadas foram enviadas')}.`); return; }
    naFila = pendentes;
    $('#avisosFila').innerHTML = avisosFila({ meus: pendentes, deOutros, comErro });
    const btn = $('#btnFinalizar');
    if (btn && !btn.dataset.ocupado) btn.disabled = pendentes > 0;
  }, { auditoriaId: id, textoRecusa: 'Ela fica de fora do fechamento; o motivo aparece na contagem.' });

  $('#btnFinalizar')?.addEventListener('click', async () => {
    if (primeiroInvalido()) return;
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
          ? `${plural(novos, 'item foi contado', 'itens foram contados')} depois que você abriu o fechamento.`
          : `${plural(mudaram, 'item foi recontado', 'itens foram recontados')} depois que você abriu o fechamento.`);
        return;
      }
    } catch (err) { liberar(); showToast(mensagemErro(err, 'conferir itens'), 'error'); return; }

    const vazios = inputs.length - resumir();
    const ok = await fmConfirm(vazios
      ? { titulo: vazios === inputs.length ? 'Nenhum saldo foi informado' : `${plural(vazios, 'saldo está', 'saldos estão')} em branco`, msg: 'Esses itens ficam como “sem saldo” no relatório, sem divergência calculada. Depois de finalizada, a auditoria não pode mais ser alterada.', confirmTxt: 'Finalizar mesmo assim', tipo: 'perigo' }
      : { titulo: 'Finalizar a auditoria?', msg: `${inputs.length === 1 ? 'O saldo está informado' : `Os ${fmtInt(inputs.length)} saldos estão informados`}. Depois de finalizada, a contagem e os saldos não podem mais ser alterados; o relatório de divergências fica disponível em seguida.`, confirmTxt: 'Finalizar auditoria' });
    if (!ok) { liberar(); return; }
    // Um saldo mudado enquanto a conferência rodava também precisa ser válido
    if (primeiroInvalido()) { liberar(); return; }

    showLoading('Finalizando a auditoria…');
    // Todos os saldos, inclusive o apagado (vira vazio no banco), e o
    // contado que a tela mostrou, para o banco recusar um item recontado
    const saldos = Object.fromEntries(itens.map((i, n) => [i.id, ler(n).valor ?? null]));
    const contados = Object.fromEntries(itens.map(i => [i.id, Number(i.quantidade_contada)]));
    try {
      await finalizarComSaldos(id, saldos, contados);
      saindo = true;
      location.href = relatorio;
    } catch (err) {
      hideLoading(); liberar();
      if (err.code === ITENS_NOVOS || err.code === RECONTADOS) {
        const n = Number(err.details) || 1;
        recarregar(err.code === ITENS_NOVOS
          ? `${plural(n, 'item foi contado', 'itens foram contados')} enquanto você confirmava, e nada foi finalizado.`
          : `${plural(n, 'item foi recontado', 'itens foram recontados')} enquanto você confirmava, e nada foi finalizado.`);
        return;
      }
      if (err.code === JA_ENCERRADA) {
        // O banco diz o status; sem ele (banco antigo), consulta
        const status = err.details || (await buscarAuditoria(id).catch(() => null))?.status || null;
        if (status === 'finalizada') {
          // Foi esta tela (a resposta se perdeu na rede) ou outra pessoa?
          const gravados = await listarItensContados(id).then(r => r.data).catch(() => null);
          const mesmos = gravados?.length === itens.length && gravados.every(g => g.id in saldos && mesmoSaldo(g.estoque_sistema, saldos[g.id]));
          if (mesmos) {
            saindo = true;
            showToast('A auditoria já estava finalizada com estes saldos. Abrindo o relatório…', 'info', 4000);
            setTimeout(() => { location.href = relatorio; }, 1500);
            return;
          }
          encerrarTela(gravados
            ? `Outra pessoa finalizou esta auditoria antes, com outros saldos. Os que você digitou não foram gravados e continuam aqui só para conferência. <a class="link" href="${relatorio}">Abrir o relatório</a>`
            : `A auditoria já foi finalizada. Confira no relatório se os saldos são os que você digitou. <a class="link" href="${relatorio}">Abrir o relatório</a>`);
          return;
        }
        encerrarTela(status === 'cancelada'
          ? `A auditoria foi cancelada por outra pessoa; o fechamento não vale mais. <a class="link" href="${detalhes}">Ver detalhes</a>`
          : `A auditoria já foi encerrada; o fechamento não vale mais. <a class="link" href="${detalhes}">Ver detalhes</a>`);
        return;
      }
      showToast(mensagemErro(err, 'finalizar auditoria'), 'error', 8000);
    }
  });
}
