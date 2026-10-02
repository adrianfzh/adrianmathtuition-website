'use client';
// Remove a practice sheet that is queued or still being written
// (SPEC-PRACTICE-PHOTO §14). The route cancels the sheet job and takes the
// Writing… row off the list; a sheet already delivered cannot be removed here.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalFetch, portalMessage } from '@/lib/portal-fetch';

export default function RemoveSheetButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function remove() {
    if (busy) return;
    if (!window.confirm('Remove this sheet? Its photos are dropped and the day’s allowance is freed.')) return;
    setBusy(true); setErr(null);
    try {
      await portalFetch('/api/portal/practice/sheet', { json: { action: 'remove', id }, fallback: 'Could not remove it — try again.' });
      router.refresh();
    } catch (e) {
      setErr(portalMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 flex items-center justify-end gap-2">
      {err && <span className="text-[11px] text-red-600">{err}</span>}
      <button type="button" onClick={remove} disabled={busy}
        className="text-xs font-semibold text-gray-500 underline underline-offset-2 disabled:opacity-50">
        {busy ? 'Removing…' : 'Remove'}
      </button>
    </div>
  );
}
