// The Notebook iPad app's sign-in (SPEC-STUDENT-APP.md §0c): a plain anon client, no cookies.
import { createClient } from '@supabase/supabase-js';

export function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase URL / anon key not set');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
