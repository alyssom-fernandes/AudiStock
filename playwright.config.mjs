// Testes de ponta a ponta no navegador, sempre no modo demonstração.
//   npm run test:e2e
// No computador usa o Chrome instalado; no GitHub Actions, o Chromium do Playwright.
// Sem o Chrome: npx playwright install chromium, e rode com PW_CHANNEL=chromium
// (ou PW_CHANNEL=msedge para usar o Edge).
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const CANAL = process.env.PW_CHANNEL ?? (CI ? 'chromium' : 'chrome');

export default defineConfig({
  testDir: './testes/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 2,   // mais que isso deixa cada teste lento demais em máquina comum
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    channel: CANAL === 'chromium' ? undefined : CANAL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    trace: CI ? 'retain-on-failure' : 'off',   // no Windows, gravar o trace de todo teste deixa a suíte bem mais lenta
  },
  projects: [
    { name: 'computador', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'celular', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } }, grep: /@celular/ },
  ],
  webServer: {
    command: 'node testes/servidor.mjs 4173',
    url: 'http://localhost:4173/login.html',
    reuseExistingServer: !CI,
  },
});
