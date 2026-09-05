'use client';

// /app/find — the "Find a question" flow (SPEC-PORTAL-V2 §4). Grew out of the
// practice tab's 📷/🔍 finder (2026-08-28), which listed bank matches and let
// the student pick one; Adrian's 6 Sep 2026 rule replaced the list with ONE
// answer, already on the student's Practice list:
//
//   📷 Snap a question / 🔍 Type a question → POST /api/portal/find
//     → tier 'similar'  — the bank had a genuinely similar question (same
//                         topic AND sub-skill, marks within one); the card
//                         says "Similar question" and links straight to it
//     → tier null       — nothing that close → POST /api/portal/generate at
//                         once (1–3 min, staged progress) → "Made for you",
//                         listed the same way; or the cap message when today's
//                         made-for-you questions are spent.
//
// Every truth (tier rule, caps, subject gate, which level may be searched)
// is server-side in lib/portal-find; this file renders what the routes say.
// The student sees nothing of caps or reviews except the cap message itself.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MathMarkdown } from '@/lib/math-markdown';
import { PortalFetchError, portalFetch, portalMessage } from '@/lib/portal-fetch';
import { fileToJpegDataUrl } from '@/app/app/practice/image-downscale';
import type { FindLevelOption } from '@/lib/portal-find';

type Summary = { id: string; preview: string; topic: string | null; subgroup: string | null; marks: number | null };
type FindResponse =
  | { tier: 'similar'; label: string; assignmentId: string; findLogId: string | null; extractedText: string; question: Summary }
  | {
      tier: null; extractedText: string; findLogId: string | null; unreadable: boolean; topicHint: string | null;
      generate: { allowed: boolean; remaining: number; message: string | null };
    };
type GenerateResponse = { questionId?: string; assignmentId?: string | null; label?: string; question?: Summary | null; url?: string };
type Source = 'photo' | 'search';
type Result = { tier: 'similar' | 'made-for-you'; label: string; href: string; listed: boolean; question: Summary | null };

// The single generate request runs 1–3 min; these stages advance on a timer so
// the wait reads as work happening, not a hang. Seconds are cumulative.
const GEN_STAGES: { at: number; label: string }[] = [
  { at: 0, label: 'Nothing that close in the bank — writing one for you…' },
  { at: 12, label: 'Writing a fresh question…' },
  { at: 45, label: 'Checking it solves correctly…' },
  { at: 120, label: 'Still checking — a careful check takes a while…' },
];
const GEN_FAIL = 'That one didn’t pass our checks — try again, or snap a clearer photo.';
const CARD = 'bg-white rounded-2xl border border-black/5 shadow-sm';

