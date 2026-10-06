// ================================================================
//  AudiStock — js/offline.js
//  Contagem sem internet: os registros ficam numa fila no aparelho
//  (IndexedDB) e são enviados quando há conexão.
//
//  O envio acontece ao abrir a página (se já houver internet), quando a
//  rede volta, quando a aba volta a ficar visível e, enquanto houver
//  fila, a cada 30 segundos.
//
//  Garantias:
//  * cada registro leva um id gerado no aparelho; o banco não aplica o
//    mesmo id duas vezes (resposta perdida, a mesma fila em duas abas);
//  * só uma aba envia por vez (Web Locks);
//  * só sobem os registros de quem está logado; os de outra pessoa
//    esperam o login dela;
//  * falha de rede, servidor fora do ar ou sessão vencida não descartam
//    nada: o registro fica na fila e é enviado depois. Só uma recusa de
//    verdade (permissão, auditoria encerrada) vira "Não enviada".
//
//  A demonstração usa uma fila separada, para nunca misturar contagens
//  fictícias com as de verdade.
// ================================================================

import { registrarContagem } from './contagem.js';
import { getPerfil } from './auth.js';
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

// Falha de rede em qualquer navegador (Chrome, Firefox, Safari/iOS) ou tempo esgotado
export function ehErroDeRede(err) {
  return /failed to fetch|networkerror|network request failed|load failed|fetch|timed? ?out|aborted/i.test(String(err?.message ?? err ?? ''));
}

// Recusa definitiva do banco: tentar de novo não muda o resultado
function _recusaDefinitiva(err) {
  return ['42501', '22023', '23505', '23503', 'AS001'].includes(err?.code)
    || /row-level security|não está em andamento|não é da empresa|permission denied/i.test(String(err?.message ?? ''));
}

