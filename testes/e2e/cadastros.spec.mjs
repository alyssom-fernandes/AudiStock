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
  // Só no diálogo ativo: o anterior pode ainda estar saindo da tela
  await page.locator(`${MODAL} [role="alertdialog"]`).getByRole('button', { name: 'Descartar' }).click();
  await expect(page.locator(MODAL)).toHaveCount(0);
});

test('depois de salvar, o foco volta ao botão da linha', async ({ page }) => {
  await abrir(page, 'app.html?tela=empresas');
  const editar = page.locator('#empCard [data-acao="editar"]').nth(1);
  const id = await editar.getAttribute('data-id');
  await editar.focus();
  await page.keyboard.press('Enter');
  await page.fill('#empCidade', 'Joinville');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('Empresa atualizada');
  await expect(page.locator(`#empCard [data-acao="editar"][data-id="${id}"]`)).toBeFocused();
});

test('o Voltar do navegador fecha o modal aberto', async ({ page }) => {
  await abrir(page, 'app.html?tela=dashboard');
  await page.click('.nav-item[data-tela="produtos"]');
  await expect(page.locator('#topbarTitle')).toBeFocused();
  await page.locator('#prodCard [data-acao="editar"]').first().click();
  await expect(page.locator(MODAL)).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('#topbarTitle')).toHaveText('Dashboard');
  await expect(page.locator(MODAL)).toHaveCount(0);
});

test('o Voltar do navegador com algo digitado na janela pergunta antes de descartar', async ({ page }) => {
  await abrir(page, 'app.html?tela=dashboard');
  await page.click('.nav-item[data-tela="empresas"]');
  await expect(page.locator('#topbarTitle')).toHaveText('Empresas');
  await page.click('.toolbar [data-acao="nova"]');
  await page.fill('#empNome', 'Rascunho');
  await page.goBack();
  await expect(page.locator('[role="alertdialog"]')).toContainText('Descartar o que foi preenchido?');
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(page.locator('#empNome')).toHaveValue('Rascunho');
  await expect(page).toHaveURL(/tela=empresas/);
});

test('o Voltar do navegador depois de importar não mexe no endereço da tela anterior', async ({ page }) => {
  await abrir(page, 'app.html?tela=dashboard');
  await page.click('.nav-item[data-tela="produtos"]');
  await expect(page.locator('#topbarTitle')).toHaveText('Produtos');
  await expect(page.locator('#prodCard tbody tr').first()).toBeVisible();
  await page.click('.toolbar [data-acao="importar"]');
  await page.selectOption('#impEmpresa', { label: 'Distribuidora Aurora — Filial Norte' });
  await page.setInputFiles('#impArquivo', PLANILHA);
  await page.click('#btnImportar');
  await expect(page.locator('#impPrevia')).toContainText('Importação concluída');
  await page.goBack();
  await expect(page.locator('#topbarTitle')).toHaveText('Dashboard');
  await expect(page.locator(MODAL)).toHaveCount(0);
  expect(page.url()).not.toContain('empresa=');
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

// Monta um .xlsx com o ExcelJS que o app usa, numa aba à parte: na aba do
// app, a biblioteca já carregada pularia o carregamento com SRI que se quer testar
async function planilha(page, linhas) {
  const aba = await page.context().newPage();
  const b64 = await aba.evaluate(async linhas => {
    const ExcelJS = await new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
      s.onload = () => ok(window.ExcelJS); s.onerror = falha;
      document.head.appendChild(s);
    });
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Produtos');
    linhas.forEach((l, i) => ws.getRow(i + 1).values = l);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }, linhas);
  await aba.close();
  return { name: 'produtos.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(b64, 'base64') };
}

test('a prévia da importação aponta a linha certa e o código de barras de outro produto', async ({ page }) => {
  await abrir(page, 'app.html?tela=produtos');
  const ean = await banco(page, `const e = t.empresas.find(e => e.nome === 'Atacado Serra Azul'); return t.produtos.find(p => p.empresa_id === e.id && p.ativo && p.codigo_barras).codigo_barras;`);
  await page.click('.toolbar [data-acao="importar"]');
  await page.selectOption('#impEmpresa', { label: 'Atacado Serra Azul' });
  await page.setInputFiles('#impArquivo', await planilha(page, [
    ['codigo', 'nome', 'codigo_barras'],
    ['NOVO-1', 'Produto novo 1', ean],
    [],
    ['NOVO-2', 'Produto novo 2', ''],
    ['NOVO-3', ''],
  ]));
  const previa = page.locator('#impPrevia');
  await expect(previa).toContainText('1 produto pronto');
  await expect(previa).toContainText(`Linha 2: código de barras ${ean} já é do produto`);
  await expect(previa).toContainText('Linha 5: sem nome');
  await expect(previa).toContainText('não tem a coluna unidade');
  await page.click('#btnImportar');
  await expect(previa).toContainText('Importação concluída');
  await expect(previa).toContainText('1 produto criado');
});

test('cadastra usuário pela Edge Function; e-mail repetido é apontado no campo', async ({ page }) => {
  await abrir(page, 'app.html?tela=usuarios');
  const novo = page.locator('.toolbar [data-acao="novo"], [data-acao="novo"]').first();
  await novo.click();
  await page.locator(`${MODAL} #usrNome`).fill('Carla Souza');
  await page.locator(`${MODAL} #usrEmail`).fill('carla.souza@exemplo.com');
  await page.locator(`${MODAL} #usrSenha`).fill('segredo1');
  await page.locator(`${MODAL} #usrRole`).selectOption('auditor');
  // Sem empresa escolhida, o cadastro não segue (não vira "todas" sem querer)
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator(`${MODAL} #usrEmpresa`)).toHaveAttribute('aria-invalid', 'true');
  await page.locator(`${MODAL} #usrEmpresa`).selectOption({ label: 'Atacado Serra Azul' });
  await page.locator(`${MODAL} .btn-primary`).click();
  await expect(page.locator('.toast')).toContainText('Carla Souza');

  await novo.click();
  await page.locator(`${MODAL} #usrNome`).fill('Outra Carla');
  await page.locator(`${MODAL} #usrEmail`).fill('CARLA.SOUZA@exemplo.com');
  await page.locator(`${MODAL} #usrSenha`).fill('segredo1');
  await page.locator(`${MODAL} #usrEmpresa`).selectOption({ label: 'Todas as empresas' });
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
