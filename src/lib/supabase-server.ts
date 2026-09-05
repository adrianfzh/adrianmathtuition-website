// Server-side Supabase clients.
//
// createSupabaseServer() — anon key + the request's cookies; respects RLS as
// the logged-in user. Use in server components, route handlers, server actions.
//
// createServiceClient() — service-role key, bypasses RLS. ONLY for trusted
// backend logic (admin invite flow, cron). Never import into client code.
//
// ── RLS posture of every table the portal touches (Phase G audit 2026-08-28) ─
// The browser NEVER queries tables directly: the only client-side Supabase
// usage is auth (signIn/signOut/updateUser/getUser — see lib/supabase-client
// call sites). Two access classes server-side:
//
// User-scoped (anon key + session JWT; RLS self-scoped `auth.uid()` policies;
// verified in the 2026-08-20 pg_policies sweep):
//   portal_accounts       own row only (id = auth.uid())
//   student_attempts      own rows only (user_id = auth.uid())
//
// Service-role ONLY (RLS enabled, NO anon/authenticated policies — the anon
// key reads zero rows; every query goes through createServiceClient /
// getSupabaseAdmin with the ownership filter derived from the session, never
// from client input — lib/portal-auth.portalIdentity is the one key):
//   paper_marking_runs          student_id = identity, + released_at gate
//   notebook_entries            airtable_student_id = identity
//   portal_notes                airtable_student_id = identity (+ Blob images)
//   portal_requests             airtable_student_id = identity
//   portal_generated_papers     airtable_student_id = identity
//   portal_generation_log       airtable_student_id = identity
//   portal_assignments          airtable_student_id = identity
//   notebook_mistakes           airtable_student_id = identity (the fading mistakes list, SPEC-PORTAL-V2 §6)
//   portal_push_subscriptions   airtable_student_id = identity
//   portal_passes               account_id = account.id (the money gate)
//   portal_invite_tokens        token-addressed (activate flow) / admin
//   weakness_tags, unit_events, recall_messages   user_id = auth uid
//
// Shared teaching content, service-role reads with visibility gates (level/
// subject scoping, approved-only for students — no per-student rows at all):
//   questions (solutions stripped or reveal-gated), learning_units,
//   lesson_cards, lessons, kb_entries, topic_meta, topic_spine,
//   method_templates, formula_ref
//
// Any NEW portal table must pick a class: either self-scoped RLS policies, or
// RLS enabled with no policies + service-role queries that carry the identity
// predicate IN THE QUERY (not filtered after the fetch).
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