export default function FindClient({ levels }: { levels: FindLevelOption[] }) {
  const [level, setLevel] = useState<FindLevelOption['key']>(levels[0]?.key ?? 'EM');
  const [panel, setPanel] = useState<'closed' | 'search'>('closed');
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState<Source | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [readText, setReadText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Progress clock for the generate wait.
  useEffect(() => {
    if (!generating) return;
    setGenElapsed(0);
    const t = window.setInterval(() => setGenElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [generating]);

  async function generate(seedText: string, source: Source, findLogId: string | null, topic: string | null) {
    setGenerating(true);
    const ctrl = new AbortController();
    const kill = window.setTimeout(() => ctrl.abort(), 295_000);
    try {
      const d = await portalFetch<GenerateResponse>('/api/portal/generate', {
        json: { level, seedText, kind: source, findLogId, ...(topic ? { topic } : {}) },
        signal: ctrl.signal,
        fallback: GEN_FAIL,
      });
      if (d.assignmentId) {
        setResult({ tier: 'made-for-you', label: d.label || 'Made for you', href: `/app/practice?assignment=${d.assignmentId}`, listed: true, question: d.question ?? null });
      } else if (d.questionId) {
        // Written and checked, but the Practice insert failed — still theirs to try.
        setResult({ tier: 'made-for-you', label: d.label || 'Made for you', href: `/app/practice?qid=${d.questionId}&from=generated`, listed: false, question: d.question ?? null });
      } else {
        setError(GEN_FAIL);
      }
    } catch (e) {
      setError(e instanceof PortalFetchError ? e.message : GEN_FAIL);
    } finally {
      window.clearTimeout(kill);
      setGenerating(false);
    }
  }

  async function find(body: { imageBase64: string } | { text: string }, source: Source) {
    setFinding(source); setError(''); setNotice(''); setResult(null); setReadText('');
    try {
      const d = await portalFetch<FindResponse>('/api/portal/find', {
        json: { ...body, level },
        fallback: 'Something went wrong — try again.',
      });
      if (source === 'photo' && d.extractedText) setReadText(d.extractedText);
      if (d.tier === 'similar') {
        setResult({ tier: 'similar', label: d.label, href: `/app/practice?assignment=${d.assignmentId}`, listed: true, question: d.question });
        return;
      }
      if (d.unreadable) {
        setError('We couldn’t read enough from that — try a clearer photo, or type the question instead.');
        return;
      }
      if (!d.generate.allowed) {
        setNotice(d.generate.message || 'Nothing like it in the bank today — try another question.');
        return;
      }
      setFinding(null);
      await generate(d.extractedText, source, d.findLogId, d.topicHint);
    } catch (e) {
      setError(portalMessage(e));
    } finally {
      setFinding(null);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setFinding('photo'); setError(''); setNotice(''); setResult(null);
    let dataUrl: string;
    try {
      dataUrl = await fileToJpegDataUrl(file);
    } catch {
      setError('Could not read that photo — try again.'); setFinding(null); return;
    }
    await find({ imageBase64: dataUrl.split(',')[1] }, 'photo');
  }

  function submitSearch() {
    const text = query.trim();
    if (!text || finding) return;
    find({ text }, 'search');
  }

  function reset() {
    setResult(null); setError(''); setNotice(''); setReadText(''); setQuery(''); setPanel('closed'); setGenerating(false);
  }

  const stage = GEN_STAGES.reduce((cur, s) => (genElapsed >= s.at ? s.label : cur), GEN_STAGES[0].label);
  const busyLabel = finding === 'photo' ? 'Reading your photo…' : 'Looking for one like it…';
  const marks = result?.question?.marks ?? null;

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      <div className="flex items-baseline justify-between pt-1">
        <h1 className="text-xl font-bold text-navy">🔍 Find a question</h1>
        <Link href="/app" className="text-sm text-gray-500 hover:text-navy">← Home</Link>
      </div>

      {/* Hidden inputs — `capture` forces iOS straight into the camera, so the
          album path needs its own input without it. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={albumRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      {/* ── Generate wait: full-card takeover with staged progress ── */}
      {generating ? (
        <div className={`${CARD} p-6 text-center`}>
          <div className="mx-auto mb-3 h-8 w-8 rounded-full border-[3px] border-navy/20 border-t-navy animate-spin" aria-hidden />
          <p className="text-sm font-semibold text-navy" role="status">✨ {stage}</p>
          <p className="text-[11px] text-slate-400 mt-1.5">
            A fresh question, checked before you see it — this takes a minute or two. Keep this page open.
          </p>
        </div>
      ) : (
        <>
          {/* Which bank to search — only when the account has more than one subject. */}
          {levels.length > 1 && !result && (
            <div className="flex gap-2" role="radiogroup" aria-label="Which subject is the question from?">
              {levels.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="radio"
                  aria-checked={level === l.key}
                  onClick={() => setLevel(l.key)}
                  disabled={finding !== null}
                  className={`text-sm font-semibold rounded-full px-3.5 py-1.5 border transition ${
                    level === l.key ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-gray-600 border-black/10 hover:border-navy/40'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {/* The two doors */}
          {!result && !finding && (
            <div className={`${CARD} p-4`}>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => cameraRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl py-3 px-2 text-sm font-semibold text-slate-500 hover:border-navy/40 hover:text-navy transition-colors">
                  📷 Snap a question
                </button>
                <button onClick={() => setPanel(panel === 'search' ? 'closed' : 'search')}
                  className={`border-2 border-dashed rounded-xl py-3 px-2 text-sm font-semibold transition-colors ${
                    panel === 'search' ? 'border-navy/50 text-navy bg-white' : 'border-slate-300 text-slate-500 hover:border-navy/40 hover:text-navy'}`}>
                  ⌨️ Type a question
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                From homework or a paper — we&apos;ll find one like it, or write one for you, and put it in your Practice
                {panel !== 'search' && <> · <button onClick={() => albumRef.current?.click()} className="underline">or pick from photos</button></>}
              </p>
              {panel === 'search' && (
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
                  <div className="relative min-w-0 flex-1">
                    <input
                      ref={searchInputRef}
                      value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
                      placeholder="Type it — e.g. find the range of values of k for which x² + kx + 4 > 0"
                      className="w-full border border-slate-300 rounded-xl pl-3.5 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30" />
                    {query !== '' && (
                      <button
                        type="button"
                        onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                        aria-label="Clear"
                        className="absolute right-0 top-0 grid h-full w-9 place-items-center text-slate-400 hover:text-navy"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button type="submit" disabled={!query.trim()}
                    className="shrink-0 bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
                    Find
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Looking… */}
          {finding && (
            <div className={`${CARD} p-5 text-center`}>
              <div className="mx-auto mb-2 h-6 w-6 rounded-full border-[3px] border-navy/20 border-t-navy animate-spin" aria-hidden />
              <p className="text-sm text-slate-500" role="status">{busyLabel}</p>
            </div>
          )}

          {/* The one answer — already on the Practice list */}
          {result && !finding && (
            <div className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${result.tier === 'similar' ? 'text-emerald-700' : 'text-violet-700'}`}>
                  {result.tier === 'similar' ? '🎯' : '✨'} {result.label}
                </span>
                <button onClick={reset} aria-label="Start over" className="text-slate-400 hover:text-navy text-sm leading-none">✕</button>
              </div>
              {readText && (
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">We read: “{readText.slice(0, 160)}”</p>
              )}
              {result.question && (
                <div className="mt-2 prose prose-sm max-w-none text-slate-800 leading-relaxed line-clamp-4 [&>p]:my-0">
                  <MathMarkdown content={result.question.preview} />
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                {result.question?.topic && <span className="bg-slate-100 rounded-full px-2 py-0.5">{result.question.topic}</span>}
                {result.question?.subgroup && <span className="bg-slate-100 rounded-full px-2 py-0.5">{result.question.subgroup}</span>}
                {marks ? <span>{marks} mark{marks === 1 ? '' : 's'}</span> : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                {result.listed ? '✓ Added to your Practice' : '✓ Ready to try'}
              </p>
              <div className="mt-3 flex gap-2">
                <Link href={result.href}
                  className="flex-1 text-center bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-90">
                  Try it now →
                </Link>
                <button onClick={reset}
                  className="rounded-xl border border-navy/25 text-navy px-4 py-2.5 text-sm font-semibold hover:bg-navy/5">
                  Find another
                </button>
              </div>
            </div>
          )}

          {notice && !finding && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              {notice}
              <button onClick={reset} className="block mt-2 text-xs font-semibold underline">Try another question</button>
            </div>
          )}
          {error && !finding && (
            <div className="text-sm text-red-600">
              {error}
              <button onClick={reset} className="block mt-1 text-xs font-semibold underline">Start over</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