// ─────────────────────────────────────────────────────────────
//  registrarOffline({ auditoriaId, produtoId, quantidade, usuarioId, acao, produto, idCliente })
//  Guarda na fila. 'novo' vira 'somar': quem contou sem internet não viu
//  o que os outros aparelhos gravaram nesse meio-tempo, e somar nunca
//  apaga a contagem de ninguém. Retorna o id local.
// ─────────────────────────────────────────────────────────────
export async function registrarOffline({ auditoriaId, produtoId, quantidade, usuarioId, acao = 'somar', produto = null, idCliente = null }) {
  const db = await openDB();
  const id = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).add({
      auditoria_id: auditoriaId, produto_id: produtoId, quantidade, usuario_id: usuarioId,
      acao: acao === 'novo' ? 'somar' : acao, status: 'pending', criado_em: new Date().toISOString(),
      // O mesmo id de uma tentativa que falhou pela rede: se ela chegou ao
      // banco, o reenvio não soma de novo
      id_cliente: idCliente ?? crypto.randomUUID(),
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
//  resumoFila(auditoriaId?) → { meus, deOutros, comErro }
//  meus: esperando envio, de quem está logado; deOutros: esperando o
//  login de outra pessoa; comErro: recusados pelo servidor.
// ─────────────────────────────────────────────────────────────
export async function resumoFila(auditoriaId = null) {
  const eu = getPerfil()?.id;
  const itens = (await _todos(await openDB())).filter(i => !auditoriaId || i.auditoria_id === auditoriaId);
  const pend = itens.filter(i => i.status === 'pending');
  return {
    meus: pend.filter(i => !eu || i.usuario_id === eu).length,
    deOutros: eu ? pend.filter(i => i.usuario_id !== eu).length : 0,
    comErro: itens.filter(i => i.status === 'error').length,
  };
}

// Quantos registros ainda não subiram (de qualquer pessoa)
export async function contarPendentes(auditoriaId = null) {
  const itens = await _todos(await openDB());
  return itens.filter(i => i.status === 'pending' && (!auditoriaId || i.auditoria_id === auditoriaId)).length;
}

// Tudo o que está no aparelho: 'pending' (esperando envio) e 'error'
// (recusado pelo servidor; fica guardado até a pessoa descartar ou
// mandar de novo)
export async function listarFila(auditoriaId = null) {
  const itens = await _todos(await openDB());
  return itens.filter(i => !auditoriaId || i.auditoria_id === auditoriaId).sort((a, b) => a.id - b.id);
}

export async function descartarRegistro(id) {
  await _alterar(id, null);
  _avisarMudanca();
}

// Um registro recusado volta para a fila (ex.: a permissão foi corrigida)
export async function tentarDeNovo(id) {
  await _alterar(id, item => ({ ...item, status: 'pending', erro: null }));
  _avisarMudanca();
}

// ─────────────────────────────────────────────────────────────
//  sincronizar() — envia a fila de quem está logado, na ordem em que
//  foi gravada. Só uma aba por vez.
// ─────────────────────────────────────────────────────────────
let _enviando = null;
export function sincronizar() {
  if (!isOnline()) return Promise.resolve({ ok: 0, erros: 0 });
  const enviar = async () => {
    const db = await openDB();
    const eu = getPerfil()?.id;
    const pendentes = (await _todos(db))
      .filter(i => i.status === 'pending' && (!eu || i.usuario_id === eu))
      .sort((a, b) => a.id - b.id);
    let ok = 0, erros = 0;
    for (const item of pendentes) {
      try {
        await registrarContagem({
          auditoriaId: item.auditoria_id, produtoId: item.produto_id, quantidade: item.quantidade,
          usuarioId: item.usuario_id, acao: item.acao === 'novo' ? 'somar' : item.acao, idCliente: item.id_cliente ?? null,
        });
        await _alterar(item.id, null);
        ok++;
      } catch (err) {
        if (_recusaDefinitiva(err)) {
          await _alterar(item.id, x => ({ ...x, status: 'error', erro: err.message }));
          erros++;
          continue;
        }
        break;   // rede, servidor fora do ar, sessão vencida: tenta depois, sem perder nada
      }
    }
    return { ok, erros };
  };
  _enviando ??= (navigator.locks?.request ? navigator.locks.request('audistock-fila', enviar) : enviar())
    .finally(() => { _enviando = null; });
  return _enviando;
}

// ─────────────────────────────────────────────────────────────
//  initOfflineSync(aoMudar, { auditoriaId })
//  Mostra a faixa de conexão, envia a fila sempre que possível e chama
//  aoMudar({ online, pendentes, deOutros, comErro, enviados }) a cada mudança.
// ─────────────────────────────────────────────────────────────
let _aoMudarGlobal = null;
function _avisarMudanca() { _aoMudarGlobal?.(); }

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function initOfflineSync(aoMudar, { auditoriaId = null } = {}) {
  const bar = document.getElementById('offlineBar');
  let timer = null;

  async function atualizar(enviados = 0) {
    const online = isOnline();
    const { meus: pendentes, deOutros, comErro } = await resumoFila(auditoriaId);
    if (bar) {
      const outros = deOutros ? ` ${plural(deOutros, 'contagem de outra pessoa espera', 'contagens de outra pessoa esperam')} o login dela neste aparelho.` : '';
      bar.classList.toggle('visible', !online || pendentes > 0 || deOutros > 0);
      bar.innerHTML = !online
        ? `<span class="offline-dot"></span> Sem internet. ${pendentes ? `${plural(pendentes, 'contagem guardada', 'contagens guardadas')} neste aparelho; o envio é automático quando a rede voltar.` : 'As próximas contagens ficam guardadas neste aparelho.'}${outros}`
        : pendentes ? `<span class="offline-dot"></span> Enviando ${plural(pendentes, 'contagem guardada', 'contagens guardadas')}…${outros}`
        : `<span class="offline-dot"></span>${outros}`;
    }
    clearInterval(timer);
    if (online && pendentes) timer = setInterval(enviar, 30000);
    aoMudar?.({ online, pendentes, deOutros, comErro, enviados });
  }

  async function enviar() {
    if (!isOnline() || !(await resumoFila()).meus) return atualizar();
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

// Altera (ou apaga, com fn nula) um registro da fila
function _alterar(id, fn) {
  return openDB().then(db => new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (!fn) store.delete(id);
    else {
      const get = store.get(id);
      get.onsuccess = () => { if (get.result) store.put(fn(get.result)); };
    }
    tx.oncomplete = resolve; tx.onerror = resolve;
  }));
}
