import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}
function getAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
}
function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

// Public client — respects RLS (anon key)
export function getSupabase(): SupabaseClient {
  if (!_supabase) _supabase = createClient(getUrl(), getAnonKey());
  return _supabase;
}

// Admin client — bypasses RLS (service role key), server-only
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) _supabaseAdmin = createClient(getUrl(), getServiceKey() || getAnonKey());
  return _supabaseAdmin;
}
