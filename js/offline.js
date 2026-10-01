// ================================================================
//  AudiStock — js/offline.js
//  Suporte a contagem offline com IndexedDB.
//
//  Quando o auditor perde conexão:
//  1. Os registros são salvos no IndexedDB local
//  2. Quando a rede volta, a fila é drenada para o Supabase
//  3. Conflitos são resolvidos pela ação configurada (somar/sobrescrever)
//
//  USO:
//    import { registrarOffline, initOfflineSync, isOnline } from './offline.js';
// ================================================================

import { registrarContagem } from './contagem.js';
import { showToast } from './ui.js';

// ── Versão do banco IndexedDB ──
const DB_NAME    = 'audistock-offline';
const DB_VERSION = 1;
const STORE      = 'fila_contagem';

// ─────────────────────────────────────────────────────────────
//  openDB() → IDBDatabase
// ─────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db    = e.target.result;
      const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('auditoria_id', 'auditoria_id', { unique: false });
      store.createIndex('status',       'status',       { unique: false });
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ─────────────────────────────────────────────────────────────
//  isOnline() → boolean
// ─────────────────────────────────────────────────────────────
export function isOnline() {
  return navigator.onLine;
}

// ─────────────────────────────────────────────────────────────
//  registrarOffline({ auditoriaId, produtoId, quantidade, usuarioId, acao })
//  Salva na fila local quando offline.
// ─────────────────────────────────────────────────────────────
export async function registrarOffline({
  auditoriaId, produtoId, quantidade, usuarioId, acao = 'somar'
}) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    const item = {
      auditoria_id: auditoriaId,
      produto_id:   produtoId,
      quantidade,
      usuario_id:   usuarioId,
      acao,
      status:       'pending',
      criado_em:    new Date().toISOString(),
    };

    const req = store.add(item);
    req.onsuccess = () => resolve(req.result);  // retorna o id local
    req.onerror   = () => reject(req.error);
  });
}

// ─────────────────────────────────────────────────────────────
//  contarPendentes() → número de itens na fila
// ─────────────────────────────────────────────────────────────
export async function contarPendentes() {
  const db = await openDB();

  return new Promise((resolve) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const idx   = store.index('status');
    const req   = idx.count(IDBKeyRange.only('pending'));
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(0);
  });
}

// ─────────────────────────────────────────────────────────────
//  sincronizar()
//  Drena a fila offline para o Supabase.
//  Chamado automaticamente quando a rede volta.
// ─────────────────────────────────────────────────────────────
export async function sincronizar() {
  if (!isOnline()) return { ok: 0, erros: 0 };

  const db      = await openDB();
  const pending = await _listarPendentes(db);

  if (pending.length === 0) return { ok: 0, erros: 0 };

  let ok = 0, erros = 0;

  for (const item of pending) {
    try {
      await registrarContagem({
        auditoriaId: item.auditoria_id,
        produtoId:   item.produto_id,
        quantidade:  item.quantidade,
        usuarioId:   item.usuario_id,
        acao:        item.acao,
      });
      await _marcarStatus(db, item.id, 'synced');
      ok++;
    } catch (err) {
      await _marcarStatus(db, item.id, 'error', err.message);
      erros++;
    }
  }

  return { ok, erros };
}

// ─────────────────────────────────────────────────────────────
//  initOfflineSync()
//  Inicializa os listeners de conectividade.
//  Chame uma vez na inicialização de cada página de contagem.
// ─────────────────────────────────────────────────────────────
export function initOfflineSync(onStatusChange) {
  const bar = document.getElementById('offlineBar');

  async function atualizar() {
    const online    = isOnline();
    const pendentes = await contarPendentes();

    // Atualiza a barra de status
    if (bar) {
      if (!online || pendentes > 0) {
        bar.classList.add('visible');
        bar.innerHTML = !online
          ? `<span class="offline-dot"></span> Sem internet. ${pendentes ? `${pendentes} ${pendentes === 1 ? 'contagem guardada' : 'contagens guardadas'} neste aparelho; o envio é automático quando a rede voltar.` : 'As próximas contagens ficam guardadas neste aparelho.'}`
          : `<span class="offline-dot"></span> Enviando ${pendentes} ${pendentes === 1 ? 'contagem guardada' : 'contagens guardadas'}…`;
      } else {
        bar.classList.remove('visible');
      }
    }

    onStatusChange?.({ online, pendentes });
  }

  window.addEventListener('online', async () => {
    await atualizar();
    const resultado = await sincronizar();
    if (resultado.ok > 0) {
      showToast(`${resultado.ok} ${resultado.ok === 1 ? 'contagem guardada foi enviada' : 'contagens guardadas foram enviadas'}.`, 'success');
    }
    if (resultado.erros > 0) {
      showToast(`${resultado.erros} ${resultado.erros === 1 ? 'contagem não pôde ser enviada' : 'contagens não puderam ser enviadas'}. Confira a lista e registre esses itens de novo.`, 'error', 8000);
    }
    await atualizar();
  });

  window.addEventListener('offline', atualizar);

  // Checa ao iniciar
  atualizar();
}

// ─────────────────────────────────────────────────────────────
//  INTERNO: listar pendentes do IndexedDB
// ─────────────────────────────────────────────────────────────
function _listarPendentes(db) {
  return new Promise((resolve) => {
    const tx    = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const idx   = store.index('status');
    const req   = idx.getAll(IDBKeyRange.only('pending'));
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => resolve([]);
  });
}

function _marcarStatus(db, id, status, erro = null) {
  return new Promise((resolve) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get   = store.get(id);
    get.onsuccess = () => {
      const item  = get.result;
      item.status = status;
      if (erro) item.erro = erro;
      store.put(item);
    };
    tx.oncomplete = resolve;
    tx.onerror    = resolve;
  });
}
