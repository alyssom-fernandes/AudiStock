// ================================================================
//  AudiStock — js/supabaseClient.js
// ================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = 'https://qqrcqjaqbfodwgskztvf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vNiX8UtjrXR4AdcUr-5jyA_4oYwIEEk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
  },
});

export default supabase;
