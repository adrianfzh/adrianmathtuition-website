'use client';
// The one student action on a mistakes-list entry: "Corrected" — POST the
// portal API, then refresh the server-rendered Notebook. State lives
// server-side (notebook_mistakes), never here. Same shape as the fix-it
// buttons (app/fixit/fixit-actions.tsx).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export function CorrectedButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr('');
          try {
            await portalFetch('/api/portal/notebook/mistakes', {
              json: { id, action: 'corrected' },
              fallback: 'Could not save that — try again.',
            });
            router.refresh();
          } catch (e) { setErr(portalMessage(e)); } finally { setBusy(false); }
        }}
        className="inline-flex items-center gap-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-emerald-50 disabled:opacity-50 transition-colors"
        title="I have fixed this — it comes back if the marking says otherwise"
      >
        {busy ? 'Saving…' : '✓ Corrected'}
      </button>
      {err && <span className="text-xs text-rose-600 mt-1">{err}</span>}
    </span>
  );
}
