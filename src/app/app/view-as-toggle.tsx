'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Admin-only strip (lib/portal-beta.ts VIEW_AS_STUDENT_COOKIE). Flipping the
// cookie and refreshing re-runs every server gate, so the shell, Home and the
// per-route redirects all switch together. Plain document.cookie on purpose —
// the cookie only removes access, so it is not signed.
export default function ViewAsToggle({ cookieName, viewingAsStudent }: { cookieName: string; viewingAsStudent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  function flip() {
    setBusy(true);
    document.cookie = viewingAsStudent
      ? `${cookieName}=; path=/; max-age=0; SameSite=Lax`
      : `${cookieName}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    router.refresh();
    setTimeout(() => setBusy(false), 800);
  }
  return (
    <div className={`text-[12px] ${viewingAsStudent ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
      <div className="max-w-4xl mx-auto px-4 h-8 flex items-center justify-between gap-3">
        <span className="truncate">
          {viewingAsStudent ? '👁 Viewing as a student — this is exactly what they see.' : '🛠 Admin view (full portal).'}
        </span>
        <button onClick={flip} disabled={busy}
          className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50">
          {viewingAsStudent ? 'Back to admin view' : 'View as student'}
        </button>
      </div>
    </div>
  );
}
