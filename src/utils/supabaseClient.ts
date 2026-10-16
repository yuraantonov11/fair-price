import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isPublicBackendKey } from '@/utils/backendConfig';

let client: SupabaseClient | undefined;

// Lazy creation lets background return a useful configuration error to the UI.
export function getSupabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || /your-project|your-anon/.test(`${url} ${key}`)) {
    throw new Error('Supabase configuration is missing or contains placeholders');
  }
  if (!isPublicBackendKey(key)) throw new Error('Supabase configuration must use a public anon/publishable key');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')) {
    throw new Error('Supabase URL must use HTTPS');
  }
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) },
  });
  return client;
}
