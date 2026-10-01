// ================================================================
//  AudiStock — js/supabaseClient.js
//  Na demonstração (?demo=1) o cliente é o de js/demo.js e a
//  biblioteca do Supabase nem chega a ser baixada.
// ================================================================

import { demoAtivo, criarClienteDemo } from './demo.js';

const SUPABASE_URL      = 'https://qqrcqjaqbfodwgskztvf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vNiX8UtjrXR4AdcUr-5jyA_4oYwIEEk';

let supabase;
if (demoAtivo()) {
  supabase = criarClienteDemo();
} else {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: false,
    },
  });
}

export default supabase;
