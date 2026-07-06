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
      className="text-sm text-gray-500 hover:text-navy transition-colors"
    >
      Sign out
    </button>
  );
}
