// ================================================================
//  AudiStock — js/telas/dashboard.js
//  Indicadores, auditorias em andamento com progresso e o resultado
//  da última auditoria finalizada. Numa base vazia, os primeiros passos.
// ================================================================

import supabase from '../supabaseClient.js';
import { hasRole } from '../auth.js';
import { progresso } from '../auditorias.js';
import { escapeHtml, fmtDate, fmtInt, difHtml, vazioHtml, erroCargaHtml } from '../ui.js';

const contar = q => q.then(({ count, error }) => { if (error) throw new Error(error.message); return count ?? 0; });

export async function render(el) {
  el.innerHTML = `<div class="kpis" aria-busy="true">${'<div class="kpi"><span class="skel" style="width:60%"></span><span class="skel" style="width:35%;height:22px"></span></div>'.repeat(4)}</div>`;

  const [empresas, produtos, emAndamento, finalizadas] = await Promise.all([
    contar(supabase.from('empresas').select('id', { count: 'exact', head: true }).eq('ativo', true)),
    contar(supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true)),
    contar(supabase.from('auditorias').select('id', { count: 'exact', head: true }).eq('status', 'em_andamento')),
    contar(supabase.from('auditorias').select('id', { count: 'exact', head: true }).eq('status', 'finalizada')),
  ]);

  if (empresas === 0) { el.innerHTML = _primeirosPassos(); return; }

  el.innerHTML = `
    <div class="kpis">
      <div class="kpi kpi-destaque"><div class="kpi-rotulo">Em andamento</div><div class="kpi-valor">${fmtInt(emAndamento)}</div><div class="kpi-apoio">${emAndamento === 1 ? 'auditoria sendo contada' : 'auditorias sendo contadas'}</div></div>
      <div class="kpi"><div class="kpi-rotulo">Finalizadas</div><div class="kpi-valor">${fmtInt(finalizadas)}</div><div class="kpi-apoio" id="kpiUltima">&nbsp;</div></div>
      <div class="kpi"><div class="kpi-rotulo">Empresas ativas</div><div class="kpi-valor">${fmtInt(empresas)}</div></div>
      <div class="kpi"><div class="kpi-rotulo">Produtos ativos</div><div class="kpi-valor">${fmtInt(produtos)}</div></div>
    </div>
    <div class="duas-colunas">
      <section class="card" aria-labelledby="tAndamento">
        <div class="card-header"><h2 class="card-title" id="tAndamento">Em andamento</h2><a class="btn btn-ghost btn-sm" href="app.html?tela=auditorias">Ver todas</a></div>
        <div id="dAndamento"><div class="carregando-bloco"><span class="skel"></span><span class="skel" style="width:70%"></span></div></div>
      </section>
      <section class="card" aria-labelledby="tUltima">
        <div class="card-header"><div><h2 class="card-title" id="tUltima">Última auditoria finalizada</h2><div class="card-sub" id="sUltima"></div></div><span id="aUltima"></span></div>
        <div class="card-body" id="dUltima"><span class="skel"></span><span class="skel" style="width:70%"></span></div>
      </section>
    </div>
    <div class="duas-colunas" id="dTops"></div>`;

  const $ = s => el.querySelector(s);
  await Promise.all([
    _andamento($('#dAndamento')).catch(() => { $('#dAndamento').innerHTML = erroCargaHtml("irPara('dashboard')"); }),
    _ultima(el).catch(() => { $('#dUltima').innerHTML = erroCargaHtml("irPara('dashboard')"); }),
  ]);
}

async function _andamento(alvo) {
  const { data, error } = await supabase.from('auditorias')
    .select('id, numero_auditoria, data_inicio, auditoria_cega, empresas(nome)')
    .eq('status', 'em_andamento').order('data_inicio', { ascending: false }).limit(5);
  if (error) throw new Error(error.message);
  if (!data.length) {
    alvo.innerHTML = vazioHtml({
      titulo: 'Nenhuma auditoria em andamento',
      texto: 'Quando uma contagem começar, o progresso aparece aqui.',
      acoes: hasRole('administrador') ? '<a class="btn btn-secondary btn-sm" href="app.html?tela=auditorias&nova=1">Nova auditoria</a>' : '',
      compacto: true,
    });
    return;
  }
  const prog = await Promise.all(data.map(a => progresso(a.id).catch(() => null)));
  alvo.innerHTML = `<ul class="lista-andamento">${data.map((a, i) => {
    const p = prog[i];
    return `<li><a class="andamento" href="contagem.html?id=${encodeURIComponent(a.id)}">
      <span><span class="forte">${escapeHtml(a.empresas?.nome ?? '—')}</span>
        <span class="sub"><span class="codigo">${escapeHtml(a.numero_auditoria)}</span> · desde ${fmtDate(a.data_inicio)} · ${a.auditoria_cega ? 'cega' : 'visível'}</span></span>
      <span class="andamento-pct">${p ? `${fmtInt(p.contados)} de ${fmtInt(p.totalProdutos)} · <strong>${p.pct}%</strong>` : ''}</span>
      <span class="barra" role="progressbar" aria-valuenow="${p?.pct ?? 0}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso da contagem"><i style="width:${p?.pct ?? 0}%"></i></span>
    </a></li>`;
  }).join('')}</ul>`;
}

