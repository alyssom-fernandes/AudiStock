// Relatório: filtros, exportações (CSV, Excel, PDF) e a folha impressa.
import { readFile } from 'node:fs/promises';
import { test, expect, abrir, idAuditoria, esperarCarregar } from './ajuda.mjs';

async function abrirRelatorio(page, final = '0006') {
  await abrir(page);
  await page.goto(`relatorios.html?id=${await idAuditoria(page, final)}`);
  await esperarCarregar(page);
}

async function baixar(page, tipo) {
  const [arquivo] = await Promise.all([page.waitForEvent('download'), page.click(`[data-exp="${tipo}"]`)]);
  return { nome: arquivo.suggestedFilename(), bytes: await readFile(await arquivo.path()) };
}

test('filtros do relatório e lista de relatórios @celular', async ({ page }) => {
  await abrirRelatorio(page);
  const faltas = page.locator('#segFiltro [data-f="faltas"]');
  const n = Number((await faltas.locator('.qtd').textContent()).replace(/\D/g, ''));
  await faltas.click();
  await expect(page.locator('#relCorpo tbody tr')).toHaveCount(n);
  await expect(page.locator('.folha-assinaturas')).toBeHidden();
  await page.goto('app.html?tela=relatorios');
  await esperarCarregar(page);
  await expect(page.locator('#relCard tbody tr')).toHaveCount(5);
  await expect(page.locator('.resultado').first()).toContainText(/faltas?/);
});

test('CSV com auditoria e empresa em cada linha', async ({ page }) => {
  await abrirRelatorio(page);
  const { nome, bytes } = await baixar(page, 'csv');
  expect(nome).toMatch(/^AUD-\d{4}-0006_Atacado-Serra-Azul_\d{4}-\d{2}-\d{2}\.csv$/);
  expect([...bytes.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
  const linhas = bytes.toString('utf8').slice(1).split('\r\n');
  expect(linhas[0]).toBe('Auditoria;Empresa;Código;Produto;Unidade;Sistema;Contado;Diferença;Situação');
  expect(linhas[1]).toMatch(/^AUD-\d{4}-0006;Atacado Serra Azul;/);
});

test('Excel e PDF são gerados (bibliotecas conferidas por SRI, PDF com a fonte IBM Plex)', async ({ page }) => {
  await abrirRelatorio(page);
  const xlsx = await baixar(page, 'excel');
  expect(xlsx.nome).toMatch(/\.xlsx$/);
  expect(xlsx.bytes.subarray(0, 2).toString()).toBe('PK');
  const pdf = await baixar(page, 'pdf');
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const texto = pdf.bytes.toString('latin1');
  expect(texto).toMatch(/\/BaseFont \/IBMPlexSans/);
  expect(texto).toContain('/FontFile2');   // a fonte vai embutida no arquivo
  // Todo script de fora da página veio com o hash conferido pelo navegador
  const scripts = await page.$$eval('script[src^="https://"]', s => s.map(x => ({ src: x.src, integrity: x.integrity, cors: x.crossOrigin })));
  expect(scripts.length).toBeGreaterThan(0);
  for (const s of scripts) expect(s, s.src).toMatchObject({ integrity: expect.stringMatching(/^sha512-/), cors: 'anonymous' });
});

test('tabelas em tablet e notebook pequeno não espremem a coluna principal', async ({ page }) => {
  test.slow();   // três telas em três larguras
  await abrir(page);
  const id = await idAuditoria(page, '0006');
  const casos = [['app.html?tela=usuarios', 'td.l-titulo'], ['app.html?tela=auditorias', 'td.l-titulo'], [`relatorios.html?id=${id}`, '#relCorpo td.l-titulo']];
  for (const largura of [768, 1024, 1180]) {
    await page.setViewportSize({ width: largura, height: 900 });
    for (const [url, celula] of casos) {
      await page.goto(url);
      await esperarCarregar(page);
      const w = await page.locator(celula).first().evaluate(td => td.getBoundingClientRect().width);
      expect(w, `${url} em ${largura}px`).toBeGreaterThan(140);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(sobra, `rolagem lateral em ${url} (${largura}px)`).toBeLessThanOrEqual(0);
    }
  }
});

test('relatório parcial mostra só a contagem, sem divergências', async ({ page }) => {
  await abrirRelatorio(page, '0007');
  await expect(page.locator('.aviso')).toContainText('Relatório parcial');
  await expect(page.locator('#segFiltro')).toHaveCount(0);
  await expect(page.locator('#relCorpo thead th')).toHaveText(['Código', 'Produto', 'Contado']);
  await page.click('[data-ir-nao]');
  await expect(page.locator('#detNao')).toHaveAttribute('open', '');
});

test('folha impressa: cabeçalho e assinaturas só no papel', async ({ page }) => {
  await abrirRelatorio(page);
  await expect(page.locator('header.folha')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('header.folha')).toBeVisible();
  await expect(page.locator('.folha-assinaturas')).toBeVisible();
  await expect(page.locator('.cabecalho-acoes')).toBeHidden();
});
