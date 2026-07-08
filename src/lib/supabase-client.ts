'use client';

// Browser-side Supabase client (anon key, cookie-based session).
// Use in client components for signInWithPassword, signInWithOAuth (Google),
// signOut, resetPasswordForEmail, updateUser, onAuthStateChange.
import { createBrowserClient } from '@supabase/ssr';

// The project URL is public (sent with every request), so a hardcoded fallback is
// safe and guarantees the browser client builds even where NEXT_PUBLIC_SUPABASE_URL
// isn't set at build time (Vercel scopes only SUPABASE_URL to Preview). Same
// pattern already used in admin/cards-preview.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nempslbewxtlikfzachi.supabase.co';

export function getSupabaseBrowser() {
  return createBrowserClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
