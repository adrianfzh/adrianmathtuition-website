'use client';

// "Was this useful?" on a science paper (Adrian, 11 Sep 2026): one tap, an
// optional line → POST /api/portal/event {kind:'science:feedback'} → a
// Telegram line to the marking topic. Remembered per paper on this device so
// the card does not ask twice. The student's opinion of the feedback — not
// the truth signal (that is the teacher's mark card above it).
import { useEffect, useState } from 'react';
import { SCIENCE_FEEDBACK_KIND, SCIENCE_FEEDBACK_NOTE_MAX } from '@/lib/science-feedback';

export default function ScienceUseful({ runId }: { runId: string }) {
  const key = `sci_useful_${runId}`;
  const [useful, setUseful] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { if (window.localStorage.getItem(key)) setSent(true); } catch { /* private mode */ }
  }, [key]);

  async function send(verdict: boolean, withNote: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/portal/event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: SCIENCE_FEEDBACK_KIND, detail: { runId, useful: verdict, note: withNote ? note : '' } }),
      });
    } catch { /* best-effort, like every portal event */ }
    try { window.localStorage.setItem(key, verdict ? 'yes' : 'no'); } catch { /* private mode */ }
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <p className="text-center text-[12px] text-gray-500" data-science-useful="sent">Thanks — that goes straight to Adrian.</p>
    );
  }
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 space-y-2" data-science-useful="ask">
      <p className="text-sm font-semibold text-navy">Was this marking useful?</p>
      {useful === null ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setUseful(true)} className="flex-1 text-sm font-semibold rounded-xl border border-black/10 px-3 py-2 hover:bg-emerald-50" data-useful="yes">👍 Yes</button>
          <button type="button" onClick={() => setUseful(false)} className="flex-1 text-sm font-semibold rounded-xl border border-black/10 px-3 py-2 hover:bg-rose-50" data-useful="no">👎 Not really</button>
        </div>
      ) : (
        <>
          <p className="text-[12px] text-gray-500">{useful ? 'Good to know. Anything that would make it better?' : 'Sorry about that. What was off — the marks, the comments, the pages?'}</p>
          <textarea value={note} onChange={e => setNote(e.target.value.slice(0, SCIENCE_FEEDBACK_NOTE_MAX))} rows={2} placeholder="Optional"
            aria-label="Your comment" className="w-full text-sm rounded-xl border border-black/10 bg-[hsl(45,100%,98%)] px-3 py-2 outline-none resize-y" />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => send(useful, false)} disabled={busy} className="text-[12px] font-semibold text-gray-500 rounded-full px-3 py-1 border border-black/10">Skip</button>
            <button type="button" onClick={() => send(useful, true)} disabled={busy} data-useful-send className="text-[12px] font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-full px-3 py-1 disabled:opacity-40">Send</button>
          </div>
        </>
      )}
    </section>
  );
}
