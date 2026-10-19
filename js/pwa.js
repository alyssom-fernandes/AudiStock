// ================================================================
//  AudiStock — js/pwa.js
//  Registra o service worker (sw.js), que guarda os arquivos do site para
//  a página de contagem reabrir sem internet depois de visitada uma vez.
//  Importado por js/ui.js; sem suporte do navegador, ou fora de HTTPS e
//  localhost, não faz nada e o app funciona como antes.
// ================================================================

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
  } catch (err) {
    window.__registrarErro?.('recurso', 'Service worker não registrado', String(err?.message ?? err));
    return null;
  }
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof document !== 'undefined') {
  // Depois do carregamento, para a instalação (que baixa vários arquivos) não competir com a página
  if (document.readyState === 'complete') registrarServiceWorker();
  else window.addEventListener('load', () => registrarServiceWorker(), { once: true });
}
