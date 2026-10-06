// ================================================================
//  AudiStock — js/exportacao.js
//  Relatório da auditoria em PDF (jsPDF + AutoTable) e em Excel
//  (ExcelJS). As bibliotecas só são baixadas na hora de exportar.
//  O PDF segue o desenho da folha impressa (css/style.css, @media print),
//  com a mesma fonte da tela (IBM Plex Sans).
//
//  doc = { aud, resumo, itens, naoContados, filtroRotulo, emissor }
// ================================================================

import { carregarScript, casasDaUnidade, fmtDateTime, fmtInt } from './ui.js';
import { situacaoTexto } from './relatorios.js';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const STATUS = { em_andamento: 'Em andamento (parcial)', finalizada: 'Finalizada', cancelada: 'Cancelada' };

// Título do documento conforme a situação: sem fechamento não há divergência
export function tituloRelatorio(aud) {
  return aud.status === 'finalizada' ? 'Relatório de divergências'
    : aud.status === 'cancelada' ? 'Contagens registradas (auditoria cancelada)' : 'Relatório parcial da contagem';
}
// Há com o que comparar? Só na auditoria finalizada, com pelo menos um
// item com saldo do sistema. Em andamento ou cancelada, mesmo com saldos
// gravados (uma finalização que falhou no meio), sai só a contagem.
export const temComparacao = (resumo, aud) => (!aud || aud.status === 'finalizada') && resumo.auditados > 0 && resumo.sem_saldo < resumo.auditados;
// Por que não há divergência, quando não há
export const semDivergenciaMotivo = aud => aud.status === 'finalizada' ? 'nenhum saldo do sistema informado'
  : aud.status === 'cancelada' ? 'auditoria cancelada sem fechamento' : 'calculadas no fechamento';
// Término, ou o cancelamento
export const fimRotulo = aud => aud.status === 'cancelada' ? ['Cancelada em', aud.cancelado_em] : ['Término', aud.data_fim];

export function nomeArquivo(aud, ext) {
  const slug = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const d = new Date(aud.data_fim ?? aud.data_inicio ?? Date.now());
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${aud.numero_auditoria}_${slug(aud.empresas?.nome)}_${data}.${ext}`;
}

// Números como no resto do sistema: vírgula decimal e casas fixas nas unidades fracionadas.
function qtd(n, un) {
  if (n == null || n === '') return '—';
  const c = casasDaUnidade(un), inteiro = c === 0 && !Number.isInteger(Number(n));
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : c, maximumFractionDigits: inteiro ? 3 : c });
}
const comUn = (txt, un) => txt === '—' || !un ? txt : `${txt} ${String(un).toUpperCase()}`;
// Com a Helvetica (fonte padrão do PDF, só WinAnsi) o sinal é "-"; com a IBM Plex, "−", como na tela
function dif(n, un, menos = '-') {
  if (n == null) return '—';
  if (Number(n) === 0) return '0';
  return comUn((n > 0 ? '+' : menos) + qtd(Math.abs(n), un), un);
}

// IBM Plex Sans, a mesma fonte da tela, embutida no PDF (pasta fontes/,
// licença OFL). Baixada uma vez por sessão; se falhar, o PDF sai em Helvetica.
const FONTES = [['IBMPlexSans-Regular.ttf', 'normal'], ['IBMPlexSans-SemiBold.ttf', 'bold']];
let _fontes = null;
function _carregarFontes() {
  _fontes ??= Promise.all(FONTES.map(async ([arquivo, estilo]) => {
    const r = await fetch(new URL(`../fontes/${arquivo}`, import.meta.url));
    if (!r.ok) throw new Error(`${arquivo}: HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { arquivo, estilo, base64: btoa(bin) };
  })).catch(err => { console.warn('[pdf] IBM Plex indisponível; o PDF sai em Helvetica.', err); _fontes = null; return null; });
  return _fontes;
}

