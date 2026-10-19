// ================================================================
//  AudiStock — sw.js (service worker)
//  Guarda os arquivos do próprio site (páginas, CSS, JS, fontes, ícones)
//  para a contagem reabrir sem internet depois de visitada uma vez.
//
//  * Só atende GET dos arquivos listados abaixo. Nada do Supabase (dados,
//    login, funções) passa por aqui: essas chamadas vão sempre à rede.
//  * Arquivos do site: responde com o que está guardado e atualiza em
//    segundo plano; a versão nova aparece na visita seguinte.
//  * As bibliotecas do Supabase no jsDelivr (versões fixas, imutáveis)
//    ficam guardadas na instalação, para o modo real também abrir sem rede.
//    As de PDF e Excel (cdnjs) não são guardadas: exportar pede internet.
//  * Ao mudar a lista ou a versão do cache, troque VERSAO: a ativação apaga
//    os caches antigos. testes/unidade/pwa.test.mjs confere se a lista
//    cobre tudo o que as páginas carregam.
// ================================================================

const VERSAO = 'audistock-v1';

const ARQUIVOS = [
  '404.html',
  'app.html',
  'contagem.html',
  'estoque-sistema.html',
  'index.html',
  'login.html',
  'relatorios.html',
  'css/fontes.css',
  'css/style.css',
  'js/app.js',
  'js/auditorias.js',
  'js/auth.js',
  'js/consulta.js',
  'js/contagem.js',
  'js/demo.js',
  'js/empresas.js',
  'js/erros.js',
  'js/exportacao.js',
  'js/login.js',
  'js/offline.js',
  'js/pwa.js',
  'js/produtos.js',
  'js/relatorios.js',
  'js/supabaseClient.js',
  'js/ui.js',
  'js/usuarios.js',
  'js/telas/auditoria.js',
  'js/telas/auditorias.js',
  'js/telas/config.js',
  'js/telas/contagem.js',
  'js/telas/dashboard.js',
  'js/telas/empresas.js',
  'js/telas/fechamento.js',
  'js/telas/produtos.js',
  'js/telas/relatorio.js',
  'js/telas/relatorios.js',
  'js/telas/usuarios.js',
  'supabase/functions/criar-usuario/regras.js',
  'fontes/plex-mono-400.woff2',
  'fontes/plex-mono-500.woff2',
  'fontes/plex-sans-400.woff2',
  'fontes/plex-sans-500.woff2',
  'fontes/plex-sans-600.woff2',
  'fontes/plex-sans-condensed-500.woff2',
  'fontes/plex-sans-condensed-600.woff2',
  'icones/icone.svg',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'manifest.webmanifest',
];

const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.117.2/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/functions-js@2.117.2/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/postgrest-js@2.117.2/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/realtime-js@2.117.2/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/storage-js@2.117.2/+esm',
  'https://cdn.jsdelivr.net/npm/@supabase/phoenix@0.4.5/+esm',
  'https://cdn.jsdelivr.net/npm/tslib@2.8.1/+esm',
  'https://cdn.jsdelivr.net/npm/iceberg-js@0.8.1/+esm',
];

const chave = url => {
  const u = new URL(url, self.registration.scope);
  u.search = ''; u.hash = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
};
const DO_SITE = new Set(ARQUIVOS.map(chave));
const DO_CDN = new Set(CDN);

self.addEventListener('install', evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // Falhou um arquivo do site: a instalação toda falha e o app segue como estava
    await Promise.all(ARQUIVOS.map(async arquivo => {
      const resposta = await fetch(new URL(arquivo, self.registration.scope), { cache: 'reload' });
      if (!resposta.ok) throw new Error(`${arquivo}: HTTP ${resposta.status}`);
      await cache.put(chave(arquivo), resposta);
    }));
    // O CDN fora do ar não impede o resto: o modo real só perde o abrir sem rede
    await Promise.allSettled(CDN.map(async url => {
      const resposta = await fetch(url, { mode: 'cors' });
      if (resposta.ok) await cache.put(url, resposta);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome.startsWith('audistock-') && nome !== VERSAO) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin === self.location.origin) {
    const k = chave(url);
    if (DO_SITE.has(k)) evento.respondWith(guardadoEAtualiza(evento, pedido, k));
  } else if (DO_CDN.has(url.href)) {
    evento.respondWith(guardadoOuRede(pedido, url.href));
  }
});

async function guardadoEAtualiza(evento, pedido, k) {
  const cache = await caches.open(VERSAO);
  const guardado = await cache.match(k);
  const atualizar = fetch(pedido).then(async resposta => {
    if (resposta.ok) await cache.put(k, resposta.clone());
    return resposta;
  });
  if (!guardado) return atualizar;
  evento.waitUntil(atualizar.catch(() => {}));
  return guardado;
}

async function guardadoOuRede(pedido, k) {
  const cache = await caches.open(VERSAO);
  return (await cache.match(k)) ?? fetch(pedido);
}
