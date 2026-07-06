'use client';

// Browser-side Supabase client (anon key, cookie-based session).
// Use in client components for signInWithPassword, signInWithOAuth (Google),
// signOut, resetPasswordForEmail, updateUser, onAuthStateChange.
import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
