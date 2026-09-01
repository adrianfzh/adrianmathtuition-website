'use client';
// The two student actions on a fix-it step: attest a learn step, or ask for
// another similar question after a miss. Both POST the portal API then refresh
// the server-rendered page — state lives server-side, never here.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export function AttestButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr('');
          try {
            await portalFetch('/api/portal/remediation', {
              json: { action: 'attest', itemId },
              fallback: 'Could not save that — try again.',
            });
            router.refresh();
          } catch (e) { setErr(portalMessage(e)); } finally { setBusy(false); }
        }}
        className="mt-3 inline-flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold rounded-full px-4 py-2 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Saving…' : "✓ Done — I've read it"}
      </button>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </div>
  );
}

export function AnotherSimilarButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr('');
          try {
            const d = await portalFetch<{ assignmentId?: string }>('/api/portal/remediation', {
              json: { action: 'another', itemId },
              fallback: 'Could not get another question — try again.',
            });
            if (d.assignmentId) { window.location.href = `/app/practice?assignment=${d.assignmentId}`; return; }
            router.refresh();
          } catch (e) { setErr(portalMessage(e)); } finally { setBusy(false); }
        }}
        className="mt-2 inline-flex items-center gap-2 bg-white border border-emerald-300 text-emerald-700 text-sm font-semibold rounded-full px-4 py-2 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Finding one…' : '🔁 Try another similar question'}
      </button>
      {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
    </div>
  );
}
