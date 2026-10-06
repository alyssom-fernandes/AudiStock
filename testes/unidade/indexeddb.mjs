// ================================================================
//  IndexedDB mínimo, em memória, para a fila sem internet (js/offline.js)
//  rodar no Node. Só o que a fila usa: abrir com versão e criação do
//  store (keyPath com autoIncrement), transação com getAll, get, add,
//  put e delete, oncomplete da transação e deleteDatabase. Importe
//  depois de ambiente.mjs e antes de qualquer módulo de js/.
// ================================================================

const bancos = new Map();   // nome → { stores: Map(nome → { keyPath, seq, linhas: Map }) }
const depois = fn => setTimeout(fn, 0);
const copia = v => (v === undefined ? undefined : structuredClone(v));

class Pedido {
  constructor() { this.result = undefined; this.error = null; this.onsuccess = null; this.onerror = null; }
}

class Transacao {
  constructor() { this.pendentes = 0; this.oncomplete = null; this.onerror = null; this.fim = false; }
  // Cada pedido roda em seguida; a transação termina quando nenhum ficou
  // pendente, nem foi criado pelos callbacks dos anteriores
  pedir(fn) {
    const p = new Pedido();
    this.pendentes++;
    depois(() => {
      try { p.result = fn(); p.onsuccess?.({ target: p }); }
      catch (e) { p.error = e; p.onerror?.({ target: p }); }
      if (--this.pendentes === 0) depois(() => { if (!this.pendentes && !this.fim) { this.fim = true; this.oncomplete?.(); } });
    });
    return p;
  }
}

class Store {
  constructor(dados, tx) { this.d = dados; this.tx = tx; }
  getAll() { return this.tx.pedir(() => [...this.d.linhas.values()].map(copia)); }
  get(id) { return this.tx.pedir(() => copia(this.d.linhas.get(id))); }
  add(v) { return this.tx.pedir(() => { const id = ++this.d.seq; this.d.linhas.set(id, { ...copia(v), [this.d.keyPath]: id }); return id; }); }
  put(v) { return this.tx.pedir(() => { const id = v[this.d.keyPath]; this.d.linhas.set(id, copia(v)); return id; }); }
  delete(id) { return this.tx.pedir(() => { this.d.linhas.delete(id); }); }
  createIndex() {}
}

function conexao(banco) {
  return {
    onversionchange: null, onclose: null,
    createObjectStore(nome, { keyPath = 'id' } = {}) {
      const d = { keyPath, seq: 0, linhas: new Map() };
      banco.stores.set(nome, d);
      return new Store(d, new Transacao());
    },
    transaction(nome) {
      const tx = new Transacao();
      return Object.assign(tx, { objectStore: n => new Store(banco.stores.get(n ?? nome), tx) });
    },
    close() {},
  };
}

globalThis.indexedDB = {
  open(nome) {
    const p = new Pedido();
    depois(() => {
      let banco = bancos.get(nome);
      const novo = !banco;
      if (novo) { banco = { stores: new Map() }; bancos.set(nome, banco); }
      const db = conexao(banco);
      if (novo) p.onupgradeneeded?.({ target: { result: db } });
      p.result = db;
      p.onsuccess?.({ target: p });
    });
    return p;
  },
  deleteDatabase(nome) { bancos.delete(nome); const p = new Pedido(); depois(() => p.onsuccess?.({ target: p })); return p; },
};

// Para os testes conferirem o que ficou no aparelho
export const bancosDoAparelho = () => [...bancos.keys()];
