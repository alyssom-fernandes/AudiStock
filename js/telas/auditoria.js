// ================================================================
//  AudiStock — js/telas/auditoria.js  (?tela=historico&id=…)
//  Detalhes de uma auditoria: identificação, situação, itens
//  contados com quem contou e o histórico de correções de cada item.
//  Ações: continuar, ver relatório, cancelar (admin) e excluir (supremo).
// ================================================================

import { hasRole, isSupremo } from '../auth.js';
import { buscarAuditoria, progresso, cancelarAuditoria, excluirAuditoria } from '../auditorias.js';
import { listarItensContados, historicoItem } from '../contagem.js';
import { escapeHtml, fmtDateTime, fmtInt, plural, badgeStatus, qtdHtml, difHtml, vazioHtml, abrirModal,
         fmConfirm, showToast, showLoading, hideLoading, normalizar, debounce, delegarAcoes, ICONS, mensagemErro } from '../ui.js';

const POR_PAGINA = 100;

export async function render(el, { perfil, params, irPara }) {
  const id = params.get('id');
  if (!id) { irPara('auditorias'); return; }

  el.innerHTML = `<div class="carregando-bloco"><span class="skel" style="width:30%;height:22px"></span><span class="skel" style="width:50%"></span></div>`;
  let aud;
  try { aud = await buscarAuditoria(id); }
  catch (err) {
    el.innerHTML = `<a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a><div class="card">${vazioHtml({ titulo: 'Auditoria não encontrada', texto: 'Ela pode ter sido excluída, ou o link está incompleto.', acoes: '<a class="btn btn-secondary" href="app.html?tela=auditorias">Ver auditorias</a>' })}</div>`;
    return;
  }
  const [{ data: itens }, prog] = await Promise.all([listarItensContados(id, { limit: 5000 }), progresso(id).catch(() => null)]);

  const andamento = aud.status === 'em_andamento', finalizada = aud.status === 'finalizada';
  const corrigidos = itens.filter(i => i.atualizado_em).length;
  const contadores = [...new Set(itens.map(i => i.usuarios?.nome).filter(Boolean))];
  const acoes = [
    andamento ? `<a class="btn btn-primary" href="contagem.html?id=${encodeURIComponent(id)}">Continuar contagem</a>` : '',
    finalizada ? `<a class="btn btn-primary" href="relatorios.html?id=${encodeURIComponent(id)}">Ver relatório</a>` : '',
    andamento && hasRole('administrador') ? `<button type="button" class="btn btn-secondary" data-acao="cancelar">Cancelar auditoria</button>` : '',
    isSupremo() ? `<button type="button" class="btn btn-ghost btn-perigo-texto" data-acao="excluir">Excluir</button>` : '',
  ].join('');

  el.innerHTML = `
    <a class="voltar" href="app.html?tela=auditorias">${ICONS.voltar}Auditorias</a>
    <div class="cabecalho">
      <div>
        <h2 class="cabecalho-titulo"><span class="nowrap">${escapeHtml(aud.numero_auditoria)}</span> ${badgeStatus(aud.status)}</h2>
        <div class="cabecalho-meta">
          <span>${escapeHtml(aud.empresas?.nome ?? '—')}</span>
          <span>Contagem ${aud.auditoria_cega ? 'cega' : 'visível'}</span>
          <span>Início ${fmtDateTime(aud.data_inicio)}</span>
          ${aud.data_fim ? `<span>Fim ${fmtDateTime(aud.data_fim)}</span>` : ''}
          <span>Criada por ${escapeHtml(aud.usuarios?.nome ?? '—')}</span>
        </div>
        ${aud.observacoes ? `<p class="muted" style="margin-top:6px">${escapeHtml(aud.observacoes)}</p>` : ''}
      </div>
      ${acoes ? `<div class="cabecalho-acoes">${acoes}</div>` : ''}
    </div>
    ${aud.status === 'cancelada' ? `<div class="aviso aviso-perigo">${ICONS.alerta}<p><strong>Cancelada</strong> em ${fmtDateTime(aud.cancelado_em)}${aud.motivo_cancelamento ? ` — ${escapeHtml(aud.motivo_cancelamento)}` : ''}. As contagens ficam guardadas, mas não geram relatório.</p></div>` : ''}
    <div class="kpis">
      <div class="kpi"><div class="kpi-rotulo">Itens contados</div><div class="kpi-valor">${fmtInt(itens.length)}${prog ? `<small> de ${fmtInt(prog.totalProdutos)}</small>` : ''}</div>${prog ? `<div class="kpi-apoio">${prog.pct}% dos produtos ativos</div>` : ''}</div>
      <div class="kpi"><div class="kpi-rotulo">Correções</div><div class="kpi-valor">${fmtInt(corrigidos)}</div><div class="kpi-apoio">${corrigidos === 1 ? 'item recontado' : 'itens recontados'}</div></div>
      <div class="kpi"><div class="kpi-rotulo">Contado por</div><div class="kpi-valor" style="font-size:16px;font-weight:500;margin-top:8px">${contadores.length ? escapeHtml(contadores.join(', ')) : '—'}</div></div>
    </div>
    <section class="card" aria-labelledby="tItens">
      <div class="card-header">
        <h3 class="card-title" id="tItens">Itens contados</h3>
        ${itens.length ? `<label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar item</span><input class="form-input" type="search" id="itBusca" placeholder="Código ou produto" autocomplete="off"/></label>` : ''}
      </div>
      <div id="itCorpo"></div>
    </section>`;

  const $ = s => el.querySelector(s);
  let termo = '', limite = POR_PAGINA;

  const desenhar = () => {
    const t = normalizar(termo);
    const filtrados = t ? itens.filter(i => normalizar(i.produtos?.codigo_produto).includes(t) || normalizar(i.produtos?.nome_produto).includes(t)) : itens;
    if (!itens.length) {
      $('#itCorpo').innerHTML = vazioHtml({ titulo: 'Nenhum item contado nesta auditoria ainda', texto: andamento ? 'A lista é preenchida conforme a equipe registra a contagem.' : '', acoes: andamento ? `<a class="btn btn-secondary btn-sm" href="contagem.html?id=${encodeURIComponent(id)}">Abrir a contagem</a>` : '', compacto: true });
      return;
    }
    if (!filtrados.length) {
      $('#itCorpo').innerHTML = vazioHtml({ titulo: `Nenhum item corresponde a “${escapeHtml(termo)}”`, compacto: true });
      return;
    }
    const pagina = filtrados.slice(0, limite);
    $('#itCorpo').innerHTML = `<div class="tabela-wrap"><table class="tabela-lista">
      <thead><tr><th scope="col">Produto</th><th scope="col" class="num">Contado</th>${finalizada ? '<th scope="col" class="num">Sistema</th><th scope="col" class="num">Diferença</th>' : ''}<th scope="col">Contado por</th><th scope="col">Registro</th><th scope="col"><span class="sr-only">Correções</span></th></tr></thead>
      <tbody>${pagina.map(i => {
        const un = i.produtos?.unidade_medida;
        return `<tr>
          <td class="l-titulo"><span class="forte">${escapeHtml(i.produtos?.nome_produto ?? '—')}</span><span class="sub"><span class="codigo">${escapeHtml(i.produtos?.codigo_produto ?? '')}</span><span class="so-celular"> · ${escapeHtml(i.usuarios?.nome ?? '—')} · ${fmtDateTime(i.data_registro)}</span></span></td>
          <td class="num">${qtdHtml(i.quantidade_contada, un)}</td>
          ${finalizada ? `<td class="num so-desktop">${qtdHtml(i.estoque_sistema, un)}</td><td class="num">${difHtml(i.diferenca, un)}</td>` : ''}
          <td class="so-desktop">${escapeHtml(i.usuarios?.nome ?? '—')}</td>
          <td class="nowrap so-desktop">${fmtDateTime(i.data_registro)}</td>
          <td>${i.atualizado_em ? `<div class="acoes-linha"><button type="button" class="btn btn-ghost btn-sm" data-acao="correcoes" data-id="${escapeHtml(i.id)}">Ver correções</button></div>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="tabela-rodape"><span>${filtrados.length > limite ? `Mostrando ${fmtInt(limite)} de ${plural(filtrados.length, 'item', 'itens')}` : plural(filtrados.length, 'item', 'itens')}</span>
      ${filtrados.length > limite ? '<button type="button" class="btn btn-secondary btn-sm" data-acao="mais">Mostrar mais</button>' : ''}</div>`;
  };
  desenhar();

  $('#itBusca')?.addEventListener('input', debounce(e => { termo = e.target.value; limite = POR_PAGINA; desenhar(); }, 200));

  delegarAcoes(el, {
    mais: () => { limite += POR_PAGINA; desenhar(); },
    correcoes: ({ id: itemId }) => mostrarCorrecoes(itens.find(i => i.id === itemId)),
    cancelar: () => cancelar(aud, perfil, irPara),
    excluir: () => excluir(aud, itens.length, perfil, irPara),
  });
}

async function mostrarCorrecoes(item) {
  if (!item) return;
  const un = item.produtos?.unidade_medida;
  const m = abrirModal({
    titulo: 'Correções da contagem',
    subtitulo: `${escapeHtml(item.produtos?.nome_produto ?? '')} · <span class="codigo">${escapeHtml(item.produtos?.codigo_produto ?? '')}</span>`,
    corpo: '<div class="carregando-bloco" style="padding:0"><span class="skel"></span><span class="skel" style="width:70%"></span></div>',
    acoes: [{ texto: 'Fechar', classe: 'btn-secondary', tipo: 'submit' }],
    aoEnviar: modal => modal.fechar(),
  });
  try {
    const hist = await historicoItem(item.id);
    m.$('.modal-corpo').innerHTML = !hist.length ? '<p class="modal-texto">Nenhuma correção registrada.</p>' : `
      <ol class="lista-andamento" style="list-style:none">${hist.map(h => `
        <li style="padding:10px 0">
          <div class="registro-erro-cab"><span>${fmtDateTime(h.criado_em)}</span><span>${escapeHtml(h.usuarios?.nome ?? '—')}</span></div>
          <div class="registro-erro-msg"><span class="num">${qtdHtml(h.quantidade_anterior, un)}</span> → <span class="num forte">${qtdHtml(h.quantidade_nova, un)}</span></div>
          ${h.motivo ? `<div class="sub">${escapeHtml(h.motivo)}</div>` : ''}
        </li>`).join('')}</ol>`;
  } catch (err) {
    m.$('.modal-corpo').innerHTML = `<p class="modal-texto">${escapeHtml(mensagemErro(err))}</p>`;
  }
}

function cancelar(aud, perfil, irPara) {
  abrirModal({
    titulo: `Cancelar a ${aud.numero_auditoria}?`,
    subtitulo: 'As contagens ficam guardadas para consulta, mas a auditoria não pode mais ser retomada nem gera relatório.',
    corpo: `<div class="form-group"><label class="form-label" for="motivoCanc">Motivo <span class="opcional">(opcional)</span></label>
      <textarea class="form-input" id="motivoCanc" rows="2" maxlength="300" placeholder="Ex.: inventário remarcado"></textarea></div>`,
    acoes: [
      { texto: 'Voltar', classe: 'btn-secondary', acao: m => m.fechar() },
      { texto: 'Cancelar auditoria', classe: 'btn-danger', tipo: 'submit' },
    ],
    aoEnviar: async m => {
      m.ocupado(true, 'Cancelando…');
      try {
        await cancelarAuditoria(aud.id, perfil.id, m.$('#motivoCanc').value);
        m.fechar();
        showToast(`${aud.numero_auditoria} cancelada.`, 'success');
        irPara('historico', { id: aud.id });
      } catch (err) { m.ocupado(false); showToast(mensagemErro(err, 'cancelar auditoria'), 'error'); }
    },
  });
}

async function excluir(aud, nItens, perfil, irPara) {
  const ok = await fmConfirm({
    titulo: `Excluir a ${aud.numero_auditoria}?`,
    msg: `${aud.empresas?.nome ?? ''} · ${plural(nItens, 'item contado', 'itens contados')}.\nA auditoria e todas as contagens dela serão apagadas. Não dá para desfazer.`,
    confirmTxt: 'Excluir auditoria', tipo: 'perigo',
  });
  if (!ok) return;
  showLoading('Excluindo…');
  try {
    await excluirAuditoria(aud.id, perfil.id);
    showToast(`${aud.numero_auditoria} excluída.`, 'success');
    irPara('auditorias');
  } catch (err) { showToast(mensagemErro(err, 'excluir auditoria'), 'error'); }
  finally { hideLoading(); }
}
