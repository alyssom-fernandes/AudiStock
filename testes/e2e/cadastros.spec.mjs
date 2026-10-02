// Cadastros: empresa, produtos por planilha, usuários e senha.
import { fileURLToPath } from 'node:url';
import { test, expect, abrir, banco, MODAL } from './ajuda.mjs';

const PLANILHA = fileURLToPath(new URL('../fixtures/produtos.xlsx', import.meta.url));

test('nova empresa: CNPJ inválido é apontado no campo; válido salva', async ({ page }) => {
  await abrir(page, 'app.html?tela=empresas');
  await page.click('.toolbar [data-acao="nova"]');
  await page.fill('#empNome', 'Mercado Bom Preço');
  await page.fill('#empCnpj', '11.111.111/1111-11');
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator('#empCnpj')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`${MODAL} .form-erro`)).toContainText('CNPJ inválido');
  await page.fill('#empCnpj', '11.222.333/0001-81');
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator('.toast')).toContainText('Mercado Bom Preço cadastrada');
  await expect(page.locator('#empCard')).toContainText('Mercado Bom Preço');
});

test('Esc com o formulário preenchido pergunta antes de descartar', async ({ page }) => {
  await abrir(page, 'app.html?tela=empresas');
  await page.click('.toolbar [data-acao="nova"]');
  await page.fill('#empNome', 'Rascunho');
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="alertdialog"]')).toContainText('Descartar o que foi preenchido?');
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(page.locator('#empNome')).toHaveValue('Rascunho');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.locator(MODAL)).toHaveCount(0);
});

test('importa produtos de planilha, com prévia e progresso', async ({ page }) => {
  await abrir(page, 'app.html?tela=produtos');
  await page.click('.toolbar [data-acao="importar"]');
  await page.selectOption('#impEmpresa', { label: 'Distribuidora Aurora — Filial Norte' });
  await page.setInputFiles('#impArquivo', PLANILHA);
  await expect(page.locator('#impPrevia')).toContainText('11 produtos');
  await expect(page.locator('#impPrevia')).toContainText('Linha 10: sem nome');
  await page.click('#btnImportar');
  await expect(page.locator('#impPrevia')).toContainText('Importação concluída');
  const n = await banco(page, `const f = t.empresas.find(e => e.nome.includes('Filial Norte')); return t.produtos.filter(p => p.empresa_id === f.id).length;`);
  expect(n).toBe(11);
});

test('cadastra usuário pela Edge Function; e-mail repetido é apontado no campo', async ({ page }) => {
  await abrir(page, 'app.html?tela=usuarios');
  const novo = page.locator('.toolbar [data-acao="novo"], [data-acao="novo"]').first();
  await novo.click();
  await page.fill('#usrNome', 'Carla Souza');
  await page.fill('#usrEmail', 'carla.souza@exemplo.com');
  await page.fill('#usrSenha', 'segredo1');
  await page.selectOption('#usrRole', 'auditor');
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator('.toast')).toContainText('Carla Souza');

  await novo.click();
  await page.fill('#usrNome', 'Outra Carla');
  await page.fill('#usrEmail', 'CARLA.SOUZA@exemplo.com');
  await page.fill('#usrSenha', 'segredo1');
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator(`${MODAL} .form-erro`)).toContainText('Já existe um usuário com este e-mail');
});

test('troca de senha confere as duas senhas', async ({ page }) => {
  await abrir(page, 'app.html?tela=config');
  await page.fill('#cfgSenha', 'segredo1');
  await page.fill('#cfgSenha2', 'segredo2');
  await page.click('#cfgSalvarSenha');
  await expect(page.locator('#cfgSenha2')).toHaveAttribute('aria-invalid', 'true');
  await page.fill('#cfgSenha2', 'segredo1');
  await page.click('#cfgSalvarSenha');
  await expect(page.locator('.toast')).toContainText('Senha alterada');
});
