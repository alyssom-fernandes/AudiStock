// Testes de ponta a ponta no navegador, sempre no modo demonstração.
//   npm run test:e2e
// No computador usa o Chrome instalado; no GitHub Actions, o Chromium do Playwright.
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './testes/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: CI ? 2 : 4,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    channel: CI ? undefined : 'chrome',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    trace: 'retain-on-failure',
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