// ── PDF ─────────────────────────────────────────────────────
export async function gerarPDF(dados) {
  await carregarScript(`${CDN}/jspdf/2.5.1/jspdf.umd.min.js`, 'jspdf');
  await carregarScript(`${CDN}/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js`);
  const { jsPDF } = window.jspdf;
  // Se as assinaturas não couberem na última página, monta de novo levando
  // as últimas linhas da tabela junto: nunca uma folha só com as assinaturas.
  const fontes = await _carregarFontes();
  const doc = _montarPDF(jsPDF, dados, fontes, 0) ?? _montarPDF(jsPDF, dados, fontes, 3);
  doc.save(nomeArquivo(dados.aud, 'pdf'));
}

function _montarPDF(jsPDF, { aud, resumo, itens, naoContados = [], filtroRotulo, emissor }, fontes, segurar) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  fontes?.forEach(f => { doc.addFileToVFS(f.arquivo, f.base64); doc.addFont(f.arquivo, 'IBMPlexSans', f.estilo); });
  const FONTE = fontes ? 'IBMPlexSans' : 'helvetica', MENOS = fontes ? '−' : '-';
  const L = 14, R = 196, LARG = R - L, emitidoEm = fmtDateTime(new Date().toISOString());
  const TINTA = [28, 27, 25], CINZA = [100, 96, 88], LINHA = [214, 210, 202], ACENTO = [154, 52, 18];
  const VERDE = [21, 128, 61], VERMELHO = [185, 28, 28];
  const titulo = tituloRelatorio(aud), comparado = temComparacao(resumo, aud);
  const empresa = aud.empresas?.nome ?? '—';
  const caber = (txt, larg) => {          // uma linha, com reticências se não couber
    let s = String(txt);
    if (doc.getTextWidth(s) <= larg) return s;
    while (s.length > 1 && doc.getTextWidth(s + '…') > larg) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  };

  doc.setProperties({ title: `${titulo} ${aud.numero_auditoria}`, subject: empresa, creator: 'AudiStock', author: emissor ?? '' });

  // Cabeçalho: título e marca, linha fina embaixo (como na folha impressa)
  doc.setFont(FONTE, 'bold'); doc.setFontSize(15); doc.setTextColor(...TINTA);
  doc.text(caber(titulo, LARG - 30), L, 18);
  doc.setFontSize(10); doc.setTextColor(...ACENTO);
  doc.text('AudiStock', R, 18, { align: 'right' });
  doc.setDrawColor(153, 153, 153); doc.setLineWidth(0.3); doc.line(L, 21.5, R, 21.5);

  // Identificação: rótulo pequeno acima do valor, até 2 linhas por campo
  const campos = [
    ['Auditoria', aud.numero_auditoria], ['Empresa', empresa], ['Status da auditoria', STATUS[aud.status] ?? aud.status], ['Tipo de contagem', aud.auditoria_cega ? 'Cega' : 'Visível'],
    ['Início', fmtDateTime(aud.data_inicio)], [fimRotulo(aud)[0], fmtDateTime(fimRotulo(aud)[1])], ['Criada por', aud.usuarios?.nome ?? '—'], ['Itens listados', filtroRotulo],
    ['Emitido em', emitidoEm], ['Emitido por', emissor || '—'],
  ];
  const colW = LARG / 4;
  let yLinha = 28;
  for (let i = 0; i < campos.length; i += 4) {
    let altura = 1;
    campos.slice(i, i + 4).forEach(([rot, val], j) => {
      const x = L + j * colW;
      doc.setFont(FONTE, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text(rot, x, yLinha);
      doc.setFontSize(9.5); doc.setTextColor(...TINTA);
      let linhas = doc.splitTextToSize(String(val), colW - 4);
      if (linhas.length > 2) linhas = [linhas[0], caber(linhas.slice(1).join(' '), colW - 4)];
      doc.text(linhas, x, yLinha + 4.5);
      altura = Math.max(altura, linhas.length);
    });
    yLinha += 7 + altura * 4.2;
  }

  // Observações em linha inteira (até 8 linhas; o resto fica no sistema)
  let yR = yLinha - 1;
  if (aud.observacoes) {
    doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text('Observações', L, yR);
    doc.setFontSize(9.5); doc.setTextColor(...TINTA);
    let linhas = doc.splitTextToSize(String(aud.observacoes).replace(/\s+/g, ' '), LARG);
    if (linhas.length > 8) linhas = [...linhas.slice(0, 7), caber(linhas.slice(7).join(' '), LARG)];
    doc.text(linhas, L, yR + 4.5);
    yR += 4.5 + linhas.length * 4.2 + 3;
  }

  // Resumo em uma faixa, entre duas linhas
  const zeroNeutro = (n, cor) => (n ? cor : CINZA);
  const celulas = comparado ? [
    ['Itens contados', `${fmtInt(resumo.auditados)} de ${fmtInt(resumo.total_produtos)}`, TINTA],
    ['Sem divergência', fmtInt(resumo.ok), TINTA],
    ['Itens com falta', fmtInt(resumo.faltas), zeroNeutro(resumo.faltas, VERMELHO)],
    ['Itens com sobra', fmtInt(resumo.sobras), zeroNeutro(resumo.sobras, VERDE)],
    ...(resumo.sem_saldo ? [['Sem saldo do sistema', fmtInt(resumo.sem_saldo), TINTA]] : []),
    ['Não contados', fmtInt(resumo.nao_auditados), TINTA],
  ] : [
    ['Itens contados', `${fmtInt(resumo.auditados)} de ${fmtInt(resumo.total_produtos)}`, TINTA],
    ['Não contados', fmtInt(resumo.nao_auditados), TINTA],
    ['Divergências', semDivergenciaMotivo(aud), CINZA],
  ];
  const cw = LARG / celulas.length;
  doc.setDrawColor(153, 153, 153); doc.setLineWidth(0.3);
  doc.line(L, yR, R, yR); doc.line(L, yR + 14, R, yR + 14);
  celulas.forEach(([rot, val, cor], i) => {
    const x = L + i * cw + (i ? 3 : 0);
    doc.setFont(FONTE, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text(caber(rot, cw - 4), x, yR + 5);
    doc.setFont(FONTE, 'bold'); doc.setFontSize(val.length > 12 ? 9 : 11.5); doc.setTextColor(...cor); doc.text(caber(val, cw - 4), x, yR + 11);
  });
  doc.setFont(FONTE, 'normal');

  // Tabelas
  const estilo = {
    theme: 'plain',
    margin: { left: L, right: 210 - R, bottom: 18, top: 16 },
    styles: { font: FONTE, fontSize: 8.5, textColor: TINTA, cellPadding: { top: 1.7, bottom: 1.7, left: 1.5, right: 1.5 }, lineColor: [221, 221, 221], lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: [236, 235, 231], textColor: [34, 34, 34], fontStyle: 'normal', fontSize: 8, lineColor: [153, 153, 153], lineWidth: { bottom: 0.3 } },
  };
  const tabelas = [];
  if (comparado) {
    tabelas.push({
      head: ['Código', 'Produto', 'Sistema', 'Contado', 'Diferença', 'Situação'],
      linhas: itens.map(r => ({ dif: r.diferenca, cel: [r.codigo_produto, r.nome_produto, comUn(qtd(r.estoque_sistema, r.unidade_medida), r.unidade_medida), comUn(qtd(r.quantidade_contada, r.unidade_medida), r.unidade_medida), dif(r.diferenca, r.unidade_medida, MENOS), situacaoTexto(r.diferenca)] })),
      colunas: { 0: { cellWidth: 22, textColor: CINZA }, 2: { halign: 'right', cellWidth: 24 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 24 }, 5: { cellWidth: 19 } },
      direita: [2, 3, 4], colorir: [4, 5],
    });
  } else {
    tabelas.push({
      head: ['Código', 'Produto', 'Contado'],
      linhas: itens.map(r => ({ cel: [r.codigo_produto, r.nome_produto, comUn(qtd(r.quantidade_contada, r.unidade_medida), r.unidade_medida)] })),
      colunas: { 0: { cellWidth: 22, textColor: CINZA }, 2: { halign: 'right', cellWidth: 28 } },
      direita: [2], colorir: [],
    });
  }
  if (naoContados.length) {
    tabelas.push({
      titulo: `Produtos não contados (${fmtInt(naoContados.length)})`,
      head: ['Código', 'Produto', 'Unidade'],
      linhas: naoContados.map(p => ({ cel: [p.codigo_produto, p.nome_produto, String(p.unidade_medida ?? '—').toUpperCase()] })),
      colunas: { 0: { cellWidth: 22, textColor: CINZA }, 2: { cellWidth: 20 } },
      direita: [], colorir: [],
    });
  }

  const desenhar = (t, linhas, startY) => {
    if (!linhas.length) return;
    doc.autoTable({
      ...estilo, startY,
      head: [t.head], body: linhas.map(l => l.cel), columnStyles: t.colunas,
      didParseCell: d => {
        if (d.section === 'head' && t.direita.includes(d.column.index)) d.cell.styles.halign = 'right';
        if (d.section !== 'body' || !t.colorir.includes(d.column.index)) return;
        const v = linhas[d.row.index].dif;
        d.cell.styles.textColor = v > 0 ? VERDE : v < 0 ? VERMELHO : CINZA;
        if (v > 0 || v < 0) d.cell.styles.fontStyle = 'bold';
      },
    });
  };

  let y = yR + 20;
  if (!itens.length) {
    doc.setFontSize(9.5); doc.setTextColor(...CINZA); doc.text('Nenhum item contado nesta auditoria.', L, y + 2);
    y += 4;
  }
  tabelas.forEach((t, k) => {
    const ultima = k === tabelas.length - 1;
    const corte = ultima && segurar ? Math.max(0, t.linhas.length - segurar) : t.linhas.length;
    if (!t.linhas.length) return;
    if (t.titulo) {
      y += 10;
      if (y > 250 || corte === 0) { doc.addPage(); y = 20; }
      doc.setFont(FONTE, 'bold'); doc.setFontSize(10); doc.setTextColor(...TINTA);
      doc.text(t.titulo, L, y);
      doc.setFont(FONTE, 'normal');
      y += 3;
    } else if (corte === 0 && segurar) { doc.addPage(); y = 20; }
    desenhar(t, t.linhas.slice(0, corte), y);
    if (corte > 0 && corte < t.linhas.length) { doc.addPage(); desenhar(t, t.linhas.slice(corte), 20); }
    else if (corte === 0) desenhar(t, t.linhas, y);
    y = doc.lastAutoTable?.finalY ?? y;
  });

  // Assinaturas na última página, acima do rodapé
  let yA = y + 20;
  if (yA > 272) {
    if (!segurar) return null;
    doc.addPage(); yA = 40;
  }
  doc.setDrawColor(...CINZA); doc.setLineWidth(0.25);
  [[L, 'Auditor responsável'], [L + 98, 'Conferência / gestor']].forEach(([x, rot]) => {
    doc.line(x, yA, x + 84, yA);
    doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text(rot, x, yA + 4.5);
  });

  // Rodapé em todas as páginas
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.2); doc.line(L, 285, R, 285);
    doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text(caber(`AudiStock  ·  ${aud.numero_auditoria}  ·  ${empresa}  ·  emitido em ${emitidoEm}`, LARG - 30), L, 289.5);
    doc.text(`Página ${i} de ${n}`, R, 289.5, { align: 'right' });
  }
  return doc;
}

