// Ajudantes dos testes de ponta a ponta. Todo teste roda no modo
// demonstração e, no fim, confere que nenhum erro foi registrado.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  // Erros que o próprio teste provoca de propósito (texto parcial)
  errosEsperados: [[], { option: true }],
  page: async ({ page, errosEsperados }, usar) => {
    await usar(page);
    if (page.isClosed()) return;
    // Se a conferência falhar, o teste falha junto (não passa calado)
    const erros = await page.evaluate(() => window.errosRegistrados?.() ?? []);
    const inesperados = erros.filter(e => !errosEsperados.some(t => e.msg.includes(t)));
    expect(inesperados.map(e => `${e.tipo}: ${e.msg} (${e.pagina})`)).toEqual([]);
  },
});
export { expect };

export const MODAL = '.modal-backdrop.active';

// Abre uma página já na demonstração (banco novo, sempre o mesmo)
export async function abrir(page, caminho = 'app.html?tela=dashboard') {
  const url = caminho + (caminho.includes('?') ? '&' : '?') + 'demo=1';
  await page.goto(url);
  await esperarCarregar(page);
}

export async function esperarCarregar(page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.carregando-bloco, .skel').first()).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
}

// Consulta o banco da demonstração (sessionStorage da aba)
export function banco(page, fn, arg) {
  return page.evaluate(([corpo, a]) => {
    const t = JSON.parse(sessionStorage.getItem('audistock-demo-db')).tabelas;
    return new Function('t', 'a', corpo)(t, a);
  }, [fn, arg]);
}

export const idAuditoria = (page, final) =>
  banco(page, 'return t.auditorias.find(x => x.numero_auditoria.endsWith(a)).id', final);
