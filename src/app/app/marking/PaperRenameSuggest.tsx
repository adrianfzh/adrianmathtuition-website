'use client';
// ✏️ "This looks like 2024 A Math Paper 1." [Rename to Paper 1] — one line on a paper
// handed in under one paper's name whose working is another's (12 Oct 2026, Adrian:
// "just give a suggestion to user … tap to rename? … short and simple"). The paper is
// already marked against the right one; this only fixes the name on the card, through
// the student's own rename door (clearing their label shows the app's name for it).
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PaperRenameSuggest({ runId, label, button }: { runId: string; label: string; button: string }) {
  const router = useRouter();
  const [state, setState] = useState<'ask' | 'busy' | 'gone'>('ask');
  const [err, setErr] = useState<string | null>(null);

  async function rename() {
    setState('busy'); setErr(null);
    try {
      const r = await fetch('/api/portal/marking/label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, label: '' }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok || d.error) throw new Error(d.error || 'Something went wrong — try again.');
      setState('gone');
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setState('ask');
    }
  }

  if (state === 'gone') return null;
  return (
    <div className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-2xl px-3 py-2 flex flex-wrap items-center gap-2">
      <span>This looks like <span className="font-semibold">{label}</span>.</span>
      <button type="button" disabled={state === 'busy'} onClick={rename}
        className="rounded-full bg-navy px-3 py-1 font-semibold text-white disabled:opacity-50">
        {state === 'busy' ? 'One moment…' : button}
      </button>
      {err && <span className="w-full text-red-700">{err}</span>}
    </div>
  );
}
