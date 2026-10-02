// Contagem: teclado, conflito, leitor, sem internet e fechamento.
import { test, expect, abrir, banco, idAuditoria, MODAL, esperarCarregar } from './ajuda.mjs';

async function abrirContagem(page, final = '0007') {
  await abrir(page);
  const id = await idAuditoria(page, final);
  await page.goto(`contagem.html?id=${id}`);
  await esperarCarregar(page);
  await expect(page.locator('#lista tbody tr').first()).toBeVisible();
  return id;
}

// Um produto da empresa que ainda não foi contado nesta auditoria
const naoContado = (page, final = '0007') => banco(page, `
  const aud = t.auditorias.find(x => x.numero_auditoria.endsWith(a));
  const contados = new Set(t.auditoria_itens.filter(i => i.auditoria_id === aud.id).map(i => i.produto_id));
  const p = t.produtos.find(p => p.empresa_id === aud.empresa_id && p.ativo && !contados.has(p.id));
  return { codigo: p.codigo_produto, nome: p.nome_produto };`, final);

async function escolherProduto(page, codigo) {
  await page.fill('#codigoInput', codigo);
  await page.locator('#sug li[data-i]').first().click();
  await expect(page.locator('#preview')).toBeVisible();
}

test('registra pelo teclado e soma quando o produto já foi contado @celular', async ({ page }) => {
  await abrirContagem(page);
  const total = Number(await page.locator('#qtdItens').textContent());
  const produto = await naoContado(page);
  await escolherProduto(page, produto.codigo);
  await expect(page.locator('#preview')).toContainText('Ainda não contado');
  await page.fill('#qtdInput', '5');
  await page.click('#saveBtn');
  await expect(page.locator('.toast').filter({ hasText: `Registrado: 5` })).toBeVisible();
  await expect(page.locator('#qtdItens')).toHaveText(String(total + 1));

  // O mesmo produto de novo: o sistema pergunta, e "Somar" soma
  await escolherProduto(page, produto.codigo);
  await page.fill('#qtdInput', '2');
  await page.click('#saveBtn');
  const somar = page.locator(`${MODAL} .modal-rodape .btn-primary`);
  await expect(somar).toHaveText(/^Somar: 7 \w+$/);
  await somar.click();
  await expect(page.locator('#lista tbody tr').first()).toContainText(produto.nome);
  await expect(page.locator('#lista tbody tr').first()).toContainText('7');
  await expect(page.locator('#qtdItens')).toHaveText(String(total + 1));
});

test('leitor: duas leituras seguidas somam 2 e o campo fica limpo', async ({ page }) => {
  await abrirContagem(page);
  const [codigo, antes] = await banco(page, `
    const aud = t.auditorias.find(x => x.numero_auditoria.endsWith('0007'));
    const item = t.auditoria_itens.find(i => i.auditoria_id === aud.id && t.produtos.find(p => p.id === i.produto_id)?.codigo_barras);
    return [t.produtos.find(p => p.id === item.produto_id).codigo_barras, item.quantidade_contada];`);
  await page.click('#tabScanner');
  await expect(page.locator('.leitor-estado')).toContainText('Pronto para ler');
  for (let i = 0; i < 2; i++) { await page.keyboard.type(codigo); await page.keyboard.press('Enter'); }
  await expect(page.locator('#ultimaLeitura')).toContainText(`agora ${antes + 2}`);
  await expect(page.locator('#codigoInput')).toHaveValue('');

  // Clicar fora pausa o leitor, e o aviso diz isso
  await page.click('#filtroLista');
  await expect(page.locator('.leitor-estado.pausado')).toBeVisible();
});

test('sem internet a contagem fica no aparelho e sobe ao reabrir a página já online', async ({ page, context }) => {
  const id = await abrirContagem(page);
  await context.setOffline(true);
  await expect(page.locator('#conexao')).toContainText('Sem internet');
  const produto = await naoContado(page);
  await escolherProduto(page, produto.codigo);
  await page.fill('#qtdInput', '4');
  await page.click('#saveBtn');
  await expect(page.locator('#lista .badge', { hasText: 'Na fila' })).toBeVisible();
  await expect(page.locator('#conexao')).toContainText('1 na fila');

  // Fecha a aba ainda sem internet; abre outra já online (a fila fica no aparelho)
  await page.close();
  await context.setOffline(false);
  const nova = await context.newPage();
  await nova.goto(`contagem.html?id=${id}&demo=1`);
  await esperarCarregar(nova);
  await expect(nova.locator('#conexao')).toHaveText('Online', { timeout: 10_000 });
  await expect(nova.locator('#lista .badge', { hasText: 'Na fila' })).toHaveCount(0);
  await expect(nova.locator('#lista tbody tr', { hasText: produto.nome }).first()).toContainText('4');
  expect(await nova.evaluate(() => window.errosRegistrados())).toEqual([]);
});

test('fechamento: saldos, confirmação e relatório', async ({ page }) => {
  await abrir(page);
  const id = await idAuditoria(page, '0008');
  await page.goto(`estoque-sistema.html?id=${id}`);
  await esperarCarregar(page);
  const campos = page.locator('.saldo-input');
  const n = await campos.count();
  for (let i = 0; i < n; i++) await campos.nth(i).fill(String(10 + i));
  await expect(page.locator('#resumoSaldos')).toContainText(`${n} de ${n}`);
  await page.click('#btnFinalizar');
  await expect(page.locator(MODAL)).toContainText('Finalizar a auditoria?');
  await page.locator(`${MODAL} .modal-rodape .btn-primary`).click();
  await page.waitForURL(/relatorios\.html/);
  await esperarCarregar(page);
  await expect(page.locator('.cabecalho-titulo')).toContainText('Finalizada');
  await expect(page.locator('#segFiltro')).toBeVisible();
});

test('saldo inválido não deixa finalizar', async ({ page }) => {
  await abrir(page);
  await page.goto(`estoque-sistema.html?id=${await idAuditoria(page, '0008')}`);
  await esperarCarregar(page);
  await page.locator('.saldo-input').first().fill('abc');
  await page.click('#btnFinalizar');
  await expect(page.locator('.toast')).toContainText('saldo inválido');
  await expect(page.locator(MODAL)).toHaveCount(0);
});
