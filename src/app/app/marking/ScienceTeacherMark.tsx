'use client';

// "Your teacher's mark" on a science paper (SPEC-SCIENCE-MARKING.md §Decision
// 10 Sep 2026, rule 7): one number, entered when the teacher returns the paper,
// is one whole-paper calibration row. The card shows the comparison once saved
// and lets the student correct it.
import { useState } from 'react';

export default function ScienceTeacherMark({ runId, ours, existing }: {
  runId: string;
  ours: { awarded: number; max: number };
  existing: { awarded: number; max: number } | null;
}) {
  const [awarded, setAwarded] = useState(existing ? String(existing.awarded) : '');
  const [max, setMax] = useState(String(existing?.max ?? ours.max));
  const [saved, setSaved] = useState<{ awarded: number; max: number; delta: number } | null>(
    existing ? { ...existing, delta: Math.abs(existing.awarded - ours.awarded) } : null,
  );
  const [editing, setEditing] = useState(!existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/portal/science-truth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, awarded, max }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save that.');
      setSaved({ awarded: d.teacher.awarded, max: d.teacher.max, delta: d.delta });
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4 space-y-2">
      <p className="text-sm font-semibold text-orange-900">📏 Your teacher&apos;s mark</p>
      {saved && !editing ? (
        <>
          <p className="text-[13px] text-orange-900/90">
            Teacher <b>{saved.awarded}/{saved.max}</b> · ours <b>{ours.awarded}/{ours.max}</b> ·{' '}
            {saved.delta <= 2 ? <span className="text-emerald-700 font-semibold">within 2 marks ✓</span> : <span className="font-semibold">{saved.delta} marks apart</span>}
          </p>
          <p className="text-[12px] text-orange-800/70">Thank you — every one of these makes the marking better.</p>
          <button type="button" onClick={() => setEditing(true)} className="text-[12px] font-semibold text-orange-900 underline underline-offset-2">Change it</button>
        </>
      ) : (
        <>
          <p className="text-[13px] text-orange-900/90">
            When your teacher returns this paper, enter the total they gave. We compare it with ours to check the marking.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="numeric" min={0} value={awarded} onChange={e => setAwarded(e.target.value)} placeholder="mark"
              aria-label="Teacher's mark"
              className="w-24 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <span className="text-sm text-orange-900/70">out of</span>
            <input
              type="number" inputMode="numeric" min={1} value={max} onChange={e => setMax(e.target.value)}
              aria-label="Out of"
              className="w-20 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button type="button" onClick={save} disabled={busy || awarded.trim() === ''}
              className="ml-auto text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2 disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          {error && <p className="text-[12px] text-rose-700">{error}</p>}
          {saved && <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-orange-800/70 underline underline-offset-2">Keep {saved.awarded}/{saved.max}</button>}
        </>
      )}
    </section>
  );
}
