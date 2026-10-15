'use client';
// "Got it back from your teacher?" — the student types the mark the teacher gave (15 Oct 2026,
// lib/humanities-tracking.ts). It lets us check the marker against real school marks.
import { useState } from 'react';

export default function TeacherMark({ runId, total, saved }: { runId: string; total: number | null; saved: { mark: number; total: number } | null }) {
  const [mark, setMark] = useState(saved ? String(saved.mark) : '');
  const [outOf, setOutOf] = useState(saved ? String(saved.total) : total ? String(total) : '');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>(saved ? 'done' : 'idle');
  const [open, setOpen] = useState(false);

  async function save() {
    setState('busy');
    const r = await fetch('/api/portal/humanities/teacher-mark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: runId, mark, total: outOf }),
    }).catch(() => null);
    setState(r?.ok ? 'done' : 'error');
    if (r?.ok) setOpen(false);
  }

  if (state === 'done' && !open) {
    return (
      <p className="text-[13px] text-gray-600 px-1">
        Your teacher gave {mark} out of {outOf}. Thank you.{' '}
        <button type="button" onClick={() => setOpen(true)} className="underline underline-offset-2">Change</button>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm">
        <span className="block text-[14px] font-semibold text-navy">Got it back from your teacher?</span>
        <span className="block text-[12px] text-gray-500">Tell us the mark. It helps us mark more like your school.</span>
      </button>
    );
  }
  const input = 'w-16 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-[15px] text-navy text-center';
  return (
    <div className="bg-white rounded-3xl px-4 py-3 border border-black/5 shadow-sm space-y-2">
      <p className="text-[14px] font-semibold text-navy">The mark your teacher gave</p>
      <div className="flex items-center gap-2 text-[14px] text-gray-700">
        <input type="number" inputMode="decimal" min={0} step={0.5} value={mark} onChange={e => setMark(e.target.value)} className={input} aria-label="Mark" />
        <span>out of</span>
        <input type="number" inputMode="numeric" min={1} max={30} value={outOf} onChange={e => setOutOf(e.target.value)} className={input} aria-label="Out of" />
        <button type="button" onClick={save} disabled={state === 'busy' || mark === '' || outOf === ''}
          className="ml-auto bg-amber-600 text-white rounded-2xl px-4 py-1.5 font-semibold disabled:opacity-50">
          {state === 'busy' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {state === 'error' && <p className="text-[12px] text-rose-700">Check the mark is not more than the total.</p>}
    </div>
  );
}
