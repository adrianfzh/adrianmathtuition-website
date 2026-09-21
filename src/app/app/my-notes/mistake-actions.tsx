'use client';
// The student's two actions on a mistakes-list entry, on the card face
// (21 Sep 2026, after "my mistakes keep building up with no way of removing
// them"): "I've fixed this" (was "Mark as corrected", folded inside the card —
// nobody had ever tapped it) and "Remove". Both POST the portal API; state
// lives server-side (notebook_mistakes), never here.
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
        title="It comes back on its own if the marking says otherwise"
      >
        {busy ? 'Saving…' : "✓ I've fixed this"}
      </button>
      {err && <span className="text-xs text-rose-600 mt-1">{err}</span>}
    </span>
  );
}

/** "Remove" — no confirmation (their notebook, their call); the row stays in the table for Adrian's view. */
export function RemoveButton({ id, onRemoved }: { id: string; onRemoved?: () => void }) {
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
              json: { id, action: 'removed' },
              fallback: 'Could not remove that — try again.',
            });
            onRemoved?.();
            router.refresh();
          } catch (e) { setErr(portalMessage(e)); } finally { setBusy(false); }
        }}
        className="inline-flex items-center gap-1.5 text-gray-500 rounded-xl px-3 py-1.5 text-[13px] font-semibold hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 transition-colors"
        title="Take this off your list"
      >
        {busy ? 'Removing…' : 'Remove'}
      </button>
      {err && <span className="text-xs text-rose-600 mt-1">{err}</span>}
    </span>
  );
}
