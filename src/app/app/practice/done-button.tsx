'use client';
// ✓ Done on a student's OWN Practice item (Found by you · From your photos) —
// Adrian, 1 Oct 2026: "any way for the practices to retire/mark completed?" The
// row goes to status 'completed' (no attempt, no score) and moves under the
// tab's collapsed Done fold. Work Adrian sent gets no button (lib/practice-todo
// studentMayComplete). Mirrors remove-sheet-button.tsx.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export default function DoneButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function complete() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await portalFetch('/api/portal/assignments', { json: { action: 'complete', id }, fallback: 'Could not mark it done — try again.' });
      router.refresh();
    } catch (e) {
      setErr(portalMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 flex items-center justify-end gap-3">
      {err && <span className="text-[11px] text-red-600">{err}</span>}
      <button type="button" onClick={complete} disabled={busy}
        className="text-xs font-semibold text-navy underline underline-offset-2 disabled:opacity-50">
        {busy ? 'Saving…' : '✓ Done'}
      </button>
    </div>
  );
}
