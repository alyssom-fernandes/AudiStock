// ================================================================
//  AudiStock — js/telas/fechamento.js  (estoque-sistema.html?id=…)
//  Fechamento da auditoria: informa o saldo do sistema (ERP) de cada
//  item contado, vê a diferença na hora e finaliza a auditoria.
// ================================================================

import { requireAuth, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, plural, fmtQtd, qtdHtml, unHtml, difHtml, vazioHtml,
         fmConfirm, showToast, showLoading, hideLoading, ICONS, mensagemErro } from '../ui.js';
import { buscarAuditoria, finalizarAuditoria } from '../auditorias.js';
import { listarItensContados, preencherEstoquesSistema } from '../contagem.js';
import { contarPendentes, sincronizar } from '../offline.js';

const auth = await requireAuth();
if (auth) {
  initLayout('Fechamento', { ativa: 'auditorias' });
  await iniciar();
}

function lerNumero(txt) {
  const b = String(txt ?? '').trim().replace(/\s/g, '');
  if (b === '') return null;
  const n = Number(b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b);
  return Number.isFinite(n) ? n : NaN;
}

async function iniciar() {
  const el = document.getElementById('pageBody');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('app.html?tela=auditorias'); return; }

  el.innerHTML = `<div class="carregando-bloco"><span class="skel" style="width:30%;height:22px"></span><span class="skel" style="width:50%"></span></div>`;
  let aud, itens, naFila = 0;
  try {
    aud = await buscarAuditoria(id);
    // Contagens guardadas neste aparelho sobem antes, para o fechamento ver tudo
    naFila = await contarPendentes(id).catch(() => 0);
    if (naFila) { await sincronizar().catch(() => {}); naFila = await contarPendentes(id).catch(() => 0); }
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
      texto: naFila ? 'Há contagens guardadas neste aparelho esperando internet. Elas aparecem aqui depois de enviadas.' : 'Registre ao menos um produto na contagem para depois informar os saldos do sistema.',
      acoes: `<a class="btn btn-primary" href="${voltarContagem}">Voltar à contagem</a>`,
    })}</div>`;
    return;
  }

  const podeFinalizar = hasRole('auditor');
  itens.sort((a, b) => String(a.produtos?.nome_produto).localeCompare(String(b.produtos?.nome_produto), 'pt-BR'));

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
    ${naFila ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${plural(naFila, 'contagem guardada', 'contagens guardadas')} neste aparelho ainda não ${naFila === 1 ? 'foi enviada' : 'foram enviadas'}. Abra a contagem com internet para enviá-las antes de finalizar.</p></div>` : ''}
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
                value="${i.estoque_sistema != null ? escapeHtml(fmtQtd(i.estoque_sistema, un)) : ''}"/>${unHtml(un)}</span>`
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
  let alterado = false, saindo = false;

  const atualizar = n => {
    const i = itens[n], v = lerNumero(inputs[n].value);
    if (Number.isNaN(v) || v < 0) inputs[n].setAttribute('aria-invalid', 'true'); else inputs[n].removeAttribute('aria-invalid');
    $(`#dif${n}`).innerHTML = v == null || Number.isNaN(v) || v < 0 ? '<span class="dif-nula">—</span>' : difHtml(Math.round((Number(i.quantidade_contada) - v) * 1000) / 1000, i.produtos?.unidade_medida);
  };
  const resumir = () => {
    if (!podeFinalizar) return 0;
    const preenchidos = inputs.filter(x => lerNumero(x.value) != null && !Number.isNaN(lerNumero(x.value))).length;
    $('#resumoSaldos').innerHTML = `<strong>${fmtInt(preenchidos)}</strong> de ${plural(inputs.length, 'saldo informado', 'saldos informados')}`;
    return preenchidos;
  };
  inputs.forEach((x, n) => {
    atualizar(n);
    x.addEventListener('input', () => { alterado = true; atualizar(n); resumir(); });
    x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (inputs[n + 1] ?? $('#btnFinalizar'))?.focus(); inputs[n + 1]?.select(); } });
  });
  resumir();

  // Os saldos só são gravados ao finalizar: avisa antes de sair com eles preenchidos
  window.addEventListener('beforeunload', e => { if (alterado && !saindo) { e.preventDefault(); e.returnValue = ''; } });

  $('#btnFinalizar')?.addEventListener('click', async () => {
    const invalido = inputs.find(x => { const v = lerNumero(x.value); return Number.isNaN(v) || v < 0; });
    if (invalido) { invalido.focus(); showToast('Há um saldo inválido. Use apenas números, com vírgula para decimais.', 'warning'); return; }
    const vazios = inputs.length - resumir();
    const ok = await fmConfirm(vazios
      ? { titulo: vazios === inputs.length ? 'Nenhum saldo foi informado' : `${plural(vazios, 'saldo está', 'saldos estão')} em branco`, msg: 'Esses itens ficam como “sem saldo” no relatório, sem divergência calculada. Depois de finalizada, a auditoria não pode mais ser alterada.', confirmTxt: 'Finalizar mesmo assim', tipo: 'perigo' }
      : { titulo: 'Finalizar a auditoria?', msg: 'Depois de finalizada, a contagem e os saldos não podem mais ser alterados. O relatório de divergências fica disponível em seguida.', confirmTxt: 'Finalizar auditoria' });
    if (!ok) return;

    const btn = $('#btnFinalizar'); btn.disabled = true;
    showLoading('Finalizando a auditoria…');
    try {
      const estoques = inputs.map((x, n) => ({ produto_id: itens[n].produtos?.id ?? itens[n].produto_id, quantidade: lerNumero(x.value) })).filter(e => e.quantidade != null);
      const r = await preencherEstoquesSistema(id, estoques);
      if (r.erros) throw new Error(`${plural(r.erros, 'saldo não foi gravado', 'saldos não foram gravados')}. Nada foi finalizado; tente de novo.`);
      await finalizarAuditoria(id);
      saindo = true;
      location.href = `relatorios.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      hideLoading(); btn.disabled = false;
      showToast(mensagemErro(err, 'finalizar auditoria'), 'error', 8000);
    }
  });
}
