// Server-side Supabase clients.
//
// createSupabaseServer() — anon key + the request's cookies; respects RLS as
// the logged-in user. Use in server components, route handlers, server actions.
//
// createServiceClient() — service-role key, bypasses RLS. ONLY for trusted
// backend logic (admin invite flow, cron). Never import into client code.
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// URL is exposed as NEXT_PUBLIC_SUPABASE_URL locally but only as SUPABASE_URL in
// Vercel (Preview + Production) — fall back so server clients work in every env.
// (Without this, deployed invite/activate/service calls throw "supabaseUrl is
// required" and surface to the client as a generic "Network error".)
function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is not set');
  return url;
}

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server components can't set cookies — safe to ignore here;
            // route handlers and server actions can, and do.
          }
        },
      },
    }
  );
}

export function createServiceClient() {
  // SUPABASE_SECRET_KEY = new-style sb_secret_... key (preferred);
  // SUPABASE_SERVICE_ROLE_KEY = legacy JWT fallback.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY is not set — required for this operation');
  }
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
