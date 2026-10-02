// ================================================================
//  AudiStock — js/erros.js
//  Toda falha não tratada fica gravada no próprio navegador, com
//  página, usuário e hora, e aparece em Configurações › Registro de erros.
//
//  Script clássico (não módulo), carregado antes de todos os outros
//  para que um erro na carga deles também fique registrado.
//  No console: errosRegistrados() lista, errosLimpar() apaga.
//
//  Nada aqui pode lançar erro por sua vez: daí os try/catch e o
//  limite de registros.
// ================================================================
(function () {
  const CHAVE  = 'audistock-erros';
  const LIMITE = 30;
  let avisado  = false;

  function errosRegistrados() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); }
    catch (_) { return []; }
  }

  function errosLimpar() {
    try { localStorage.removeItem(CHAVE); } catch (_) {}
    document.dispatchEvent(new CustomEvent('audistock:erros'));
  }

  function registrar(tipo, msg, detalhe) {
    try {
      const lista = errosRegistrados();
      lista.unshift({
        ts: new Date().toISOString(),
        tipo,
        msg: String(msg || '').slice(0, 300),
        detalhe: String(detalhe || '').slice(0, 800),
        pagina: location.pathname.split('/').pop() + location.search,
        usuario: window.__usuarioAtual?.nome || '—',
        demo: (function () { try { return !!sessionStorage.getItem('audistock-demo'); } catch (_) { return false; } })(),
      });
      localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, LIMITE)));
      document.dispatchEvent(new CustomEvent('audistock:erros'));
      // Um aviso por página: quem usa precisa saber que algo falhou,
      // mas um aviso por erro em laço deixaria a tela inutilizável.
      // 'tratado' = a tela já mostrou a mensagem dela; aqui só guarda o detalhe
      if (!avisado && tipo !== 'tratado' && typeof window.__avisarErro === 'function') {
        avisado = true;
        window.__avisarErro();
      }
    } catch (_) { /* armazenamento cheio ou bloqueado: não há o que fazer */ }
  }

  window.addEventListener('error', e => {
    // Falha ao carregar <script>/<link> chega aqui sem mensagem
    if (!e.message && e.target && e.target !== window) {
      if (e.target.dataset && e.target.dataset.opcional) return;   // quem carregou já trata a falha
      registrar('recurso', 'Falha ao carregar ' + (e.target.src || e.target.href || e.target.tagName), '');
      return;
    }
    const onde = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : '';
    registrar('erro', e.message, [onde, e.error && e.error.stack].filter(Boolean).join('\n'));
  }, true);

  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    registrar('promessa', (r && (r.message || r.code)) || String(r), r && r.stack);
  });

  window.errosRegistrados = errosRegistrados;
  window.errosLimpar      = errosLimpar;
  window.__registrarErro  = registrar;
})();
