// ================================================================
//  O mínimo de navegador que os módulos do app precisam para rodar
//  no Node, já no modo demonstração (?demo=1). Importe este arquivo
//  ANTES de qualquer módulo de js/.
//  O banco é o do js/demo.js: os testes exercitam o código real do app
//  contra o mesmo banco de mentira que a demonstração usa.
// ================================================================

function memoria() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
  };
}

const elemento = () => ({
  style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, removeAttribute() {}, appendChild() {}, insertAdjacentHTML() {}, addEventListener() {}, remove() {},
});

globalThis.window = globalThis;
globalThis.sessionStorage = memoria();
globalThis.localStorage = memoria();
globalThis.location = { search: '?demo=1', pathname: '/app.html', hash: '', href: 'http://localhost/app.html?demo=1', origin: 'http://localhost' };
globalThis.history = { state: null, replaceState() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.innerWidth = 1366;
globalThis.document = {
  addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: elemento, head: elemento(), body: elemento(),
  documentElement: elemento(),
};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

// Erros que o app registraria no navegador ficam aqui, para os testes conferirem
globalThis.errosDoApp = [];
globalThis.__registrarErro = (tipo, msg) => { globalThis.errosDoApp.push(`${tipo}: ${msg}`); };
