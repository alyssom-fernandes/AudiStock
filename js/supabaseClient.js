// ================================================================
//  AudiStock — js/supabaseClient.js
//  Na demonstração (?demo=1) o cliente é o de js/demo.js e a
//  biblioteca do Supabase nem chega a ser baixada.
//  Se a biblioteca não carregar (rede bloqueada, CDN fora do ar), o
//  cliente responde a tudo com erro de conexão, e as telas mostram
//  a mensagem em vez de travar.
// ================================================================

import { demoAtivo, criarClienteDemo } from './demo.js';

const SUPABASE_URL      = 'https://qqrcqjaqbfodwgskztvf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vNiX8UtjrXR4AdcUr-5jyA_4oYwIEEk';

export let clienteIndisponivel = false;

let supabase;
if (demoAtivo()) {
  supabase = criarClienteDemo();
} else {
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: false,
      },
    });
  } catch (err) {
    clienteIndisponivel = true;
    window.__registrarErro?.('recurso', 'Falha ao carregar a biblioteca do Supabase', String(err?.message ?? err));
    supabase = _clienteSemConexao();
  }
}

function _clienteSemConexao() {
  const erro = { message: 'Failed to fetch' };       // vira "Sem conexão com o servidor" nas telas
  const resposta = { data: null, count: null, error: erro };
  const cadeia = new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? ok => ok(resposta) : cadeia),
    apply: () => cadeia,
  });
  const falha = async () => ({ data: { user: null, session: null }, error: erro });
  return {
    from: () => cadeia,
    rpc: async () => resposta,
    auth: {
      getSession: async () => ({ data: { session: null }, error: erro }),
      getUser: falha, signInWithPassword: falha, signUp: falha, updateUser: falha,
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
}

export default supabase;
