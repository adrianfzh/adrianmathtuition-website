'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-client';

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await getSupabaseBrowser().auth.signOut();
        router.replace('/login');
      }}
      aria-label="Sign out"
      title="Sign out"
      className="text-gray-500 hover:text-navy transition-colors inline-flex items-center justify-center w-7 h-8 -mr-1 rounded-full hover:bg-navy/5"
    >
      {/* The usual "log out" sign — a door with an arrow leaving it (Adrian, 7 Oct 2026:
          "replace with an easily recognizable icon", so the bar has room for the word
          Suggestions on a phone). */}
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  );
}
