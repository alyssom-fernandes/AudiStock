// ================================================================
//  AudiStock — js/offline.js
//  Contagem sem internet: os registros ficam numa fila no aparelho
//  (IndexedDB) e são enviados quando há conexão.
//
//  O envio acontece ao abrir a página (se já houver internet), quando a
//  rede volta, quando a aba volta a ficar visível e, enquanto houver
//  fila, a cada 30 segundos. A demonstração usa uma fila separada, para
//  nunca misturar contagens fictícias com as de verdade.
//
//  USO:
//    import { registrarOffline, initOfflineSync, isOnline } from './offline.js';
// ================================================================

import { registrarContagem } from './contagem.js';
import { showToast } from './ui.js';
import { demoAtivo } from './demo.js';

const DB_NAME    = demoAtivo() ? 'audistock-offline-demo' : 'audistock-offline';
const DB_VERSION = 1;
const STORE      = 'fila_contagem';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('auditoria_id', 'auditoria_id', { unique: false });
      store.createIndex('status',       'status',       { unique: false });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function _todos(db) {
  return new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => resolve([]);
  });
}

export function isOnline() {
  return navigator.onLine;
}

// ─────────────────────────────────────────────────────────────
//  registrarOffline({ auditoriaId, produtoId, quantidade, usuarioId, acao, produto })
//  Guarda na fila. Retorna o id local.
// ─────────────────────────────────────────────────────────────
export async function registrarOffline({ auditoriaId, produtoId, quantidade, usuarioId, acao = 'somar', produto = null }) {
  const db = await openDB();
  const id = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).add({
      auditoria_id: auditoriaId, produto_id: produtoId, quantidade, usuario_id: usuarioId,
      acao, status: 'pending', criado_em: new Date().toISOString(),
      // Só para mostrar na lista enquanto o registro não sobe
      produto: produto ? { codigo: produto.codigo_produto, nome: produto.nome_produto, un: produto.unidade_medida } : null,
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  _avisarMudanca();
  return id;
}

// ─────────────────────────────────────────────────────────────
//  contarPendentes(auditoriaId?) → quantos registros ainda não subiram
// ─────────────────────────────────────────────────────────────
export async function contarPendentes(auditoriaId = null) {
  const itens = await _todos(await openDB());
  return itens.filter(i => i.status === 'pending' && (!auditoriaId || i.auditoria_id === auditoriaId)).length;
}

// Tudo o que está no aparelho: 'pending' (esperando envio) e 'error'
// (recusado pelo servidor; fica guardado até a pessoa descartar)
export async function listarFila(auditoriaId = null) {
  const itens = await _todos(await openDB());
  return itens.filter(i => !auditoriaId || i.auditoria_id === auditoriaId).sort((a, b) => a.id - b.id);
}

export async function descartarRegistro(id) {
  const db = await openDB();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
  _avisarMudanca();
}

// ─────────────────────────────────────────────────────────────
//  sincronizar() — envia a fila, na ordem em que foi gravada
// ─────────────────────────────────────────────────────────────
let _enviando = null;
export function sincronizar() {
  if (!isOnline()) return Promise.resolve({ ok: 0, erros: 0 });
  _enviando ??= (async () => {
    const db = await openDB();
    const pendentes = (await _todos(db)).filter(i => i.status === 'pending').sort((a, b) => a.id - b.id);
    let ok = 0, erros = 0;
    for (const item of pendentes) {
      try {
        await registrarContagem({ auditoriaId: item.auditoria_id, produtoId: item.produto_id, quantidade: item.quantidade, usuarioId: item.usuario_id, acao: item.acao });
        await _remover(db, item.id);
        ok++;
      } catch (err) {
        // Sem rede de novo: para e tenta depois. Recusa do servidor: guarda como erro.
        if (!isOnline() || /fetch|network/i.test(err.message)) break;
        await _marcarErro(db, item.id, err.message);
        erros++;
      }
    }
    return { ok, erros };
  })().finally(() => { _enviando = null; });
  return _enviando;
}

// ─────────────────────────────────────────────────────────────
//  initOfflineSync(aoMudar, { auditoriaId })
//  Mostra a faixa de conexão, envia a fila sempre que possível e chama
//  aoMudar({ online, pendentes, enviados }) a cada mudança.
// ─────────────────────────────────────────────────────────────
let _aoMudarGlobal = null;
function _avisarMudanca() { _aoMudarGlobal?.(); }

export function initOfflineSync(aoMudar, { auditoriaId = null } = {}) {
  const bar = document.getElementById('offlineBar');
  let timer = null;

  async function atualizar(enviados = 0) {
    const online = isOnline();
    const pendentes = await contarPendentes(auditoriaId);
    if (bar) {
      bar.classList.toggle('visible', !online || pendentes > 0);
      bar.innerHTML = !online
        ? `<span class="offline-dot"></span> Sem internet. ${pendentes ? `${pendentes} ${pendentes === 1 ? 'contagem guardada' : 'contagens guardadas'} neste aparelho; o envio é automático quando a rede voltar.` : 'As próximas contagens ficam guardadas neste aparelho.'}`
        : `<span class="offline-dot"></span> Enviando ${pendentes} ${pendentes === 1 ? 'contagem guardada' : 'contagens guardadas'}…`;
    }
    clearInterval(timer);
    if (online && pendentes) timer = setInterval(enviar, 30000);
    aoMudar?.({ online, pendentes, enviados });
  }

  async function enviar() {
    if (!isOnline() || !(await contarPendentes())) return atualizar();
    await atualizar();
    const r = await sincronizar();
    if (r.ok) showToast(`${r.ok} ${r.ok === 1 ? 'contagem guardada foi enviada' : 'contagens guardadas foram enviadas'}.`, 'success');
    if (r.erros) showToast(`${r.erros} ${r.erros === 1 ? 'contagem foi recusada pelo servidor' : 'contagens foram recusadas pelo servidor'}. Elas aparecem na lista como “Não enviada”.`, 'error', 9000);
    await atualizar(r.ok + r.erros);
  }

  _aoMudarGlobal = () => atualizar();
  window.addEventListener('online', enviar);
  window.addEventListener('offline', () => atualizar());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') enviar(); });
  enviar();
  return { enviar, atualizar };
}

function _remover(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
}

function _marcarErro(db, id, erro) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => { if (get.result) store.put({ ...get.result, status: 'error', erro }); };
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
}
