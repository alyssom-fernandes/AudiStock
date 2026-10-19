// PWA: o service worker precisa listar tudo o que as páginas carregam (senão
// a página de contagem não reabre sem internet) e nunca tocar nas chamadas do Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { posix } from 'node:path';

const raiz = new URL('../../', import.meta.url);
const ler = p => readFileSync(new URL(p, raiz), 'utf8');
const PAGINAS = ['index.html', 'app.html', 'login.html', '404.html', 'contagem.html', 'relatorios.html', 'estoque-sistema.html'];

const sw = ler('sw.js');
const lista = nome => [...sw.match(new RegExp(String.raw`const ${nome} = \[([\s\S]*?)\];`))[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const ARQUIVOS = lista('ARQUIVOS');
const CDN = lista('CDN');

// Tudo o que um módulo importa com caminho relativo, e os arquivos que ele busca com new URL(..., import.meta.url)
function dependencias(arquivo) {
  const src = ler(arquivo);
  const alvos = [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]);
  // Ignora pastas (as fontes do PDF, que precisam de internet de qualquer jeito) e o próprio sw.js
  const fetchs = [...src.matchAll(/new URL\(`?['"]?(\.{1,2}\/[^'"`$]*)[^)]*import\.meta\.url/g)].map(m => m[1]);
  return [...alvos, ...fetchs].filter(a => !a.endsWith('/') && !a.endsWith('sw.js')).map(a => posix.normalize(posix.join(posix.dirname(arquivo), a)));
}

test('a lista do service worker não tem arquivo inexistente nem repetido', () => {
  assert.equal(new Set(ARQUIVOS).size, ARQUIVOS.length);
  for (const a of ARQUIVOS) assert.ok(existsSync(new URL(a, raiz)), `${a} não existe`);
});

test('todo arquivo que as páginas carregam está na lista (a contagem reabre sem rede)', () => {
  const faltando = new Set();
  const visitar = (arquivo) => {
    if (!ARQUIVOS.includes(arquivo)) faltando.add(arquivo);
    if (arquivo.endsWith('.js') && existsSync(new URL(arquivo, raiz))) for (const d of dependencias(arquivo)) if (!visitados.has(d)) { visitados.add(d); visitar(d); }
  };
  const visitados = new Set();
  for (const p of PAGINAS) {
    const html = ler(p);
    visitar(p);
    for (const m of html.matchAll(/(?:src|href)="((?!https?:|data:|#)[^"]+)"/g)) {
      const a = m[1].split('?')[0];
      if (a === '/') continue;   // link para a raiz do site, não um arquivo
      if (!visitados.has(a)) { visitados.add(a); visitar(a); }
    }
  }
  // fontes pedidas pelo CSS
  for (const css of ARQUIVOS.filter(a => a.endsWith('.css'))) {
    for (const m of ler(css).matchAll(/url\(['"]?\.\.\/([^'")]+)['"]?\)/g)) if (!ARQUIVOS.includes(m[1])) faltando.add(m[1]);
  }
  assert.deepEqual([...faltando], [], 'acrescente ao ARQUIVOS de sw.js e troque a VERSAO');
});

test('as páginas ligam o manifest e o manifest aponta para ícones que existem', () => {
  for (const p of PAGINAS.filter(p => p !== '404.html')) assert.match(ler(p), /<link rel="manifest" href="manifest\.webmanifest"/, p);
  const m = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(existsSync(new URL(m.start_url, raiz)));
  assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'));
  for (const i of m.icons) { assert.ok(existsSync(new URL(i.src, raiz)), i.src); assert.ok(ARQUIVOS.includes(i.src), `${i.src} fora do cache`); }
});

test('as bibliotecas do CDN guardadas são exatamente as que a política (CSP) libera, na versão que o app importa', () => {
  const versao = ler('js/supabaseClient.js').match(/@supabase\/supabase-js@([\d.]+)\/\+esm/)[1];
  assert.ok(CDN.includes(`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${versao}/+esm`));
  const csp = ler('app.html').match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const pastas = csp.split(';').find(s => s.trim().startsWith('script-src')).split(/\s+/).filter(f => f.startsWith('https://cdn.jsdelivr.net/'));
  assert.deepEqual(CDN.map(u => u.replace(/\+esm$/, '')).sort(), pastas.sort());
});

test('o service worker só atende GET e nunca o Supabase', () => {
  assert.match(sw, /pedido\.method !== 'GET'\) return/);
  assert.doesNotMatch(sw, /supabase\.co/);
  // Fora do site e da lista do CDN, o fetch não é interceptado
  assert.match(sw, /else if \(DO_CDN\.has\(url\.href\)\)/);
  for (const a of ARQUIVOS) assert.doesNotMatch(a, /^(rest|auth|functions)\//);
});

test('toda página registra o service worker (por js/ui.js, que ela carrega) ', () => {
  assert.match(ler('js/ui.js'), /import '\.\/pwa\.js'/);
  assert.match(ler('js/pwa.js'), /serviceWorker\.register\(new URL\('\.\.\/sw\.js'/);
  assert.ok(readdirSync(new URL('./', raiz)).includes('sw.js'), 'sw.js precisa ficar na raiz, para o escopo cobrir o site todo');
});
