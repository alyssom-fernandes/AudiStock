// ================================================================
//  AudiStock — js/exportacao.js
//  Relatório de divergências em PDF (jsPDF + AutoTable) e em Excel
//  (ExcelJS). As bibliotecas só são baixadas na hora de exportar.
//
//  doc = { aud, resumo, itens, naoContados, filtroRotulo, emissor }
// ================================================================

import { carregarScript, casasDaUnidade, fmtDateTime, fmtInt } from './ui.js';
import { situacaoTexto } from './relatorios.js';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';

export function nomeArquivo(aud, ext) {
  const slug = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${aud.numero_auditoria}_${slug(aud.empresas?.nome)}.${ext}`;
}

// Números como no resto do sistema: vírgula decimal e casas fixas nas unidades fracionadas.
// Só caracteres do WinAnsi (fontes padrão do PDF): sinal "-" comum, nunca "−".
function qtd(n, un) {
  if (n == null || n === '') return '—';
  const c = casasDaUnidade(un), inteiro = c === 0 && !Number.isInteger(Number(n));
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : c, maximumFractionDigits: inteiro ? 3 : c });
}
function dif(n, un) {
  if (n == null) return '—';
  if (Number(n) === 0) return '0';
  return (n > 0 ? '+' : '-') + qtd(Math.abs(n), un);
}

// ── PDF ─────────────────────────────────────────────────────
export async function gerarPDF({ aud, resumo, itens, filtroRotulo, emissor }) {
  await carregarScript(`${CDN}/jspdf/2.5.1/jspdf.umd.min.js`, 'jspdf');
  await carregarScript(`${CDN}/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js`);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = 14, R = 196, emitidoEm = fmtDateTime(new Date().toISOString());
  const TINTA = [28, 27, 25], CINZA = [100, 96, 88], LINHA = [222, 219, 212], ACENTO = [154, 52, 18];
  const VERDE = [21, 101, 52], VERMELHO = [185, 28, 28];

  doc.setProperties({ title: `Relatório de divergências ${aud.numero_auditoria}`, subject: aud.empresas?.nome ?? '', creator: 'AudiStock', author: emissor ?? '' });

  // Cabeçalho
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...TINTA);
  doc.text('Relatório de divergências', L, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...CINZA);
  doc.text(`${aud.numero_auditoria}  ·  ${aud.empresas?.nome ?? ''}`, L, 24.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ACENTO);
  doc.text('AudiStock', R, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA);
  doc.text(`Emitido em ${emitidoEm}`, R, 22, { align: 'right' });
  if (emissor) doc.text(`por ${emissor}`, R, 26, { align: 'right' });
  doc.setDrawColor(...LINHA); doc.setLineWidth(0.3); doc.line(L, 30, R, 30);

  // Identificação: rótulo pequeno acima do valor
  const campos = [
    ['Empresa', aud.empresas?.nome ?? '—'], ['Início', fmtDateTime(aud.data_inicio)], ['Término', fmtDateTime(aud.data_fim)], ['Tipo de contagem', aud.auditoria_cega ? 'Cega' : 'Visível'],
    ['Responsável', aud.usuarios?.nome ?? '—'], ['Situação', { em_andamento: 'Em andamento (parcial)', finalizada: 'Finalizada', cancelada: 'Cancelada' }[aud.status] ?? aud.status], ['Itens listados', filtroRotulo], ['Produtos na empresa', fmtInt(resumo.total_produtos)],
  ];
  const colW = (R - L) / 4;
  campos.forEach(([rot, val], i) => {
    const x = L + (i % 4) * colW, y = 37 + Math.floor(i / 4) * 11;
    doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text(rot, x, y);
    doc.setFontSize(9.5); doc.setTextColor(...TINTA); doc.text(doc.splitTextToSize(String(val), colW - 3)[0], x, y + 4.5);
  });

  // Observações em linha inteira, quebrando o texto (nada cortado)
  let yR = 62;
  if (aud.observacoes) {
    doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text('Observações', L, 59);
    doc.setFontSize(9.5); doc.setTextColor(...TINTA);
    const linhas = doc.splitTextToSize(String(aud.observacoes), R - L).slice(0, 3);
    doc.text(linhas, L, 63.5);
    yR = 63.5 + linhas.length * 4.6 + 3;
  }

  // Resumo em uma faixa
  const celulas = [
    ['Itens contados', `${fmtInt(resumo.auditados)} de ${fmtInt(resumo.total_produtos)}`, TINTA],
    ['Sem divergência', fmtInt(resumo.ok), TINTA],
    ['Itens com falta', fmtInt(resumo.faltas), VERMELHO],
    ['Itens com sobra', fmtInt(resumo.sobras), VERDE],
    ['Não contados', fmtInt(resumo.nao_auditados), TINTA],
  ];
  const cw = (R - L) / celulas.length;
  doc.setFillColor(246, 245, 242); doc.rect(L, yR, R - L, 15, 'F');
  celulas.forEach(([rot, val, cor], i) => {
    const x = L + i * cw + 4;
    if (i) { doc.setDrawColor(...LINHA); doc.line(L + i * cw, yR + 3, L + i * cw, yR + 12); }
    doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text(rot, x, yR + 5.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...cor); doc.text(val, x, yR + 11.5);
    doc.setFont('helvetica', 'normal');
  });

  // Tabela
  doc.autoTable({
    startY: yR + 21,
    margin: { left: L, right: 210 - R, bottom: 18 },
    theme: 'plain',
    head: [['Código', 'Produto', 'Un.', 'Sistema', 'Contado', 'Diferença', 'Situação']],
    body: itens.map(r => [r.codigo_produto, r.nome_produto, r.unidade_medida ?? '', qtd(r.estoque_sistema, r.unidade_medida), qtd(r.quantidade_contada, r.unidade_medida), dif(r.diferenca, r.unidade_medida), situacaoTexto(r.diferenca)]),
    styles: { font: 'helvetica', fontSize: 8.5, textColor: TINTA, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: LINHA, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: [38, 37, 35], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 0: { cellWidth: 22, textColor: CINZA }, 2: { cellWidth: 11, halign: 'center' }, 3: { halign: 'right', cellWidth: 21 }, 4: { halign: 'right', cellWidth: 21 }, 5: { halign: 'right', cellWidth: 22, fontStyle: 'bold' }, 6: { cellWidth: 19 } },
    didParseCell: d => {
      if (d.section === 'head' && d.column.index >= 3 && d.column.index <= 5) d.cell.styles.halign = 'right';
      if (d.section !== 'body') return;
      const v = itens[d.row.index].diferenca;
      if (v > 0 || v < 0) {
        d.cell.styles.fillColor = v > 0 ? [240, 249, 243] : [253, 242, 242];
        if (d.column.index >= 5) { d.cell.styles.textColor = v > 0 ? VERDE : VERMELHO; d.cell.styles.fontStyle = 'bold'; }
      } else if (d.column.index >= 5) d.cell.styles.textColor = CINZA;
    },
  });

  // Assinaturas: na última página, se couberem acima do rodapé
  let y = doc.lastAutoTable.finalY + 18;
  if (y > 274) { doc.addPage(); y = 40; }
  doc.setDrawColor(...CINZA); doc.setLineWidth(0.25);
  [[L, 'Auditor responsável'], [L + 98, 'Conferência / gestor']].forEach(([x, rot]) => {
    doc.line(x, y, x + 84, y);
    doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text(rot, x, y + 4.5);
  });

  // Rodapé em todas as páginas
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINHA); doc.line(L, 285, R, 285);
    doc.setFontSize(7.5); doc.setTextColor(...CINZA);
    doc.text(`AudiStock  ·  ${aud.numero_auditoria}  ·  ${aud.empresas?.nome ?? ''}  ·  emitido em ${emitidoEm}`, L, 289.5);
    doc.text(`Página ${i} de ${n}`, R, 289.5, { align: 'right' });
  }
  doc.save(nomeArquivo(aud, 'pdf'));
}

// ── Excel ───────────────────────────────────────────────────
export async function gerarExcel({ aud, resumo, itens, naoContados, filtroRotulo, emissor }) {
  const ExcelJS = await carregarScript(`${CDN}/exceljs/4.4.0/exceljs.min.js`, 'ExcelJS');
  const wb = new ExcelJS.Workbook();
  wb.creator = emissor || 'AudiStock'; wb.created = new Date();
  wb.title = `Relatório de divergências ${aud.numero_auditoria}`;

  const CAB = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF262523' } }, alignment: { vertical: 'middle' } };
  const borda = { bottom: { style: 'hair', color: { argb: 'FFDEDBD4' } } };
  const formato = un => casasDaUnidade(un) ? '#,##0.000' : '#,##0';
  const formatoDif = un => casasDaUnidade(un) ? '+#,##0.000;-#,##0.000;0.000' : '+#,##0;-#,##0;0';

  // Aba Resumo
  const rs = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  rs.columns = [{ width: 26 }, { width: 44 }];
  rs.getCell('A1').value = 'Relatório de divergências de estoque';
  rs.getCell('A1').font = { bold: true, size: 15 };
  rs.getCell('A2').value = `${aud.numero_auditoria} · ${aud.empresas?.nome ?? ''}`;
  rs.getCell('A2').font = { color: { argb: 'FF645F58' } };
  const linhasResumo = [
    ['Empresa', aud.empresas?.nome ?? '—'], ['Auditoria', aud.numero_auditoria],
    ['Início', aud.data_inicio ? new Date(aud.data_inicio) : '—'], ['Término', aud.data_fim ? new Date(aud.data_fim) : '—'],
    ['Tipo de contagem', aud.auditoria_cega ? 'Cega' : 'Visível'], ['Responsável', aud.usuarios?.nome ?? '—'],
    ['Itens listados', filtroRotulo], ['Emitido em', new Date()], ['Emitido por', emissor || '—'],
    null,
    ['Produtos da empresa', resumo.total_produtos], ['Itens contados', resumo.auditados], ['Não contados', resumo.nao_auditados],
    ['Sem divergência', resumo.ok], ['Itens com falta', resumo.faltas], ['Itens com sobra', resumo.sobras],
    ['Acerto da contagem', resumo.auditados ? resumo.ok / resumo.auditados : 0],
  ];
  linhasResumo.forEach((l, i) => {
    if (!l) return;
    const row = rs.getRow(4 + i);
    row.getCell(1).value = l[0]; row.getCell(1).font = { color: { argb: 'FF645F58' } };
    const c = row.getCell(2); c.value = l[1];
    if (l[1] instanceof Date) c.numFmt = 'dd/mm/yyyy hh:mm';
    if (l[0] === 'Acerto da contagem') c.numFmt = '0.0%';
    c.alignment = { horizontal: 'left' };
    if (l[0] === 'Itens com falta') c.font = { bold: true, color: { argb: 'FFB91C1C' } };
    if (l[0] === 'Itens com sobra') c.font = { bold: true, color: { argb: 'FF166534' } };
  });

  // Aba Itens: números de verdade, diferença e situação por fórmula
  const ws = wb.addWorksheet('Itens', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ws.columns = [
    { header: 'Código', key: 'cod', width: 13 }, { header: 'Produto', key: 'nome', width: 44 }, { header: 'Unidade', key: 'un', width: 9 },
    { header: 'Sistema', key: 'sis', width: 13 }, { header: 'Contado', key: 'cont', width: 13 }, { header: 'Diferença', key: 'dif', width: 13 },
    { header: 'Diferença %', key: 'pct', width: 12 }, { header: 'Situação', key: 'sit', width: 12 },
  ];
  itens.forEach((r, i) => {
    const n = i + 2, temSaldo = r.estoque_sistema != null;
    const row = ws.addRow({
      cod: r.codigo_produto, nome: r.nome_produto, un: r.unidade_medida ?? '',
      sis: temSaldo ? Number(r.estoque_sistema) : null, cont: Number(r.quantidade_contada),
      dif: temSaldo ? { formula: `E${n}-D${n}`, result: Number(r.diferenca) } : null,
      pct: temSaldo && Number(r.estoque_sistema) ? { formula: `IF(D${n}=0,"",F${n}/D${n})`, result: Number(r.diferenca) / Number(r.estoque_sistema) } : null,
      sit: temSaldo ? { formula: `IF(F${n}>0,"Sobra",IF(F${n}<0,"Falta","OK"))`, result: situacaoTexto(r.diferenca) } : 'Sem saldo',
    });
    row.getCell('sis').numFmt = row.getCell('cont').numFmt = formato(r.unidade_medida);
    row.getCell('dif').numFmt = formatoDif(r.unidade_medida);
    row.getCell('pct').numFmt = '+0.0%;-0.0%;0.0%';
    row.getCell('un').alignment = { horizontal: 'center' };
    row.eachCell({ includeEmpty: true }, c => { c.border = borda; });
  });
  _cabecalho(ws, CAB, [4, 5, 6, 7]);
  ws.autoFilter = { from: 'A1', to: `H${itens.length + 1}` };
  if (itens.length) {
    ws.addConditionalFormatting({ ref: `F2:H${itens.length + 1}`, rules: [
      { type: 'expression', formulae: ['$F2>0'], style: { font: { color: { argb: 'FF166534' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF0F9F3' } } } },
      { type: 'expression', formulae: ['$F2<0'], style: { font: { color: { argb: 'FFB91C1C' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDF2F2' } } } },
    ] });
  }
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.headerFooter.oddFooter = `&L${aud.numero_auditoria} · ${aud.empresas?.nome ?? ''}&RPágina &P de &N`;

  // Aba Não contados
  if (naoContados?.length) {
    const nc = wb.addWorksheet('Não contados', { views: [{ state: 'frozen', ySplit: 1 }] });
    nc.columns = [{ header: 'Código', width: 13 }, { header: 'Produto', width: 44 }, { header: 'Unidade', width: 9 }];
    naoContados.forEach(p => nc.addRow([p.codigo_produto, p.nome_produto, p.unidade_medida ?? '']).eachCell(c => { c.border = borda; }));
    _cabecalho(nc, CAB, []);
    nc.autoFilter = { from: 'A1', to: `C${naoContados.length + 1}` };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function _cabecalho(ws, estilo, colsDireita) {
  const cab = ws.getRow(1);
  cab.height = 22;
  cab.eachCell((c, i) => { Object.assign(c, { font: estilo.font, fill: estilo.fill }); c.alignment = { vertical: 'middle', horizontal: colsDireita.includes(i) ? 'right' : 'left' }; });
}
