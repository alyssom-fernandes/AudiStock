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

  // Sai da página ainda sem internet e volta já online (a fila fica no
  // aparelho). Na mesma aba: a demonstração vale só para ela. Sem "demo=1",
  // que começaria um banco novo.
  await page.goto('about:blank');
  await context.setOffline(false);
  await page.goto(`contagem.html?id=${id}`);
  await esperarCarregar(page);
  await expect(page.locator('#conexao')).toHaveText('Online', { timeout: 10_000 });
  await expect(page.locator('#lista .badge', { hasText: 'Na fila' })).toHaveCount(0);
  await expect(page.locator('#lista tbody tr', { hasText: produto.nome }).first()).toContainText('4');
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

test('fechamento: produto contado em outro aparelho entra na lista, sem perder os saldos digitados', async ({ page }) => {
  await abrir(page);
  const id = await idAuditoria(page, '0008');
  await page.goto(`estoque-sistema.html?id=${id}`);
  await esperarCarregar(page);
  const campos = page.locator('.saldo-input');
  const n = await campos.count();
  await campos.nth(0).fill('12');
  await campos.nth(1).fill('7');

  // Outro aparelho conta um produto que esta tela ainda não mostra
  const outro = await naoContado(page, '0008');
  await page.evaluate(async ([auditoriaId, codigo]) => {
    const url = caminho => new URL(caminho, location.href).href;   // os mesmos módulos que a tela usa
    const { registrarContagem } = await import(url('js/contagem.js'));
    const { ID_USUARIO_DEMO } = await import(url('js/demo.js'));
    const { default: supabase } = await import(url('js/supabaseClient.js'));
    const { data: aud } = await supabase.from('auditorias').select('empresa_id').eq('id', auditoriaId).single();
    const { data: p } = await supabase.from('produtos').select('id').eq('empresa_id', aud.empresa_id).eq('codigo_produto', codigo).single();
    await registrarContagem({ auditoriaId, produtoId: p.id, quantidade: 3, usuarioId: ID_USUARIO_DEMO, acao: 'somar' });
  }, [id, outro.codigo]);

  await page.click('#btnFinalizar');
  await expect(page.locator('.toast')).toContainText('1 item foi contado depois que você abriu o fechamento');
  await page.waitForEvent('load');
  await esperarCarregar(page);
  await expect(campos).toHaveCount(n + 1);
  await expect(page.locator('.aviso', { hasText: 'Os saldos que você já tinha digitado foram mantidos' })).toBeVisible();
  await expect(page.getByText(outro.nome).first()).toBeVisible();
  expect(await campos.evaluateAll(xs => xs.map(x => x.value).filter(Boolean))).toEqual(['12', '7']);
});

// Outra pessoa age no banco da demonstração com a tela aberta (os mesmos módulos que a tela usa)
const outroAparelho = (page, fn, arg) => page.evaluate(async ([corpo, a]) => {
  const url = c => new URL(c, location.href).href;
  const m = { ...(await import(url('js/contagem.js'))), ...(await import(url('js/demo.js'))), supabase: (await import(url('js/supabaseClient.js'))).default };
  return new Function('m', 'a', `return (async () => { ${corpo} })()`)(m, a);
}, [fn, arg]);

async function abrirFechamentoPreenchido(page) {
  await abrir(page);
  const id = await idAuditoria(page, '0008');
  await page.goto(`estoque-sistema.html?id=${id}`);
  await esperarCarregar(page);
  const campos = page.locator('.saldo-input');
  const n = await campos.count();
  for (let i = 0; i < n; i++) await campos.nth(i).fill('10');
  await page.click('#btnFinalizar');
  await expect(page.locator(MODAL)).toContainText('Finalizar a auditoria?');
  return { id, campos, n };
}

test('fechamento: item recontado com a confirmação aberta não é finalizado', async ({ page }) => {
  const { id, campos } = await abrirFechamentoPreenchido(page);
  await outroAparelho(page, `
    const { data } = await m.listarItensContados(a);
    await m.registrarContagem({ auditoriaId: a, produtoId: data[0].produto_id, quantidade: 5, usuarioId: m.ID_USUARIO_DEMO, acao: 'somar' });`, id);
  await page.locator(`${MODAL} .modal-rodape .btn-primary`).click();
  await expect(page.locator('.toast')).toContainText('1 item foi recontado enquanto você confirmava, e nada foi finalizado');
  await page.waitForEvent('load');
  await esperarCarregar(page);
  expect(await banco(page, 'return t.auditorias.find(x => x.id === a).status', id)).toBe('em_andamento');
  await expect(campos.first()).toHaveValue('10');
});

test('fechamento: finalizada por outra pessoa com outros saldos, a tela avisa e não some com os digitados', async ({ page }) => {
  const { id, campos } = await abrirFechamentoPreenchido(page);
  await outroAparelho(page, `
    const { data } = await m.listarItensContados(a);
    await m.finalizarComSaldos(a, Object.fromEntries(data.map(i => [i.id, null])));`, id);
  await page.locator(`${MODAL} .modal-rodape .btn-primary`).click();
  await expect(page.locator('.aviso[role="alert"]')).toContainText('Outra pessoa finalizou esta auditoria antes');
  await expect(campos.first()).toBeDisabled();
  await expect(campos.first()).toHaveValue('10');
  await expect(page.locator('#btnFinalizar')).toBeDisabled();
  expect(page.url()).toContain('estoque-sistema.html');
});

test('quantidade com cara de código de barras não é registrada', async ({ page }) => {
  await abrirContagem(page);
  const produto = await naoContado(page);
  await escolherProduto(page, produto.codigo);
  await page.fill('#qtdInput', '78901234');
  await page.click('#saveBtn');
  await expect(page.locator('#qtdInput')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#grupoQtd .form-erro')).toContainText('código de barras');
});

test('contagem guardada de auditoria encerrada nesse meio-tempo aparece, com Descartar', async ({ page, context }) => {
  const id = await abrirContagem(page);
  await context.setOffline(true);
  const produto = await naoContado(page);
  await escolherProduto(page, produto.codigo);
  await page.fill('#qtdInput', '4');
  await page.click('#saveBtn');
  await expect(page.locator('#lista .badge', { hasText: 'Na fila' })).toBeVisible();
  // Outra pessoa cancela a auditoria antes de a fila subir
  await outroAparelho(page, `await m.supabase.from('auditorias').update({ status: 'cancelada', motivo_cancelamento: 'teste' }).eq('id', a);`, id);
  await page.goto('about:blank');
  await context.setOffline(false);
  await page.goto(`contagem.html?id=${id}`);
  await esperarCarregar(page);
  const aviso = page.locator('.aviso-aviso');
  await expect(aviso).toContainText('não chegou ao servidor antes do encerramento');
  await expect(aviso).toContainText(produto.nome);
  await page.click('#btnDescartarPresas');
  await page.locator(MODAL).getByRole('button', { name: 'Descartar' }).click();
  await expect(aviso).toHaveCount(0);
});

test('saldo inválido não deixa finalizar', async ({ page }) => {
  await abrir(page);
  await page.goto(`estoque-sistema.html?id=${await idAuditoria(page, '0008')}`);
  await esperarCarregar(page);
  await page.locator('.saldo-input').first().fill('abc');
  await page.click('#btnFinalizar');
  await expect(page.locator('.toast')).toContainText(/saldo inválido/i);
  await expect(page.locator(MODAL)).toHaveCount(0);
});
