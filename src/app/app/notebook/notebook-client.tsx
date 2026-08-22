'use client';
// The interactive error notebook. One card per mistake; the re-attempt flow:
//
//   type answer → tap 😎/🤔 (required — confidence is captured BEFORE any
//   verdict is shown) → Check → auto-verdict, or an honest reveal + self-judge
//   when string comparison can't safely decide.
//
// Cards never move between sections mid-session (jumping while you're typing
// is disorienting); counts update live and the sections re-sort on next visit.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { mathHtml } from '@/lib/math-inline';
import 'katex/dist/katex.min.css';

const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

interface Entry {
  id: string;
  questionNumber: string;
  paperName: string | null;
  paperDate: string | null;
  topic: string | null;
  awarded: number;
  maxMarks: number;
  comment: string | null;
  slips: string[];
  prompt: string | null;
  variantQuestion: string | null;
  variantOrigin: string | null;
  hasVariantAnswer: boolean;
  status: 'live' | 'archived';
  streak: number;
  nextDue: string | null;
  attemptCount: number;
  lastVerdict: 'correct' | 'wrong' | null;
  archivedAt: string | null;
}

interface NotebookData {
  today: string;
  dueCount: number;
  live: Entry[];
  archived: Entry[];
}

interface AttemptResult {
  verdict: 'correct' | 'wrong';
  official: string | null;
  note: string | null;
  conquered: boolean;
}

function MathText({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mathHtml(text) }} />;
}

