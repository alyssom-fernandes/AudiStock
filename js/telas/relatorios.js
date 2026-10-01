// ================================================================
//  AudiStock — js/telas/relatorios.js
//  Auditorias finalizadas, cada uma com o resumo das divergências.
// ================================================================

import supabase from '../supabaseClient.js';
import { listarEmpresas } from '../empresas.js';
import { escapeHtml, fmtDate, fmtInt, vazioHtml, erroCargaHtml, normalizar, debounce, ICONS } from '../ui.js';

export async function render(el) {
  let lista = [], resumo = new Map(), busca = '', empresa = '';

  el.innerHTML = `
    <div class="toolbar">
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar relatório</span>
        <input class="form-input" type="search" id="relBusca" placeholder="Número ou empresa" autocomplete="off"/></label>
      <label class="sr-only" for="relEmpresa">Empresa</label>
      <select class="form-input" id="relEmpresa" style="width:240px"><option value="">Todas as empresas</option></select>
    </div>
    <div class="card" id="relCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#relCard');

  const desenhar = () => {
    const t = normalizar(busca);
    const visiveis = lista.filter(a => (!empresa || a.empresa_id === empresa)
      && (!t || normalizar(a.numero_auditoria).includes(t) || normalizar(a.empresas?.nome).includes(t)));
    if (!lista.length) {
      card.innerHTML = vazioHtml({ titulo: 'Nenhum relatório ainda', texto: 'O relatório de divergências aparece aqui quando uma auditoria é finalizada.', acoes: '<a class="btn btn-secondary" href="app.html?tela=auditorias">Ir para Auditorias</a>' });
      return;
    }
    if (!visiveis.length) {
      card.innerHTML = vazioHtml({ titulo: t ? `Nada encontrado para “${escapeHtml(busca)}”` : 'Nenhum relatório desta empresa', acoes: '<button type="button" class="btn btn-secondary btn-sm" id="relLimpar">Limpar filtros</button>', compacto: true });
      $('#relLimpar').onclick = () => { busca = ''; empresa = ''; $('#relBusca').value = ''; $('#relEmpresa').value = ''; desenhar(); };
      return;
    }
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-resp">
      <thead><tr><th scope="col">Auditoria</th><th scope="col">Empresa</th><th scope="col">Finalizada em</th><th scope="col">Resultado</th><th scope="col">Responsável</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(a => {
        const r = resumo.get(a.id);
        const resultado = !r ? '<span class="muted">…</span>'
          : !r.faltas && !r.sobras ? '<span class="dif-zero">Sem divergências</span>'
          : [r.faltas ? `<span class="dif-falta">${fmtInt(r.faltas)} ${r.faltas === 1 ? 'falta' : 'faltas'}</span>` : '', r.sobras ? `<span class="dif-sobra">${fmtInt(r.sobras)} ${r.sobras === 1 ? 'sobra' : 'sobras'}</span>` : ''].filter(Boolean).join(' · ');
        return `<tr>
          <td class="cel-titulo"><a class="linha-link codigo forte" href="relatorios.html?id=${encodeURIComponent(a.id)}">${escapeHtml(a.numero_auditoria)}</a></td>
          <td data-label="Empresa"><span class="forte">${escapeHtml(a.empresas?.nome ?? '—')}</span></td>
          <td data-label="Finalizada em" class="nowrap">${fmtDate(a.data_fim)}</td>
          <td data-label="Resultado" class="nowrap">${resultado}</td>
          <td data-label="Responsável">${escapeHtml(a.usuarios?.nome ?? '—')}</td>
          <td class="cel-acoes"><div class="acoes-linha"><a class="btn btn-secondary btn-sm" href="relatorios.html?id=${encodeURIComponent(a.id)}">Abrir relatório</a></div></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  };

  try {
    const [{ data, error }, emps] = await Promise.all([
      supabase.from('auditorias').select('id, numero_auditoria, data_fim, empresa_id, empresas(nome), usuarios!auditorias_criado_por_fkey(nome)')
        .eq('status', 'finalizada').order('data_fim', { ascending: false }).limit(200),
      listarEmpresas({ apenasAtivas: false }),
    ]);
    if (error) throw new Error(error.message);
    lista = data;
    const comRelatorio = new Set(lista.map(a => a.empresa_id));
    $('#relEmpresa').insertAdjacentHTML('beforeend', emps.filter(e => comRelatorio.has(e.id)).map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}</option>`).join(''));
    desenhar();

    if (lista.length) {
      const { data: itens, error: e2 } = await supabase.from('vw_relatorio_divergencias').select('auditoria_id, status_divergencia').in('auditoria_id', lista.map(a => a.id));
      if (e2) throw new Error(e2.message);
      for (const a of lista) resumo.set(a.id, { faltas: 0, sobras: 0 });
      for (const i of itens) {
        const r = resumo.get(i.auditoria_id); if (!r) continue;
        if (i.status_divergencia === 'falta') r.faltas++;
        if (i.status_divergencia === 'sobra') r.sobras++;
      }
      desenhar();
    }
  } catch (err) { console.error(err); card.innerHTML = erroCargaHtml("irPara('relatorios')"); }

  $('#relBusca').addEventListener('input', debounce(e => { busca = e.target.value; desenhar(); }, 200));
  $('#relEmpresa').addEventListener('change', e => { empresa = e.target.value; desenhar(); });
}
