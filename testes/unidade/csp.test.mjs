// Política de segurança (CSP) das páginas: só roda script do próprio site,
// dos dois CDNs fixos e dos scripts embutidos cujo hash está na política.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const raiz = new URL('../../', import.meta.url);
const ler = p => readFileSync(new URL(p, raiz), 'utf8');
const PAGINAS = ['index.html', 'app.html', 'login.html', '404.html', 'contagem.html', 'relatorios.html', 'estoque-sistema.html'];

const politica = html => html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
const diretiva = (csp, nome) => csp.split(';').map(s => s.trim()).find(s => s.startsWith(nome + ' ')) ?? '';
// O navegador troca CRLF por LF antes de calcular o hash (o checkout no Windows usa CRLF)
const embutidos = html => [...html.replace(/\r\n?/g, '\n').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const hash = s => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

test('toda página tem a política antes de qualquer script', () => {
  for (const p of PAGINAS) {
    const html = ler(p);
    const csp = politica(html);
    assert.ok(csp, `${p}: sem meta Content-Security-Policy`);
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), `${p}: a política precisa vir antes dos scripts`);
    assert.match(diretiva(csp, 'default-src'), /'self'/);
    assert.equal(diretiva(csp, 'object-src'), "object-src 'none'", p);
    assert.doesNotMatch(diretiva(csp, 'script-src'), /unsafe-inline|unsafe-eval/, p);
    // Só as pastas das bibliotecas usadas, nunca o CDN inteiro
    for (const fonte of diretiva(csp, 'script-src').split(/\s+/).filter(f => f.startsWith('https://'))) {
      assert.match(fonte, /^https:\/\/[^/]+\/.+\/$/, `${p}: ${fonte} libera o CDN inteiro`);
    }
  }
});

test('o escopo @supabase do jsDelivr só vale para a versão fixa do supabase-js e para as dependências exatas', () => {
  const versao = ler('js/supabaseClient.js').match(/@supabase\/supabase-js@(\d+\.\d+\.\d+)\/\+esm/)[1];
  for (const p of PAGINAS) {
    const fontes = diretiva(politica(ler(p)), 'script-src').split(/\s+/).filter(f => f.startsWith('https://cdn.jsdelivr.net/npm/@supabase/'));
    assert.ok(fontes.length > 0, p);
    for (const f of fontes) assert.match(f, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/[a-z-]+@\d+\.\d+\.\d+\/$/, `${p}: ${f} sem versão exata`);
    assert.ok(fontes.includes(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${versao}/`), `${p}: a política não libera o supabase-js@${versao} que o app importa`);
  }
});

test('cada script embutido está liberado pelo hash na própria página', () => {
  for (const p of PAGINAS) {
    const html = ler(p);
    const scriptSrc = diretiva(politica(html), 'script-src');
    for (const s of embutidos(html)) {
      assert.ok(scriptSrc.includes(hash(s)), `${p}: script embutido sem hash na política. Acrescente ${hash(s)} ao script-src de todas as páginas.`);
    }
  }
});

test('a política libera o servidor do Supabase que o app usa', () => {
  const host = ler('js/supabaseClient.js').match(/SUPABASE_URL\s*=\s*'https:\/\/([^']+)'/)[1];
  for (const p of PAGINAS) {
    const connect = diretiva(politica(ler(p)), 'connect-src');
    assert.ok(connect.includes(`https://${host}`) && connect.includes(`wss://${host}`), `${p}: connect-src sem ${host}`);
  }
});

test('nenhum código embutido em atributo (onclick e afins) nem fonte de fora', () => {
  const evento = /\son[a-z]+\s*=\s*["'`$]/;
  for (const p of PAGINAS) {
    const html = ler(p);
    assert.doesNotMatch(html, evento, `${p}: atributo de evento embutido`);
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/, `${p}: fonte carregada de fora`);
  }
  const arquivos = ['js/', 'js/telas/'].flatMap(d => readdirSync(new URL(d, raiz)).filter(f => f.endsWith('.js')).map(f => d + f));
  for (const f of arquivos) {
    assert.doesNotMatch(ler(f), evento, `${f}: atributo de evento em HTML gerado`);
    // "Tentar de novo" recebe o nome da tela, não código para rodar
    assert.doesNotMatch(ler(f), /erroCargaHtml\(\s*["'`][^"'`]*\(/, `${f}: erroCargaHtml com código no lugar do nome da tela`);
  }
});