function niceDate(d: string | null): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export default function NotebookClient() {
  const [data, setData] = useState<NotebookData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await fetch('/api/portal/notebook');
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patchEntry = useCallback((e: Entry) => {
    setData(d => d && {
      ...d,
      live: d.live.map(x => (x.id === e.id ? e : x)),
      dueCount: d.live
        .map(x => (x.id === e.id ? e : x))
        .filter(x => x.status === 'live' && x.nextDue !== null && x.nextDue <= d.today)
        .length,
    });
  }, []);

  if (error) {
    return (
      <div className={`${CARD} p-5 text-sm text-gray-600`}>
        Couldn’t load your notebook.
        <button onClick={() => void load()} className="ml-2 font-semibold text-navy hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return <div className={`${CARD} p-5 text-sm text-gray-400`}>Opening your notebook…</div>;
  }

  const conqueredNow = data.live.filter(e => e.status === 'archived').length;
  const conqueredTotal = data.archived.length + conqueredNow;
  const inPlay = data.live.length - conqueredNow;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-navy">My notebook</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every question that cost you marks stays here until you beat it — get its
          practice twin right twice and it’s conquered.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={`${CARD} p-4 text-center`}>
          <p className="text-2xl font-bold text-navy">{data.dueCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">due now</p>
        </div>
        <div className={`${CARD} p-4 text-center`}>
          <p className="text-2xl font-bold text-navy">{inPlay}</p>
          <p className="text-xs text-gray-500 mt-0.5">in play</p>
        </div>
        <div className={`${CARD} p-4 text-center`}>
          <p className="text-2xl font-bold text-emerald-700">{conqueredTotal}</p>
          <p className="text-xs text-gray-500 mt-0.5">conquered 🏆</p>
        </div>
      </div>

      {data.live.length === 0 && data.archived.length === 0 ? (
        <div className={`${CARD} p-5`}>
          <p className="text-sm text-gray-600">
            Nothing here yet. When a marked paper comes back with dropped marks, every one of
            those questions lands here — with a practice twin to beat.
          </p>
          <Link href="/app/submit" className="inline-block mt-3 text-sm font-semibold text-navy hover:underline">
            📤 Submit a paper ›
          </Link>
        </div>
      ) : (
        <>
          {data.live.map(e => (
            <EntryCard key={e.id} entry={e} today={data.today} onUpdated={patchEntry} />
          ))}

          {data.archived.length > 0 && (
            <details className={`${CARD} p-4 group`}>
              <summary className="cursor-pointer text-sm font-semibold text-navy list-none flex items-center gap-1.5">
                <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">›</span>
                🏆 Conquered ({data.archived.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {data.archived.map(e => (
                  <li key={e.id} className="text-sm text-gray-600 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words">
                      ✅ Q{e.questionNumber}
                      {e.topic && <span className="text-gray-400"> · {e.topic}</span>}
                      {e.paperName && <span className="text-gray-400"> · {e.paperName}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{niceDate(e.archivedAt?.slice(0, 10) ?? null)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// One mistake. Local state carries the in-flight attempt; the committed entry
// itself comes back from the server through onUpdated.
function EntryCard({ entry, today, onUpdated }: {
  entry: Entry;
  today: string;
  onUpdated: (e: Entry) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [confident, setConfident] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ official: string; note: string | null } | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [failed, setFailed] = useState(false);

  const due = entry.status === 'live' && entry.nextDue !== null && entry.nextDue <= today;
  const lost = entry.maxMarks - entry.awarded;

  async function post(payload: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch('/api/portal/notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: entry.id, confident, ...payload }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || String(r.status));
      if (j.verdict === 'unclear') {
        setReveal({ official: j.official || '', note: j.note ?? null });
      } else {
        setResult({ verdict: j.verdict, official: j.official ?? null, note: j.note ?? null, conquered: !!j.conquered });
        setReveal(null);
        onUpdated(j.entry as Entry);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const conquered = entry.status === 'archived';

  return (
    <div className={`${CARD} p-4 ${conquered ? 'opacity-90' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-navy leading-snug">
            Q{entry.questionNumber}
            {entry.topic && <span className="ml-2 font-medium text-gray-400">{entry.topic}</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {entry.paperName || 'Marked paper'} · {niceDate(entry.paperDate)}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {due && !conquered && (
            <span className="text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">due</span>
          )}
          <span className="text-sm font-bold rounded-full px-3 py-1 bg-rose-100 text-rose-800">−{lost}</span>
        </div>
      </div>

      {entry.comment && (
        <MathText text={entry.comment} className="text-[13px] text-gray-700 mt-2 leading-snug" />
      )}
      {entry.slips.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {entry.slips.map((s, i) => (
            <li key={i} className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
              <MathText text={s} />
            </li>
          ))}
        </ul>
      )}
      {entry.prompt && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-gray-500 list-none">
            Show the original question
          </summary>
          <MathText text={entry.prompt} className="text-[13px] text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed" />
        </details>
      )}

      {conquered ? (
        <p className="text-sm text-emerald-800 mt-3">🏆 Conquered — two clean hits. This mistake is officially beaten.</p>
      ) : result ? (
        <ResultPanel result={result} confident={confident} />
      ) : (
        <div className="mt-3 rounded-xl border border-gray-100 bg-[hsl(45,100%,98%)] p-3">
          {entry.variantQuestion ? (
            <>
              <p className="text-[11px] font-bold text-amber-800 mb-1">
                ✏️ Beat it — a fresh twin of this question
                {entry.streak > 0 && <span className="font-medium text-emerald-700"> · 1 hit down, 1 to go</span>}
                {entry.variantOrigin && <span className="font-medium text-amber-700/70"> · {entry.variantOrigin}</span>}
              </p>
              <MathText text={entry.variantQuestion} className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" />

              {reveal ? (
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Here’s the answer — how did you do?</p>
                  <MathText text={reveal.official} className="text-[13px] text-gray-800 whitespace-pre-wrap" />
                  {reveal.note && <MathText text={reveal.note} className="text-[12px] text-gray-500 italic mt-1" />}
                  <div className="flex gap-2 mt-2.5">
                    <button
                      disabled={busy}
                      onClick={() => void post({ action: 'confirm', correct: true, answer })}
                      className="text-sm font-semibold bg-emerald-600 text-white rounded-lg px-3.5 py-1.5 hover:opacity-90 disabled:opacity-50"
                    >
                      ✅ I got it
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void post({ action: 'confirm', correct: false, answer })}
                      className="text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg px-3.5 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Not quite
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">Be honest — it only comes back to help you.</p>
                </div>
              ) : (
                <>
                  <input
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    placeholder="Your final answer"
                    className="mt-2.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
                  />
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <ConfidencePills confident={confident} onPick={setConfident} />
                    <button
                      disabled={busy || confident === null || !answer.trim()}
                      onClick={() => void post({ action: 'attempt', answer })}
                      className="ml-auto text-sm font-semibold bg-navy text-[hsl(45,100%,96%)] rounded-lg px-4 py-1.5 hover:opacity-90 disabled:opacity-40"
                    >
                      {busy ? 'Checking…' : 'Check'}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] font-bold text-amber-800 mb-1">✏️ Beat it</p>
              <p className="text-sm text-gray-700">
                No auto-check twin for this one — redo the original on paper, then be honest:
              </p>
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <ConfidencePills confident={confident} onPick={setConfident} />
                <div className="ml-auto flex gap-2">
                  <button
                    disabled={busy || confident === null}
                    onClick={() => void post({ action: 'confirm', correct: true })}
                    className="text-sm font-semibold bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-40"
                  >
                    Got it right
                  </button>
                  <button
                    disabled={busy || confident === null}
                    onClick={() => void post({ action: 'confirm', correct: false })}
                    className="text-sm font-semibold bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Got it wrong
                  </button>
                </div>
              </div>
              {entry.topic && (
                <Link
                  href={`/app/practice?topic=${encodeURIComponent(entry.topic)}`}
                  className="inline-block mt-2 text-xs font-semibold text-navy hover:underline"
                >
                  Practise {entry.topic} ›
                </Link>
              )}
            </>
          )}
          {failed && (
            <p className="text-[12px] text-rose-700 mt-2">Something went wrong saving that — try again.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ConfidencePills({ confident, onPick }: {
  confident: boolean | null;
  onPick: (v: boolean) => void;
}) {
  const base = 'text-sm rounded-full px-3 py-1 border transition-colors';
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-gray-400">How sure?</span>
      <button
        onClick={() => onPick(true)}
        className={`${base} ${confident === true
          ? 'bg-navy text-[hsl(45,100%,96%)] border-navy'
          : 'bg-white text-gray-600 border-gray-300 hover:border-navy/50'}`}
      >
        😎 Sure
      </button>
      <button
        onClick={() => onPick(false)}
        className={`${base} ${confident === false
          ? 'bg-navy text-[hsl(45,100%,96%)] border-navy'
          : 'bg-white text-gray-600 border-gray-300 hover:border-navy/50'}`}
      >
        🤔 Not sure
      </button>
    </div>
  );
}

function ResultPanel({ result, confident }: { result: AttemptResult; confident: boolean | null }) {
  if (result.verdict === 'correct') {
    return (
      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
        <p className="text-sm font-semibold text-emerald-800">
          {result.conquered
            ? '🏆 Conquered! Two clean hits — this mistake is officially beaten.'
            : '✅ Correct! It comes back once more in a week — one more clean hit and it’s conquered.'}
        </p>
        {result.official && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-semibold text-emerald-700 list-none">Show the full answer</summary>
            <MathText text={result.official} className="text-[13px] text-emerald-900 mt-1 whitespace-pre-wrap" />
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3">
      <p className="text-sm font-semibold text-rose-800">✖ Not this time — it comes back in a few days.</p>
      {result.official && (
        <>
          <p className="text-xs font-semibold text-gray-500 mt-2">The answer:</p>
          <MathText text={result.official} className="text-[13px] text-gray-800 whitespace-pre-wrap" />
        </>
      )}
      {result.note && <MathText text={result.note} className="text-[12px] text-gray-500 italic mt-1" />}
      {confident === true && (
        <p className="text-[12px] text-rose-900 mt-2">
          You were sure about this one — that makes it worth a proper look. Check the answer against
          your working, and bring it to class if it still doesn’t make sense.
        </p>
      )}
    </div>
  );
}
