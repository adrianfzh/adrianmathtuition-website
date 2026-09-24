'use client';
// Remove a science paper that is still waiting for its day (SPEC-PRACTICE-PHOTO
// §14). Once marking starts the route says 409 and the line shows it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export default function RemoveQueuedScience({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function remove() {
    if (busy) return;
    if (!window.confirm('Remove this paper from the queue? Its photos are deleted.')) return;
    setBusy(true); setErr(null);
    try {
      await portalFetch('/api/portal/science/queue', { json: { action: 'remove', runId }, fallback: 'Could not remove it — try again.' });
      router.refresh();
    } catch (e) {
      setErr(portalMessage(e));
      setBusy(false);
    }
  }
  return (
    <span className="shrink-0 inline-flex flex-col items-end">
      <button type="button" onClick={remove} disabled={busy}
        className="text-xs font-semibold text-teal-800/80 underline underline-offset-2 disabled:opacity-50">
        {busy ? 'Removing…' : 'Remove'}
      </button>
      {err && <span className="text-[11px] text-red-600 max-w-[12rem] text-right">{err}</span>}
    </span>
  );
}
