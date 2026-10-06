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
//  * só o que é passageiro (rede, servidor fora do ar, sessão vencida ou
//    perdida) fica esperando na fila. Qualquer outra recusa do banco vira
//    "Não enviada", com o motivo em português, Tentar de novo e Descartar,
//    e não segura os registros seguintes;
//  * um registro descartado enquanto a fila sobe não é enviado.
//
//  A demonstração usa filas separadas, uma por aba, para nunca misturar
//  contagens fictícias com as de verdade nem os bancos de duas abas.
// ================================================================

import { registrarContagem } from './contagem.js';
import { getPerfil } from './auth.js';
import { showToast, mensagemErro } from './ui.js';
import { demoAtivo, filaDaDemo } from './demo.js';

const DB_NAME    = demoAtivo() ? filaDaDemo() : 'audistock-offline';
const DB_VERSION = 1;
const STORE      = 'fila_contagem';

// Uma conexão por página. Se outra aba precisar apagar a fila (entrar de
// novo na demonstração, restaurar os dados), esta fecha a sua e abre outra
// na próxima operação, em vez de travar a exclusão.
let _conexao = null;
function openDB() {
  _conexao ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('auditoria_id', 'auditoria_id', { unique: false });
      store.createIndex('status',       'status',       { unique: false });
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => { db.close(); _conexao = null; };
      db.onclose = () => { _conexao = null; };
      resolve(db);
    };
    req.onerror = (e) => { _conexao = null; reject(e.target.error); };
    req.onblocked = () => { _conexao = null; reject(new Error('A fila deste aparelho está ocupada por outra aba. Feche as outras abas do AudiStock e tente de novo.')); };
  });
  return _conexao;
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

// Falha que passa sozinha: tentar de novo depois resolve. Rede, servidor
// fora do ar ou sobrecarregado (5xx, 408, 429, resposta em HTML de um
// proxy) e sessão vencida ou perdida (401: o pedido foi sem login; sobe
// quando a pessoa entrar de novo).
export function ehFalhaPassageira(err) {
  const msg = String(err?.message ?? err ?? '');
  return ehErroDeRede(err)
    || (Number(err?.status) >= 500 || [401, 408, 429].includes(Number(err?.status)))
    || err?.code === 'PGRST301' || /jwt|token.*expir|permission denied for function/i.test(msg)
    || /service unavailable|bad gateway|gateway time|upstream|unexpected token <|<html/i.test(msg);
}

// O motivo de uma recusa, em português, para a lista da contagem. O texto
// original do banco fica em erro_tecnico (e no console).
export function motivoRecusa(err) {
  const msg = String(err?.message ?? '');
  if (err?.code === '22003' || /numeric field overflow|out of range/i.test(msg)) return 'Quantidade grande demais.';
  if (err?.code === '23514' || /check constraint/i.test(msg)) return 'Quantidade inválida.';
  if (/row-level security|permission denied/i.test(msg)) return 'Sem permissão para contar nesta auditoria: o perfil ou a empresa de quem contou mudou.';
  return mensagemErro(err, 'enviar contagem guardada');
}

// O banco recusou por já ter aplicado este envio (banco sem a trava por
// envio): conta como enviado
const _jaAplicado = err => err?.code === '23505' && /contagens_aplicadas/i.test(String(err?.message ?? ''));

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

