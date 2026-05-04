import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Oturumu tarayıcı localStorage'da sakla — yenileme sonrası kaybolmasın
    persistSession: true,
    // Token süresi dolmadan önce otomatik yenile
    autoRefreshToken: true,
    // Hash fragment'tan oturum bilgisini algıla (OAuth redirect sonrası)
    detectSessionInUrl: true,
  },
});
