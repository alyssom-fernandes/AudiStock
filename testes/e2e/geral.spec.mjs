// Entrada, navegação, teclado e celular.
import { test, expect, abrir, esperarCarregar, MODAL } from './ajuda.mjs';

const PAGINAS = ['app.html?tela=dashboard', 'app.html?tela=auditorias', 'app.html?tela=relatorios', 'app.html?tela=empresas',
  'app.html?tela=produtos', 'app.html?tela=usuarios', 'app.html?tela=config'];

test('do login à demonstração @celular', async ({ page }) => {
  await page.goto('login.html');
  await page.getByRole('link', { name: 'Explorar a demonstração' }).click();
  await page.waitForURL(/app\.html/);
  await esperarCarregar(page);
  await expect(page.locator('.demo-bar')).toBeVisible();
  await expect(page.locator('.kpi-valor').first()).toHaveText(/\d+/);
});

test('no celular a faixa da demonstração diz que os dados são fictícios @celular', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.demo-bar')).toContainText('Demonstração · dados fictícios');
  await expect(page.getByRole('button', { name: 'Sair da demonstração' })).toBeVisible();
});

test('na demonstração, o roteiro de 3 passos leva ao relatório e, fechado, não volta', async ({ page }) => {
  await abrir(page);
  const roteiro = page.locator('.roteiro');
  await expect(roteiro).toContainText('Experimente em 3 passos');
  await expect(roteiro.getByRole('link')).toHaveCount(3);
  await roteiro.getByRole('link', { name: /Baixe o relatório/ }).click();
  await page.waitForURL(/relatorios\.html\?id=/);
  await abrir(page);
  await roteiro.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(roteiro).toHaveCount(0);
  await page.reload();
  await esperarCarregar(page);
  await expect(page.locator('.kpi-valor').first()).toHaveText(/\d+/);
  await expect(roteiro).toHaveCount(0);
});

test('tela que não existe avisa, com o título certo na aba', async ({ page }) => {
  await abrir(page, 'app.html?tela=naoexiste');
  await expect(page).toHaveTitle('Página não encontrada · AudiStock');
  await expect(page.getByText('Esta tela não existe')).toBeVisible();
  await page.getByRole('link', { name: 'Ir para o Dashboard' }).click();
  await expect(page).toHaveTitle('Dashboard · AudiStock');
});

test('com a demonstração aberta, o login avisa em vez de entrar nela', async ({ page }) => {
  await abrir(page);
  await page.goto('login.html');
  await expect(page.locator('#demoAberta')).toBeVisible();
  await expect(page.locator('#formLogin')).toBeHidden();
});

test('todas as telas abrem sem erro e sem rolagem lateral @celular', async ({ page }) => {
  test.slow();   // passa por sete telas
  await abrir(page);
  for (const tela of PAGINAS) {
    await page.goto(tela);
    await esperarCarregar(page);
    await expect(page.locator('#topbarTitle')).not.toBeEmpty();
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(sobra, `rolagem lateral em ${tela}`).toBeLessThanOrEqual(0);
  }
});

test('o primeiro Tab oferece pular o menu', async ({ page }) => {
  await abrir(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pageContent')).toBeFocused();
});

test('"Pular para o conteúdo" leva o foco ao conteúdo sem redesenhar a tela nem apagar a busca', async ({ page }) => {
  await abrir(page, 'app.html?tela=produtos');
  await page.fill('#prodBusca', 'arroz');
  await expect(page.locator('#prodCard tbody tr').first()).toContainText(/arroz/i);
  await page.locator('.pular').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pageContent')).toBeFocused();
  await expect(page.locator('#prodBusca')).toHaveValue('arroz');
  await expect(page.locator('#prodCard tbody tr').first()).toContainText(/arroz/i);
});

test('link da demonstração aberto em outra aba leva uma cópia do banco, e a ficha vale uma vez só', async ({ page, context }) => {
  await abrir(page, 'app.html?tela=empresas');
  await page.click('.toolbar [data-acao="nova"]');
  await page.fill('#empNome', 'Criada na aba A');
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator('.toast')).toContainText('Criada na aba A');
  // "Abrir em nova aba" (botão direito) põe uma ficha de uso único no link
  const link = page.locator('.nav-item[data-tela="dashboard"]');
  await link.click({ button: 'right' });
  const href = await link.evaluate(a => a.href);
  expect(href).toMatch(/#passe=/);
  await page.keyboard.press('Escape');

  const nova = await context.newPage();
  await nova.goto(href);
  await esperarCarregar(nova);
  await expect(nova.locator('.demo-bar')).toBeVisible();
  expect(nova.url()).not.toContain('passe=');
  expect(await nova.evaluate(() => JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas.empresas.some(e => e.nome === 'Criada na aba A'))).toBe(true);
  await nova.close();

  // A mesma ficha de novo, ou uma aba sem ficha (endereço digitado, favorito,
  // aba aberta a partir do sistema real): fica no sistema real
  for (const url of [href, 'app.html?tela=dashboard']) {
    const outra = await context.newPage();
    await outra.goto(url);
    await outra.waitForURL(/login\.html/, { timeout: 15_000 });
    expect(await outra.evaluate(() => sessionStorage.getItem('audistock-demo')), url).toBeNull();
    await outra.close();
  }
});

test('menu do celular prende o foco e fecha com Esc @celular', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'só no celular');
  await abrir(page);
  await page.click('#btnMenu');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('sidebar').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  await expect(page.locator('#btnMenu')).toBeFocused();
});

test('endereço inexistente mostra a página 404 do AudiStock', async ({ page }) => {
  const r = await page.goto('nao-existe.html');
  expect(r.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Página não encontrada');
});
