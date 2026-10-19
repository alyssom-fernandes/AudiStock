// PWA: a página de contagem reabre sem internet depois de visitada uma vez.
// Na demonstração os dados ficam na própria aba; com o Supabase de verdade, o
// cabeçalho da auditoria e o catálogo vêm do servidor a cada abertura (veja o README).
import { test, expect, abrir, banco, idAuditoria, esperarCarregar } from './ajuda.mjs';

test('demonstração: a contagem reabre sem internet depois de visitada uma vez e a fila sobrevive @celular', async ({ page, context }) => {
  await abrir(page);
  const id = await idAuditoria(page, '0007');
  await page.goto(`contagem.html?id=${id}`);
  await esperarCarregar(page);
  await expect(page.locator('#lista tbody tr').first()).toBeVisible();

  // O service worker instalou, guardou os arquivos e já controla a página
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  const guardados = await page.evaluate(async () => {
    const nomes = await caches.keys();
    return (await (await caches.open(nomes.find(n => n.startsWith('audistock-')))).keys()).map(r => new URL(r.url).pathname);
  });
  expect(guardados).toEqual(expect.arrayContaining(['/contagem.html', '/js/telas/contagem.js', '/css/style.css', '/fontes/plex-sans-400.woff2', '/manifest.webmanifest']));

  // Sem internet: uma contagem vai para a fila do aparelho e a página é recarregada
  // (aqui só o service worker tem os arquivos)
  await context.setOffline(true);
  await expect(page.locator('#conexao')).toContainText('Sem internet');
  const { codigo, nome } = await banco(page, `
    const aud = t.auditorias.find(x => x.numero_auditoria.endsWith(a));
    const contados = new Set(t.auditoria_itens.filter(i => i.auditoria_id === aud.id).map(i => i.produto_id));
    const p = t.produtos.find(p => p.empresa_id === aud.empresa_id && p.ativo && !contados.has(p.id));
    return { codigo: p.codigo_produto, nome: p.nome_produto };`, '0007');
  await page.fill('#codigoInput', codigo);
  await page.locator('#sug li[data-i]').first().click();
  await page.fill('#qtdInput', '4');
  await page.click('#saveBtn');
  await expect(page.locator('#lista .badge', { hasText: 'Na fila' })).toHaveCount(1);

  await page.reload();
  await esperarCarregar(page);
  await expect(page.locator('#conexao')).toContainText('Sem internet');
  await expect(page.locator('#codigoInput')).toBeVisible();
  await expect(page.locator('#lista .badge', { hasText: 'Na fila' })).toHaveCount(1);   // a fila sobreviveu ao recarregar
  // Fontes e estilo vieram do cache: a tela não ficou sem formatação
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('IBM Plex Sans');

  // A rede volta com a página aberta: a fila sobe sozinha
  await context.setOffline(false);
  await expect(page.locator('#conexao')).toHaveText('Online', { timeout: 15_000 });
  await expect(page.locator('#lista .badge', { hasText: 'Na fila' })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('#lista tbody tr', { hasText: nome }).first()).toContainText('4');
});

test('o manifest é válido e o service worker não guarda chamadas do Supabase', async ({ page }) => {
  await abrir(page);
  const manifest = await page.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json()));
  expect(manifest.display).toBe('standalone');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 });
  const externos = await page.evaluate(async () => {
    const c = await caches.open((await caches.keys()).find(n => n.startsWith('audistock-')));
    return (await c.keys()).map(r => new URL(r.url)).filter(u => u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net').map(u => u.href);
  });
  expect(externos).toEqual([]);
});
