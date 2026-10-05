'use client';
// The student's door to a Practice Again sheet (8 Sep 2026): one button on
// their marked paper, then a line that says where the sheet is. The server
// page works out the starting state from the paper's sheet jobs; a request
// posts to /api/portal/practice-again/request and moves it to "queued".
import { useState } from 'react';
import { NOTE_MAX, topicList, type LostTopic } from '@/lib/practice-again-topics';

export type PracticeAgainState =
  | 'none'      // no sheet, nothing in flight — offer the button
  | 'queued'    // being written on the Mac
  | 'checking'  // written, not yet with the student (held for Adrian, or on his clock)
  | 'nothing';  // the worker found nothing worth practising

const CARD = 'rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4';

// 🎯 Since 5 Oct 2026 the student picks the topics (Adrian: "allow them to say the topic
// they want, instead of generating all topics for the entire pdf"): the topics this
// paper lost marks on, most first, the top one ticked; an optional note. A paper whose
// marking named no topic shows the plain button, as before.
export default function PracticeAgainRequest({ runId, state: initial, topics = [], askedTopics = null }: {
  runId: string; state: PracticeAgainState;
  /** The topics this paper lost marks on (lib/practice-again-topics lostTopics). */
  topics?: LostTopic[];
  /** What an in-flight request asked for, to say so in the queued line. */
  askedTopics?: string[] | null;
}) {
  const [state, setState] = useState<PracticeAgainState>(initial);
  const [picked, setPicked] = useState<string[]>(topics.length ? [topics[0].topic] : []);
  const [note, setNote] = useState('');
  const [sentTopics, setSentTopics] = useState<string[] | null>(askedTopics);
  const toggle = (t: string) => setPicked(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function request() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/portal/practice-again/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topics.length ? { runId, topics: picked, note: note.trim() || undefined } : { runId }),
      });
      const d = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) { setErr(d.error || 'Could not send the request — try again in a moment.'); return; }
      setSentTopics(topics.length ? picked : null);
      setState('queued');
    } catch {
      setErr('Could not send the request — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'queued') {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Practice Again is being written for this paper</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">
          {sentTopics?.length ? `Worked examples and practice on ${topicList(sentTopics)}.` : 'A sheet with worked examples and practice on what went wrong here.'} You’ll get a message when it’s ready — usually within the day.
        </p>
      </section>
    );
  }
  if (state === 'checking') {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Your Practice Again sheet is written</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">Your tutor is checking it before it comes to you. You’ll get a message when it does.</p>
      </section>
    );
  }
  if (state === 'nothing') {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Nothing here needs another go</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">The marks you lost on this paper don’t point at a gap worth a practice sheet. Well done.</p>
      </section>
    );
  }
  if (topics.length) {
    return (
      <section id="practice-again" className={CARD}>
        <p className="text-sm font-semibold text-emerald-900">📘 Want practice on what went wrong here?</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">Pick the topics for your Practice Again sheet — worked examples plus practice.</p>
        <ul className="mt-2.5 space-y-1.5">
          {topics.map(t => {
            const on = picked.includes(t.topic);
            return (
              <li key={t.topic}>
                <label className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer select-none transition-colors ${on ? 'bg-white border-emerald-600' : 'bg-white/60 border-emerald-100'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(t.topic)} className="h-4 w-4 accent-emerald-700 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy leading-snug">{t.topic}</span>
                    <span className="block text-[11.5px] text-gray-500">{t.lost} mark{t.lost === 1 ? '' : 's'} lost · Q{t.questions.join(', Q')}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <input type="text" value={note} onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))} maxLength={NOTE_MAX}
          placeholder="Anything to add? (optional)" aria-label="A note with your request (optional)"
          className="mt-2 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-emerald-600" />
        {err && <p className="text-[12px] text-red-700 mt-1.5">{err}</p>}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-emerald-800/70">{picked.length ? `${picked.length} topic${picked.length === 1 ? '' : 's'} picked` : 'Pick at least one topic'}</p>
          <button type="button" onClick={request} disabled={busy || !picked.length}
            className="shrink-0 text-xs font-semibold bg-emerald-700 text-white rounded-xl px-3 py-2 disabled:opacity-50">
            {busy ? 'Sending…' : 'Request Practice Again'}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section id="practice-again" className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-900">📘 Want practice on what went wrong here?</p>
        <p className="text-[12px] text-emerald-800/80 mt-0.5">Ask for a Practice Again sheet — worked examples plus practice, from this paper. You get a message when it’s ready.</p>
        {err && <p className="text-[12px] text-red-700 mt-1">{err}</p>}
      </div>
      <button type="button" onClick={request} disabled={busy}
        className="shrink-0 text-xs font-semibold bg-emerald-700 text-white rounded-xl px-3 py-2 disabled:opacity-60">
        {busy ? 'Sending…' : 'Request Practice Again'}
      </button>
    </section>
  );
}