async function _ultima(el) {
  const $ = s => el.querySelector(s);
  const { data: aud, error } = await supabase.from('auditorias')
    .select('id, numero_auditoria, data_fim, empresas(nome)')
    .eq('status', 'finalizada').order('data_fim', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!aud) {
    $('#dUltima').innerHTML = vazioHtml({ titulo: 'Nenhuma auditoria finalizada ainda', texto: 'O resultado da contagem (sobras, faltas e itens sem divergência) aparece aqui depois do primeiro fechamento.', compacto: true });
    $('#dTops').remove();
    return;
  }
  $('#kpiUltima').textContent = `última em ${fmtDate(aud.data_fim)}`;
  $('#sUltima').innerHTML = `<span class="codigo">${escapeHtml(aud.numero_auditoria)}</span> · ${escapeHtml(aud.empresas?.nome ?? '')} · ${fmtDate(aud.data_fim)}`;
  $('#aUltima').innerHTML = `<a class="btn btn-ghost btn-sm" href="relatorios.html?id=${encodeURIComponent(aud.id)}">Ver relatório</a>`;

  const { data: itens, error: e2 } = await supabase.from('vw_relatorio_divergencias')
    .select('codigo_produto, nome_produto, unidade_medida, diferenca, status_divergencia').eq('auditoria_id', aud.id);
  if (e2) throw new Error(e2.message);

  const sobras = itens.filter(i => i.status_divergencia === 'sobra');
  const faltas = itens.filter(i => i.status_divergencia === 'falta');
  const ok = itens.length - sobras.length - faltas.length;
  const [pS, pF, pO] = _porcentagens([sobras.length, faltas.length, ok]);

  $('#dUltima').innerHTML = `
    <div class="barra-empilhada" role="img" aria-label="${sobras.length} sobras, ${faltas.length} faltas e ${ok} itens sem divergência">
      ${faltas.length ? `<i class="seg-falta" style="width:${pF}%"></i>` : ''}${sobras.length ? `<i class="seg-sobra" style="width:${pS}%"></i>` : ''}${ok ? `<i class="seg-ok" style="width:${pO}%"></i>` : ''}
    </div>
    <div class="legenda">
      <div class="legenda-item"><span class="ponto seg-falta"></span><span class="nome">Itens com falta</span><span class="valor">${fmtInt(faltas.length)}</span><span class="pct">${pF}%</span></div>
      <div class="legenda-item"><span class="ponto seg-sobra"></span><span class="nome">Itens com sobra</span><span class="valor">${fmtInt(sobras.length)}</span><span class="pct">${pS}%</span></div>
      <div class="legenda-item"><span class="ponto seg-ok"></span><span class="nome">Sem divergência</span><span class="valor">${fmtInt(ok)}</span><span class="pct">${pO}%</span></div>
    </div>`;

  const porMagnitude = (a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca);
  $('#dTops').innerHTML = _top('Maiores faltas', faltas.sort(porMagnitude).slice(0, 5), 'Nenhuma falta nesta auditoria.', aud)
                        + _top('Maiores sobras', sobras.sort(porMagnitude).slice(0, 5), 'Nenhuma sobra nesta auditoria.', aud);
}

function _top(titulo, lista, vazio, aud) {
  const corpo = !lista.length ? vazioHtml({ titulo: vazio, compacto: true }) : `
    <div class="tabela-wrap"><table>
      <thead><tr><th scope="col">Produto</th><th scope="col" class="num">Diferença</th></tr></thead>
      <tbody>${lista.map(r => `<tr>
        <td><span class="forte">${escapeHtml(r.nome_produto)}</span><span class="sub codigo">${escapeHtml(r.codigo_produto)}</span></td>
        <td class="num">${difHtml(r.diferenca, r.unidade_medida)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  return `<section class="card"><div class="card-header"><div><h2 class="card-title">${titulo}</h2><div class="card-sub">${escapeHtml(aud.numero_auditoria)}</div></div></div>${corpo}</section>`;
}

// Arredonda mantendo a soma em 100 (método do maior resto)
function _porcentagens(valores) {
  const total = valores.reduce((s, v) => s + v, 0) || 1;
  const brutos = valores.map(v => v * 100 / total);
  const base = brutos.map(Math.floor);
  let falta = 100 - base.reduce((s, v) => s + v, 0);
  brutos.map((v, i) => [v - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta-- > 0 && valores[i]) base[i]++; });
  return valores.every(v => !v) ? [0, 0, 0] : base;
}

function _primeirosPassos() {
  const admin = hasRole('administrador');
  return `<section class="comecar">
    <h2>Primeiros passos</h2>
    <p>${admin ? 'O AudiStock compara o estoque contado no chão com o saldo do sistema. Para a primeira auditoria:' : 'Ainda não há empresas cadastradas. Peça a um administrador para concluir a configuração inicial.'}</p>
    ${admin ? `<ol class="passos">
      <li><strong>Cadastre uma empresa</strong><span>Cada empresa tem seus próprios produtos e auditorias.</span></li>
      <li><strong>Importe os produtos</strong><span>Uma planilha com código, nome, unidade e código de barras.</span></li>
      <li><strong>Inicie a auditoria</strong><span>A equipe conta pelo celular, com leitor ou pela câmera.</span></li>
    </ol>
    <div class="vazio-acoes" style="justify-content:flex-start"><a class="btn btn-primary" href="app.html?tela=empresas&nova=1">Cadastrar empresa</a></div>` : ''}
  </section>`;
}