// Quantos registros de quem está logado ainda não subiram
export async function contarPendentes(auditoriaId = null) {
  return (await resumoFila(auditoriaId)).meus;
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
//  Retorna { ok, erros, porAuditoria: { [id]: { ok, erros } } }.
// ─────────────────────────────────────────────────────────────
let _enviando = null;
export function sincronizar() {
  if (!isOnline()) return Promise.resolve({ ok: 0, erros: 0, porAuditoria: {} });
  const enviar = async () => {
    const db = await openDB();
    const eu = getPerfil()?.id;
    const pendentes = (await _todos(db))
      .filter(i => i.status === 'pending' && (!eu || i.usuario_id === eu))
      .sort((a, b) => a.id - b.id);
    let ok = 0, erros = 0;
    const porAuditoria = {};
    const contar = (item, campo) => { (porAuditoria[item.auditoria_id] ??= { ok: 0, erros: 0 })[campo]++; };
    for (const item of pendentes) {
      // Descartado (ou já resolvido em outra aba) depois que a lista foi lida
      const atual = await _ler(item.id);
      if (atual?.status !== 'pending') continue;
      try {
        await registrarContagem({
          auditoriaId: item.auditoria_id, produtoId: item.produto_id, quantidade: item.quantidade,
          usuarioId: item.usuario_id, acao: item.acao === 'novo' ? 'somar' : item.acao, idCliente: item.id_cliente ?? null,
        });
        await _alterar(item.id, null);
        ok++; contar(item, 'ok');
      } catch (err) {
        if (_jaAplicado(err)) { await _alterar(item.id, null); ok++; contar(item, 'ok'); continue; }
        if (ehFalhaPassageira(err)) break;   // tenta depois, sem perder nada
        await _alterar(item.id, x => ({ ...x, status: 'error', erro: motivoRecusa(err), erro_tecnico: err.message }));
        erros++; contar(item, 'erros');
      }
    }
    return { ok, erros, porAuditoria };
  };
  _enviando ??= (navigator.locks?.request ? navigator.locks.request(`audistock-fila:${DB_NAME}`, enviar) : enviar())
    .finally(() => { _enviando = null; });
  return _enviando;
}

// ─────────────────────────────────────────────────────────────
//  initOfflineSync(aoMudar, { auditoriaId, textoRecusa })
//  Mostra a faixa de conexão, envia a fila sempre que possível e chama
//  aoMudar({ online, pendentes, deOutros, comErro, enviados, recusados })
//  a cada mudança. Os números são os da auditoria aberta; uma recusa de
//  outra auditoria (encerrada nesse meio-tempo, por exemplo) também é
//  avisada, com o link para a contagem dela.
// ─────────────────────────────────────────────────────────────
let _aoMudarGlobal = null;
function _avisarMudanca() { _aoMudarGlobal?.(); }

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function initOfflineSync(aoMudar, { auditoriaId = null, textoRecusa = 'Elas aparecem na lista como “Não enviada”.' } = {}) {
  const bar = document.getElementById('offlineBar');
  let timer = null;

  async function atualizar(enviados = 0, recusados = 0) {
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
    aoMudar?.({ online, pendentes, deOutros, comErro, enviados, recusados });
  }

  async function enviar() {
    if (!isOnline() || !(await resumoFila()).meus) return atualizar();
    await atualizar();
    const r = await sincronizar();
    const aqui = auditoriaId ? (r.porAuditoria[auditoriaId] ?? { ok: 0, erros: 0 }) : r;
    if (aqui.ok) showToast(`${aqui.ok} ${aqui.ok === 1 ? 'contagem guardada foi enviada' : 'contagens guardadas foram enviadas'}.`, 'success');
    if (aqui.erros) showToast(`${aqui.erros} ${aqui.erros === 1 ? 'contagem foi recusada pelo servidor' : 'contagens foram recusadas pelo servidor'}. ${textoRecusa}`, 'error', 9000);
    // Recusas de outras auditorias: sem este aviso, ninguém ficaria sabendo
    if (auditoriaId) {
      for (const [outra, n] of Object.entries(r.porAuditoria)) {
        if (outra === auditoriaId || !n.erros) continue;
        showToast(`${n.erros} ${n.erros === 1 ? 'contagem guardada de outra auditoria foi recusada' : 'contagens guardadas de outra auditoria foram recusadas'} pelo servidor.`, 'error', 12000,
          { acao: { href: `contagem.html?id=${encodeURIComponent(outra)}`, texto: 'Ver o motivo' } });
      }
    }
    await atualizar(aqui.ok, aqui.erros);
  }

  _aoMudarGlobal = () => atualizar();
  window.addEventListener('online', enviar);
  window.addEventListener('offline', () => atualizar());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') enviar(); });
  enviar();
  return { enviar, atualizar };
}

function _ler(id) {
  return openDB().then(db => new Promise((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  }));
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
