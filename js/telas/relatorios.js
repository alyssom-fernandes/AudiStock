// ================================================================
//  AudiStock — js/telas/relatorios.js
//  Auditorias finalizadas, cada uma com o resumo das divergências.
// ================================================================

import supabase from '../supabaseClient.js';
import { listarEmpresas } from '../empresas.js';
import { buscarTodos } from '../consulta.js';
import { escapeHtml, fmtDate, fmtInt, plural, vazioHtml, erroCargaHtml, normalizar, debounce, ICONS, partesHtml } from '../ui.js';

const LIMITE = 200;

export async function render(el) {
  let lista = [], total = 0, filtrarNoServidor = false, resumo = new Map(), busca = '', empresa = '';

  el.innerHTML = `
    <div class="toolbar">
      <label class="campo-busca">${ICONS.busca}<span class="sr-only">Buscar relatório</span>
        <input class="form-input" type="search" id="relBusca" placeholder="Número ou empresa" autocomplete="off"/></label>
      <label class="sr-only" for="relEmpresa">Empresa</label>
      <select class="form-input campo-empresa" id="relEmpresa"><option value="">Todas as empresas</option></select>
    </div>
    <div class="card" id="relCard"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>`;
  const $ = s => el.querySelector(s);
  const card = $('#relCard');

  // Um único elemento na célula: no celular o rótulo fica à esquerda e o resultado junto, à direita
  const resultadoHtml = r => {
    if (!r) return '<span class="muted">…</span>';
    if (!r.itens) return '<span class="muted">Nenhum item contado</span>';
    if (r.semSaldo === r.itens) return '<span class="muted">Sem saldo do sistema</span>';
    const partes = [
      r.faltas ? `<span class="dif-falta">${plural(r.faltas, 'falta', 'faltas')}</span>` : '',
      r.sobras ? `<span class="dif-sobra">${plural(r.sobras, 'sobra', 'sobras')}</span>` : '',
    ].filter(Boolean);
    if (!partes.length) partes.push('<span class="dif-zero">Sem divergências</span>');
    if (r.semSaldo) partes.push(`<span class="muted">${fmtInt(r.semSaldo)} sem saldo</span>`);
    return `<span class="resultado">${partes.join('<span class="sep" aria-hidden="true">·</span>')}</span>`;
  };

  const desenhar = () => {
    const t = normalizar(busca);
    const visiveis = lista.filter(a => (!empresa || a.empresa_id === empresa)
      && (!t || normalizar(a.numero_auditoria).includes(t) || normalizar(a.empresas?.nome).includes(t)));
    // Sem relatório nenhum, nada para buscar ou filtrar; com uma empresa
    // filtrada sem relatório, o filtro continua à vista para voltar atrás
    $('.toolbar').hidden = !lista.length && !empresa;
    if (!lista.length && !empresa) {
      card.innerHTML = vazioHtml({ titulo: 'Nenhum relatório ainda', texto: 'O relatório de divergências aparece aqui quando uma auditoria é finalizada.', acoes: '<a class="btn btn-secondary" href="app.html?tela=auditorias">Ir para Auditorias</a>' });
      return;
    }
    if (!visiveis.length) {
      card.innerHTML = vazioHtml({ titulo: t ? `Nada encontrado para “${busca.trim()}”` : 'Nenhum relatório desta empresa', acoes: '<button type="button" class="btn btn-secondary btn-sm" id="relLimpar">Limpar filtros</button>', compacto: true });
      $('#relLimpar').onclick = () => {
        busca = ''; $('#relBusca').value = '';
        if (empresa) { $('#relEmpresa').value = ''; $('#relEmpresa').dispatchEvent(new Event('change')); }   // pode precisar buscar de novo no servidor
        else desenhar();
      };
      return;
    }
    // No celular a linha inteira abre o relatório (mesmo formato da lista de Auditorias)
    card.innerHTML = `<div class="tabela-wrap"><table class="tabela-lista">
      <thead><tr><th scope="col">Auditoria</th><th scope="col">Empresa</th><th scope="col">Finalizada em</th><th scope="col">Resultado</th><th scope="col" class="col-larga">Criada por</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${visiveis.map(a => `<tr>
          <td class="l-titulo"><a class="linha-link cobre codigo forte" href="relatorios.html?id=${encodeURIComponent(a.id)}">${escapeHtml(a.numero_auditoria)}</a>
            <span class="sub so-celular-bloco">${partesHtml([`<span class="forte">${escapeHtml(a.empresas?.nome ?? '—')}</span>`, fmtDate(a.data_fim)])}</span></td>
          <td class="so-desktop"><span class="forte">${escapeHtml(a.empresas?.nome ?? '—')}</span></td>
          <td class="so-desktop nowrap">${fmtDate(a.data_fim)}</td>
          <td>${resultadoHtml(resumo.get(a.id))}</td>
          <td class="so-desktop col-larga">${escapeHtml(a.usuarios?.nome ?? '—')}</td>
          <td class="so-desktop"><div class="acoes-linha"><a class="btn btn-secondary btn-sm" href="relatorios.html?id=${encodeURIComponent(a.id)}" tabindex="-1">Abrir relatório</a></div></td>
        </tr>`).join('')}</tbody>
    </table></div>
    ${total > lista.length ? `<div class="tabela-rodape"><span>Os ${fmtInt(LIMITE)} relatórios mais recentes de ${fmtInt(total)}.${empresa ? '' : ' Filtre por empresa para ver os anteriores.'}</span></div>` : ''}`;
  };

  const carregar = async () => {
    let q = supabase.from('auditorias').select('id, numero_auditoria, data_fim, empresa_id, empresas(nome), usuarios!auditorias_criado_por_fkey(nome)', { count: 'exact' })
      .eq('status', 'finalizada').order('data_fim', { ascending: false }).limit(LIMITE);
    if (empresa) q = q.eq('empresa_id', empresa);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    lista = data; total = count ?? data.length;
    desenhar();
    if (!lista.length) return;

    // Resumo de cada auditoria, em lotes (URL curta) e paginado (limite de 1.000 linhas)
    const ids = lista.map(a => a.id).filter(id => !resumo.has(id));
    const itens = [];
    for (let i = 0; i < ids.length; i += 40) {
      const lote = ids.slice(i, i + 40);
      itens.push(...await buscarTodos(() => supabase.from('vw_relatorio_divergencias').select('auditoria_id, diferenca, status_divergencia')
        .in('auditoria_id', lote).order('auditoria_id').order('codigo_produto')));
    }
    for (const id of ids) resumo.set(id, { itens: 0, faltas: 0, sobras: 0, semSaldo: 0 });
    for (const i of itens) {
      const r = resumo.get(i.auditoria_id); if (!r) continue;
      r.itens++;
      if (i.diferenca == null) r.semSaldo++;
      else if (i.status_divergencia === 'falta') r.faltas++;
      else if (i.status_divergencia === 'sobra') r.sobras++;
    }
    desenhar();
  };

  try {
    const [emps] = await Promise.all([listarEmpresas({ apenasAtivas: false }), carregar()]);
    const comRelatorio = new Set(lista.map(a => a.empresa_id));
    const opcoes = total > lista.length ? emps : emps.filter(e => comRelatorio.has(e.id));
    filtrarNoServidor = total > lista.length;
    $('#relEmpresa').insertAdjacentHTML('beforeend', opcoes.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}</option>`).join(''));
  } catch (err) { card.innerHTML = erroCargaHtml("irPara('relatorios')"); window.__registrarErro?.('tratado', `relatórios: ${err.message}`, err.stack ?? ''); return; }

  $('#relBusca').addEventListener('input', debounce(e => { busca = e.target.value; desenhar(); }, 200));
  $('#relEmpresa').addEventListener('change', async e => {
    empresa = e.target.value;
    // Com mais relatórios que o limite, a empresa é filtrada no servidor
    if (filtrarNoServidor) {
      try { await carregar(); } catch (err) { card.innerHTML = erroCargaHtml("irPara('relatorios')"); }
    } else desenhar();
  });
}
