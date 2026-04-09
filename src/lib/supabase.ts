import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url) console.warn('[supabase] SUPABASE_URL not set');

// Public client — respects RLS (anon key)
export const supabase = createClient(url, anonKey);

// Admin client — bypasses RLS (service role key), server-only
export const supabaseAdmin = createClient(url, serviceKey || anonKey);