// ── Excel ───────────────────────────────────────────────────
// O ExcelJS grava datas pelo horário UTC: desloca para o horário local,
// para a planilha mostrar a mesma hora da tela e do PDF.
const dataLocal = iso => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000); };

export async function gerarExcel({ aud, resumo, itens, naoContados, filtroRotulo, emissor }) {
  const ExcelJS = await carregarScript(`${CDN}/exceljs/4.4.0/exceljs.min.js`, 'ExcelJS');
  const wb = new ExcelJS.Workbook();
  const titulo = tituloRelatorio(aud), comparado = temComparacao(resumo, aud);
  wb.creator = emissor || 'AudiStock'; wb.created = new Date();
  wb.title = `${titulo} ${aud.numero_auditoria}`;

  const CAB = { font: { color: { argb: 'FF222222' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEBE7' } }, border: { bottom: { style: 'thin', color: { argb: 'FF999999' } } } };
  const borda = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } };
  const formato = un => casasDaUnidade(un) ? '#,##0.000' : '#,##0';
  const formatoDif = un => casasDaUnidade(un) ? '+#,##0.000;-#,##0.000;0.000' : '+#,##0;-#,##0;0';

  // Aba Resumo
  const rs = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  rs.columns = [{ width: 26 }, { width: 56 }];
  rs.getCell('A1').value = titulo;
  rs.getCell('A1').font = { bold: true, size: 15 };
  rs.getCell('A2').value = `${aud.numero_auditoria} · ${aud.empresas?.nome ?? ''}`;
  rs.getCell('A2').font = { color: { argb: 'FF645F58' } };
  const linhasResumo = [
    ['Auditoria', aud.numero_auditoria], ['Empresa', aud.empresas?.nome ?? '—'], ['Status da auditoria', STATUS[aud.status] ?? aud.status],
    ['Início', aud.data_inicio ? dataLocal(aud.data_inicio) : '—'], [fimRotulo(aud)[0], fimRotulo(aud)[1] ? dataLocal(fimRotulo(aud)[1]) : '—'],
    ['Tipo de contagem', aud.auditoria_cega ? 'Cega' : 'Visível'], ['Criada por', aud.usuarios?.nome ?? '—'],
    ['Itens listados', filtroRotulo], ['Emitido em', dataLocal(new Date().toISOString())], ['Emitido por', emissor || '—'],
    ...(aud.observacoes ? [['Observações', aud.observacoes]] : []),
    null,
    ['Produtos da empresa', resumo.total_produtos], ['Itens contados', resumo.auditados], ['Não contados', resumo.nao_auditados],
    ...(comparado ? [
      ['Sem divergência', resumo.ok], ['Itens com falta', resumo.faltas], ['Itens com sobra', resumo.sobras],
      ...(resumo.sem_saldo ? [['Sem saldo do sistema', resumo.sem_saldo]] : []),
      // Arredondado para baixo, como na tela: 299 de 300 é 99,6%, nunca 100% ao lado de uma falta
      ['Acerto da contagem', (resumo.auditados - resumo.sem_saldo) ? Math.floor(resumo.ok / (resumo.auditados - resumo.sem_saldo) * 1000) / 1000 : 0],
    ] : [['Divergências', semDivergenciaMotivo(aud).replace(/^./, c => c.toUpperCase())]]),
  ];
  linhasResumo.forEach((l, i) => {
    if (!l) return;
    const row = rs.getRow(4 + i);
    row.getCell(1).value = l[0]; row.getCell(1).font = { color: { argb: 'FF645F58' } };
    row.getCell(1).alignment = { vertical: 'top' };
    const c = row.getCell(2); c.value = l[1];
    if (l[1] instanceof Date) c.numFmt = 'dd/mm/yyyy hh:mm';
    if (l[0] === 'Acerto da contagem') c.numFmt = '0.0%';
    c.alignment = { horizontal: 'left', vertical: 'top', wrapText: l[0] === 'Observações' };
    if (l[0] === 'Itens com falta' && l[1]) c.font = { bold: true, color: { argb: 'FFB91C1C' } };
    if (l[0] === 'Itens com sobra' && l[1]) c.font = { bold: true, color: { argb: 'FF15803D' } };
  });

  // Aba Itens: números de verdade, diferença e situação por fórmula
  const ws = wb.addWorksheet('Itens', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ws.columns = [
    { header: 'Código', key: 'cod', width: 13 }, { header: 'Produto', key: 'nome', width: 44 }, { header: 'Unidade', key: 'un', width: 9 },
    ...(comparado ? [{ header: 'Sistema', key: 'sis', width: 13 }] : []), { header: 'Contado', key: 'cont', width: 13 },
    ...(comparado ? [{ header: 'Diferença', key: 'dif', width: 13 }, { header: 'Diferença %', key: 'pct', width: 12 }, { header: 'Situação', key: 'sit', width: 12 }] : []),
  ];
  itens.forEach((r, i) => {
    const n = i + 2, temSaldo = r.estoque_sistema != null;
    const row = ws.addRow({
      cod: r.codigo_produto, nome: r.nome_produto, un: r.unidade_medida ?? '', cont: Number(r.quantidade_contada),
      ...(comparado ? {
        sis: temSaldo ? Number(r.estoque_sistema) : null,
        dif: temSaldo ? { formula: `E${n}-D${n}`, result: Number(r.diferenca) } : null,
        pct: temSaldo && Number(r.estoque_sistema) ? { formula: `IF(D${n}=0,"",F${n}/D${n})`, result: Number(r.diferenca) / Number(r.estoque_sistema) } : null,
        sit: temSaldo ? { formula: `IF(F${n}>0,"Sobra",IF(F${n}<0,"Falta","OK"))`, result: situacaoTexto(r.diferenca) } : 'Sem saldo',
      } : {}),
    });
    row.getCell('cont').numFmt = formato(r.unidade_medida);
    if (comparado) {
      row.getCell('sis').numFmt = formato(r.unidade_medida);
      row.getCell('dif').numFmt = formatoDif(r.unidade_medida);
      row.getCell('pct').numFmt = '+0.0%;-0.0%;0.0%';
    }
    row.getCell('un').alignment = { horizontal: 'center' };
    row.eachCell({ includeEmpty: true }, c => { c.border = borda; });
  });
  const ultimaCol = comparado ? 'H' : 'D';
  _cabecalho(ws, CAB, comparado ? [4, 5, 6, 7] : [4], [3]);
  ws.autoFilter = { from: 'A1', to: `${ultimaCol}${itens.length + 1}` };
  if (itens.length && comparado) {
    ws.addConditionalFormatting({ ref: `F2:H${itens.length + 1}`, rules: [
      { type: 'expression', formulae: ['$F2>0'], style: { font: { color: { argb: 'FF15803D' }, bold: true } } },
      { type: 'expression', formulae: ['$F2<0'], style: { font: { color: { argb: 'FFB91C1C' }, bold: true } } },
    ] });
  }
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  // No rodapé do Excel "&" é código de controle: o "&" do texto vira "&&"
  ws.headerFooter.oddFooter = `&L${`${aud.numero_auditoria} · ${aud.empresas?.nome ?? ''}`.replace(/&/g, '&&')}&RPágina &P de &N`;

  // Aba Não contados
  if (naoContados?.length) {
    const nc = wb.addWorksheet('Não contados', { views: [{ state: 'frozen', ySplit: 1 }] });
    nc.columns = [{ header: 'Código', width: 13 }, { header: 'Produto', width: 44 }, { header: 'Unidade', width: 9 }];
    naoContados.forEach(p => {
      const row = nc.addRow([p.codigo_produto, p.nome_produto, p.unidade_medida ?? '']);
      row.getCell(3).alignment = { horizontal: 'center' };
      row.eachCell(c => { c.border = borda; });
    });
    _cabecalho(nc, CAB, [], [3]);
    nc.autoFilter = { from: 'A1', to: `C${naoContados.length + 1}` };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function _cabecalho(ws, estilo, colsDireita, colsCentro = []) {
  const cab = ws.getRow(1);
  cab.height = 22;
  cab.eachCell((c, i) => {
    Object.assign(c, { font: estilo.font, fill: estilo.fill, border: estilo.border });
    c.alignment = { vertical: 'middle', horizontal: colsDireita.includes(i) ? 'right' : colsCentro.includes(i) ? 'center' : 'left' };
  });
}
