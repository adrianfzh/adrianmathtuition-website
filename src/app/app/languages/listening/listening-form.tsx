'use client';
// One recording and its questions. The student plays it (Section A twice, Section B once — the
// page counts), answers, then Check my answers: POST /api/portal/english/listening marks by the
// key and sends back the answers, where each was heard, and the words of the recording.
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ListeningChecked, PublicListening, PublicListeningQuestion } from '@/lib/english-listening';

const CARD = 'bg-white rounded-3xl border border-black/5 shadow-sm';
type Checked = ListeningChecked & { script: { who: string | null; text: string }[] };
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

function Player({ src, plays, free }: { src: string; plays: number; free: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [used, setUsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const [failed, setFailed] = useState(false);
  const left = Math.max(0, plays - used);
  const can = free || left > 0;

  const start = () => {
    const a = ref.current;
    if (!a || playing || !can) return;
    a.currentTime = 0;
    a.play().then(() => { setPlaying(true); if (!free) setUsed(u => u + 1); }).catch(() => setFailed(true));
  };
  const label = playing ? 'Playing…' : free ? 'Play it again' : used === 0 ? 'Play the recording' : left > 0 ? 'Play it the second time' : 'No plays left';

  return (
    <div className={`${CARD} p-4 space-y-2.5 sticky top-2 z-10`}>
      <audio ref={ref} src={src} preload="auto" onLoadedMetadata={e => setLength(e.currentTarget.duration || 0)}
        onTimeUpdate={e => setAt(e.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onError={() => setFailed(true)} />
      <button type="button" onClick={start} disabled={playing || !can}
        className="w-full rounded-xl bg-violet-600 text-white text-[15px] font-semibold px-4 py-3 disabled:opacity-50">
        <span aria-hidden className="mr-2">{playing ? '🔊' : '▶'}</span>{label}
      </button>
      <div className="h-1.5 rounded-full bg-violet-100 overflow-hidden" aria-hidden>
        <div className="h-full bg-violet-600" style={{ width: `${length ? Math.min(100, (at / length) * 100) : 0}%` }} />
      </div>
      <p className="flex justify-between text-[12px] text-gray-500">
        <span>{clock(at)}{length ? ` of ${clock(length)}` : ''}</span>
        {!free && <span>{plays === 1 ? 'Heard once only' : `Heard twice · ${left} play${left === 1 ? '' : 's'} left`}</span>}
      </p>
      {failed && <p className="text-sm text-red-600">The recording did not play. Check your sound and tap Play again.</p>}
    </div>
  );
}

function Verdict({ r }: { r: Checked['results'][number] }) {
  return (
    <div className="space-y-1 border-t border-gray-100 pt-2 mt-2">
      <p className={`text-[14px] font-bold ${r.ok ? 'text-emerald-700' : 'text-red-600'}`}>
        <span aria-hidden className="mr-1.5">{r.ok ? '✓' : '✗'}</span>{r.ok ? 'Right' : r.yours ? 'Not this' : 'No answer'}
      </p>
      {!r.ok && <p className="text-[14px] leading-snug text-gray-900"><b>Answer:</b> {r.correct}</p>}
      {r.spelling && <p className="text-[13px] leading-snug text-amber-700">Check the spelling: {r.correct}</p>}
      <p className="text-[13px] leading-snug text-gray-600">{r.why}</p>
    </div>
  );
}

export default function ListeningForm({ set, audio }: { set: PublicListening; audio: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Checked | null>(null);
  const put = (n: string, v: string) => { if (!res) setAnswers(a => ({ ...a, [n]: v })); };
  const done = set.questions.filter(q => (answers[q.n] ?? '').trim()).length;

  const check = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/portal/english/listening', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: set.id, answers }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not check it. Try again.');
      setRes(j as Checked);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check it. Try again.'); }
    finally { setBusy(false); }
  };

  const letters = (q: PublicListeningQuestion, options: { label: string; text: string }[], withText: boolean) => (
    <div className={withText ? 'space-y-1.5' : 'flex flex-wrap gap-1.5'}>
      {options.map(o => {
        const on = answers[q.n] === o.label;
        return (
          <button key={o.label} type="button" disabled={!!res} onClick={() => put(q.n, o.label)} aria-pressed={on}
            className={withText
              ? `w-full text-left rounded-xl border px-3 py-2 text-[15px] ${on ? 'border-violet-500 bg-violet-50' : 'border-black/10 bg-white'}`
              : `w-10 h-10 rounded-xl border text-[15px] font-bold ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-black/10 bg-white text-violet-700'}`}>
            {withText ? <><b className="mr-2 text-violet-700">{o.label}</b>{o.text}</> : o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <Link href="/app/languages/listening" className="text-xs text-gray-500">‹ Listening</Link>
        <h1 className="text-xl font-bold text-navy mt-1 leading-tight">{set.title}</h1>
        <p className="text-[12px] text-gray-500">Section {set.section} · {set.marks} marks</p>
      </div>

      {res && (
        <div className={`${CARD} p-4`}>
          <p className="text-[18px] font-bold text-navy">{res.right} of {res.total} marks</p>
          <p className="text-[13px] text-gray-600 mt-0.5">Each answer is shown under its question, with where it was said.</p>
        </div>
      )}

      {!res && <p className="text-[14px] leading-snug text-gray-700">{set.intro}</p>}
      <Player src={audio} plays={set.plays} free={!!res} />

      {set.questions.map(q => {
        const r = res?.results.find(x => x.n === q.n);
        return (
          <div key={q.n} className="space-y-2">
            {q.heading && <h2 className="text-[13px] font-bold text-violet-800 leading-snug pt-1">{q.heading}</h2>}
            {q.heading && q.type === 'match' && set.bank && (
              <ul className={`${CARD} px-4 py-3 space-y-1`}>
                {set.bank.map(o => <li key={o.label} className="text-[14px] leading-snug text-gray-900"><b className="mr-2 text-violet-700">{o.label}</b>{o.text}</li>)}
              </ul>
            )}
            <section className={`${CARD} p-4`} aria-label={`Question ${q.n}`}>
              {q.type === 'fill' ? (
                <label className="block text-[15px] leading-relaxed text-gray-900">
                  <span className="mr-2 text-[13px] font-bold text-violet-700">{q.n}</span>
                  {q.text}{' '}
                  <input value={answers[q.n] ?? ''} onChange={e => put(q.n, e.target.value)} disabled={!!res} maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    aria-label={`Answer ${q.n}`} className="inline-block w-36 align-baseline rounded-lg border border-black/15 bg-white px-2 py-1 text-[15px] text-gray-900 focus:outline-none focus:border-violet-500" />
                  {q.after ? ` ${q.after}`.replace(/^ \.$/, '.') : ''}
                </label>
              ) : (
                <div className="space-y-2">
                  <p className="text-[15px] leading-snug text-gray-900"><span className="mr-2 text-[13px] font-bold text-violet-700">{q.n}</span>{q.text}</p>
                  {q.type === 'choice' ? letters(q, q.options, true) : letters(q, set.bank ?? [], false)}
                </div>
              )}
              {r && <Verdict r={r} />}
            </section>
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!res ? (
        <button onClick={() => void check()} disabled={busy || done === 0}
          className="w-full rounded-xl bg-violet-600 text-white text-sm font-semibold px-4 py-3 disabled:opacity-50">
          {busy ? 'Checking…' : `Check my answers · ${done} of ${set.questions.length} answered`}
        </button>
      ) : (
        <>
          <details className={`${CARD} p-4`}>
            <summary className="cursor-pointer text-[13px] font-bold uppercase tracking-wide text-violet-700">What was said</summary>
            <div className="mt-2 space-y-2">
              {res.script.map((l, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-gray-900">{l.who && res.script.some(x => x.who !== l.who && x.who) && <b className="mr-1.5 text-violet-700">{l.who}:</b>}{l.text}</p>
              ))}
            </div>
          </details>
          <Link href="/app/languages/listening" className="block text-center w-full rounded-xl border border-violet-600 text-violet-700 text-sm font-semibold px-4 py-3">Choose another recording</Link>
        </>
      )}
    </div>
  );
}
