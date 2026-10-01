// ================================================================
//  AudiStock — js/telas/fechamento.js  (estoque-sistema.html?id=…)
//  Fechamento da auditoria: informa o saldo do sistema (ERP) de cada
//  item contado, vê a diferença na hora e conclui a auditoria.
// ================================================================

import { requireAuth, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, plural, fmtQtd, qtdHtml, unHtml, difHtml, vazioHtml,
         fmConfirm, showToast, showLoading, hideLoading, ICONS, mensagemErro } from '../ui.js';
import { buscarAuditoria, finalizarAuditoria } from '../auditorias.js';
import { listarItensContados, preencherEstoquesSistema } from '../contagem.js';

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
  let aud, itens;
  try {
    aud = await buscarAuditoria(id);
    ({ data: itens } = await listarItensContados(id, { limit: 5000 }));
  } catch (err) {
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({ titulo: aud ? 'Não foi possível carregar os itens' : 'Auditoria não encontrada', texto: aud ? mensagemErro(err) : 'Ela pode ter sido excluída, ou o link está incompleto.', acoes: '<button type="button" class="btn btn-secondary" onclick="location.reload()">Tentar de novo</button>' })}</div>`;
    return;
  }
  definirTitulo(`Fechamento ${aud.numero_auditoria}`);

  if (aud.status !== 'em_andamento') {
    const fin = aud.status === 'finalizada';
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({
      titulo: fin ? `A ${aud.numero_auditoria} já foi concluída` : `A ${aud.numero_auditoria} foi cancelada`,
      texto: fin ? 'Os saldos já foram informados e o relatório está disponível.' : 'Auditorias canceladas não têm fechamento.',
      acoes: fin ? `<a class="btn btn-primary" href="relatorios.html?id=${encodeURIComponent(aud.id)}">Ver relatório</a>` : `<a class="btn btn-secondary" href="app.html?tela=historico&id=${encodeURIComponent(aud.id)}">Ver detalhes</a>`,
    })}</div>`;
    return;
  }

  const voltarContagem = `contagem.html?id=${encodeURIComponent(id)}`;
  if (!itens.length) {
    el.innerHTML = `<a class="voltar" href="${voltarContagem}">${ICONS.voltar}Contagem</a><div class="card">${vazioHtml({
      titulo: 'Nenhum item foi contado nesta auditoria',
      texto: 'Registre ao menos um produto na contagem para depois informar os saldos do sistema.',
      acoes: `<a class="btn btn-primary" href="${voltarContagem}">Voltar à contagem</a>`,
    })}</div>`;
    return;
  }

  const podeConcluir = hasRole('auditor');
  itens.sort((a, b) => String(a.produtos?.nome_produto).localeCompare(String(b.produtos?.nome_produto), 'pt-BR'));

  el.innerHTML = `
    <a class="voltar" href="${voltarContagem}">${ICONS.voltar}Contagem</a>
    <div class="cabecalho">
      <div>
        <h2 class="cabecalho-titulo">Fechamento da <span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span></h2>
        <div class="cabecalho-meta"><span>${escapeHtml(aud.empresas?.nome ?? '—')}</span><span>${plural(itens.length, 'item contado', 'itens contados')}</span><span>Contagem ${aud.auditoria_cega ? 'cega' : 'visível'}</span></div>
        <p class="muted" style="margin-top:8px;max-width:680px">Informe o saldo que consta no sistema (ERP) para cada produto. A diferença aparece ao lado. A auditoria só é encerrada quando você concluir.</p>
      </div>
    </div>
    <section class="card" aria-label="Saldos do sistema">
      <div class="tabela-wrap"><table class="tabela-resp">
        <thead><tr><th scope="col">Produto</th><th scope="col" class="num">Contado</th><th scope="col" class="num">Saldo no sistema</th><th scope="col" class="num">Diferença</th></tr></thead>
        <tbody>${itens.map((i, n) => {
          const un = i.produtos?.unidade_medida;
          return `<tr>
            <td class="cel-titulo"><span class="forte">${escapeHtml(i.produtos?.nome_produto ?? '—')}</span><span class="sub codigo">${escapeHtml(i.produtos?.codigo_produto ?? '')}</span></td>
            <td class="num" data-label="Contado">${qtdHtml(i.quantidade_contada, un)}</td>
            <td class="num" data-label="Saldo no sistema"><span class="saldo-wrap">
              <label class="sr-only" for="saldo${n}">Saldo no sistema de ${escapeHtml(i.produtos?.nome_produto ?? '')}</label>
              <input class="form-input saldo-input" id="saldo${n}" data-n="${n}" inputmode="decimal" autocomplete="off" placeholder="—"
                value="${i.estoque_sistema != null ? escapeHtml(fmtQtd(i.estoque_sistema, un)) : ''}" ${podeConcluir ? '' : 'readonly'}/>${unHtml(un)}</span></td>
            <td class="num" data-label="Diferença" id="dif${n}"></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
    <div class="barra-acoes">
      <span class="resumo" id="resumoSaldos" aria-live="polite"></span>
      <div class="cabecalho-acoes" style="width:auto">
        <a class="btn btn-secondary" href="${voltarContagem}">Voltar à contagem</a>
        ${podeConcluir ? '<button type="button" class="btn btn-primary" id="btnConcluir">Concluir auditoria</button>' : ''}
      </div>
    </div>`;
  const $ = s => el.querySelector(s);
  const inputs = [...el.querySelectorAll('.saldo-input')];

  const atualizar = n => {
    const i = itens[n], v = lerNumero(inputs[n].value);
    if (Number.isNaN(v) || v < 0) inputs[n].setAttribute('aria-invalid', 'true'); else inputs[n].removeAttribute('aria-invalid');
    $(`#dif${n}`).innerHTML = v == null || Number.isNaN(v) ? '<span class="dif-nula">—</span>' : difHtml(Math.round((Number(i.quantidade_contada) - v) * 1000) / 1000, i.produtos?.unidade_medida);
  };
  const resumir = () => {
    const preenchidos = inputs.filter(x => lerNumero(x.value) != null && !Number.isNaN(lerNumero(x.value))).length;
    $('#resumoSaldos').innerHTML = `<strong>${fmtInt(preenchidos)}</strong> de ${plural(inputs.length, 'saldo informado', 'saldos informados')}`;
    return preenchidos;
  };
  inputs.forEach((x, n) => {
    atualizar(n);
    x.addEventListener('input', () => { atualizar(n); resumir(); });
    x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (inputs[n + 1] ?? $('#btnConcluir'))?.focus(); inputs[n + 1]?.select(); } });
  });
  resumir();

  $('#btnConcluir')?.addEventListener('click', async () => {
    const invalido = inputs.find(x => { const v = lerNumero(x.value); return Number.isNaN(v) || v < 0; });
    if (invalido) { invalido.focus(); showToast('Há um saldo inválido. Use apenas números, com vírgula para decimais.', 'warning'); return; }
    const vazios = inputs.length - resumir();
    const ok = await fmConfirm(vazios
      ? { titulo: vazios === inputs.length ? 'Nenhum saldo foi informado' : `${plural(vazios, 'saldo está', 'saldos estão')} em branco`, msg: `Esses itens ficam como “sem saldo” no relatório, sem divergência calculada. Depois de concluída, a auditoria não pode mais ser alterada.`, confirmTxt: 'Concluir mesmo assim', tipo: 'perigo' }
      : { titulo: 'Concluir a auditoria?', msg: 'Depois de concluída, a contagem e os saldos não podem mais ser alterados. O relatório de divergências fica disponível em seguida.', confirmTxt: 'Concluir auditoria' });
    if (!ok) return;

    const btn = $('#btnConcluir'); btn.disabled = true;
    showLoading('Concluindo a auditoria…');
    try {
      const estoques = inputs.map((x, n) => ({ produto_id: itens[n].produtos?.id ?? itens[n].produto_id, quantidade: lerNumero(x.value) })).filter(e => e.quantidade != null);
      const r = await preencherEstoquesSistema(id, estoques);
      if (r.erros) throw new Error(`${plural(r.erros, 'saldo não foi gravado', 'saldos não foram gravados')}. Nada foi concluído; tente de novo.`);
      await finalizarAuditoria(id);
      location.href = `relatorios.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      hideLoading(); btn.disabled = false;
      showToast(mensagemErro(err, 'concluir auditoria'), 'error', 8000);
    }
  });
}
