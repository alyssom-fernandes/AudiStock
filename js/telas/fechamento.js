// ================================================================
//  AudiStock — js/telas/fechamento.js  (estoque-sistema.html?id=…)
//  Fechamento da auditoria: informa o saldo do sistema (ERP) de cada
//  item contado, vê a diferença na hora e finaliza a auditoria.
//
//  Antes de finalizar, confere de novo os itens no servidor: um produto
//  contado por outra pessoa depois que esta tela abriu não fica de fora.
//  Um saldo apagado é gravado como vazio (sem saldo), e não esquecido.
// ================================================================

import { requireAuth, hasRole } from '../auth.js';
import { initLayout, definirTitulo, escapeHtml, fmtInt, plural, qtdHtml, unHtml, difHtml, vazioHtml, lerQuantidade, fmtEntrada,
         fmConfirm, showToast, showLoading, hideLoading, ICONS, mensagemErro } from '../ui.js';
import { buscarAuditoria, finalizarAuditoria } from '../auditorias.js';
import { listarItensContados, preencherEstoquesSistema } from '../contagem.js';
import { contarPendentes, resumoFila, sincronizar } from '../offline.js';

const auth = await requireAuth();
if (auth) {
  initLayout('Fechamento', { ativa: 'auditorias' });
  await iniciar();
}

// Saldos digitados e ainda não gravados, guardados quando a tela precisa
// recarregar (itens novos contados por outra pessoa)
const chaveRascunho = id => `audistock-saldos-${id}`;

async function iniciar() {
  const el = document.getElementById('pageBody');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('app.html?tela=auditorias'); return; }

  el.innerHTML = `<div class="carregando-bloco"><span class="skel" style="width:30%;height:22px"></span><span class="skel" style="width:50%"></span></div>`;
  let aud, itens, naFila = 0, recusadas = 0;
  try {
    aud = await buscarAuditoria(id);
    // Contagens guardadas neste aparelho sobem antes, para o fechamento ver tudo
    naFila = await contarPendentes(id).catch(() => 0);
    if (naFila) { await sincronizar().catch(() => {}); naFila = await contarPendentes(id).catch(() => 0); }
    recusadas = (await resumoFila(id).catch(() => ({ comErro: 0 }))).comErro;
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
  let rascunho = {};
  try { rascunho = JSON.parse(sessionStorage.getItem(chaveRascunho(id)) || '{}'); sessionStorage.removeItem(chaveRascunho(id)); } catch (_) {}
  const valorInicial = i => i.produto_id in rascunho ? rascunho[i.produto_id] : fmtEntrada(i.estoque_sistema, i.produtos?.unidade_medida);

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
    ${recusadas ? `<div class="aviso aviso-aviso">${ICONS.info}<p>${plural(recusadas, 'contagem deste aparelho foi recusada', 'contagens deste aparelho foram recusadas')} pelo servidor e não ${recusadas === 1 ? 'entra' : 'entram'} no fechamento. <a class="link" href="${voltarContagem}">Ver na contagem</a></p></div>` : ''}
    ${Object.keys(rascunho).length ? `<div class="aviso">${ICONS.info}<p>A lista foi atualizada com itens contados depois que você abriu o fechamento. Os saldos que você já tinha digitado foram mantidos.</p></div>` : ''}
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
  let alterado = false, saindo = false;

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

  $('#btnFinalizar')?.addEventListener('click', async () => {
    const invalido = inputs.findIndex((_, n) => ler(n).erro);
    if (invalido >= 0) { inputs[invalido].focus(); showToast(`Saldo inválido em ${itens[invalido].produtos?.nome_produto ?? 'um item'}: ${ler(invalido).erro}`, 'warning', 6000); return; }
    const btn = $('#btnFinalizar'); btn.disabled = true;

    // Algum produto foi contado depois que esta tela abriu?
    try {
      const { data: atuais } = await listarItensContados(id);
      const conhecidos = new Set(itens.map(i => i.id));
      const novos = atuais.filter(i => !conhecidos.has(i.id));
      if (novos.length) {
        const r = {};
        inputs.forEach((x, n) => { r[itens[n].produto_id ?? itens[n].produtos?.id] = x.value; });
        try { sessionStorage.setItem(chaveRascunho(id), JSON.stringify(r)); } catch (_) {}
        showToast(`${plural(novos.length, 'item foi contado', 'itens foram contados')} depois que você abriu o fechamento. A lista vai ser atualizada, com os saldos que você já digitou.`, 'warning', 6000);
        saindo = true;
        setTimeout(() => location.reload(), 1800);
        return;
      }
    } catch (err) { btn.disabled = false; showToast(mensagemErro(err, 'conferir itens'), 'error'); return; }

    const vazios = inputs.length - resumir();
    const ok = await fmConfirm(vazios
      ? { titulo: vazios === inputs.length ? 'Nenhum saldo foi informado' : `${plural(vazios, 'saldo está', 'saldos estão')} em branco`, msg: 'Esses itens ficam como “sem saldo” no relatório, sem divergência calculada. Depois de finalizada, a auditoria não pode mais ser alterada.', confirmTxt: 'Finalizar mesmo assim', tipo: 'perigo' }
      : { titulo: 'Finalizar a auditoria?', msg: `Os ${plural(inputs.length, 'saldo está informado', 'saldos estão informados')}. Depois de finalizada, a contagem e os saldos não podem mais ser alterados; o relatório de divergências fica disponível em seguida.`, confirmTxt: 'Finalizar auditoria' });
    if (!ok) { btn.disabled = false; return; }

    showLoading('Finalizando a auditoria…');
    try {
      // Só o que mudou, inclusive o saldo apagado (vira vazio no banco)
      const estoques = inputs.map((x, n) => ({ produto_id: itens[n].produtos?.id ?? itens[n].produto_id, quantidade: ler(n).valor ?? null, antes: itens[n].estoque_sistema }))
        .filter(e => (e.quantidade == null ? null : Number(e.quantidade)) !== (e.antes == null ? null : Number(e.antes)))
        .map(({ produto_id, quantidade }) => ({ produto_id, quantidade }));
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
