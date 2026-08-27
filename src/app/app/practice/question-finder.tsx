'use client';

// "Bring your own question" entries for the practice tab (Adrian, 2026-08-28:
// "take a photo of a question and request for a similar question — if question
// bank don't have, we can generate" / "students can search for a question,
// then app generates it").
//
// Two doors above the topic picker:
//   📷 Snap a question   — camera/album → downscaled JPEG → /api/portal/similar
//   🔍 Describe a question — free text → the same route
// Both come back as bank matches; tapping one opens the full graded practice
// flow at /app/practice?qid=…&from=photo|search. No match (or none they like)
// → /api/portal/generate writes a fresh one via the bot's verification gates
// (1–3 min — staged progress below) and lands on ?qid=…&from=generated.
// Server-side truths (cap, level gate, eligibility) live in lib/portal-find.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MathMarkdown } from '@/lib/math-markdown';
import { DAILY_GENERATE_CAP } from '@/lib/portal-find';
import { fileToJpegDataUrl } from './image-downscale';

type Match = { id: string; preview: string; topics: string[]; totalMarks: number | null };
type Found = { source: 'photo' | 'search'; seedText: string; matches: Match[] };

// The single generate request runs 1–3 min; these stages advance on a timer so
// the wait reads as work happening, not a hang. Seconds are cumulative.
const GEN_STAGES: { at: number; label: string }[] = [
  { at: 0, label: 'Reading your question…' },
  { at: 8, label: 'Writing a fresh one…' },
  { at: 45, label: 'Checking it solves correctly…' },
  { at: 120, label: 'Still checking — a careful check takes a while…' },
];

export default function QuestionFinder({ level }: { level: string }) {
  const router = useRouter();
  const [panel, setPanel] = useState<'closed' | 'search'>('closed');
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState<'photo' | 'search' | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  // Progress clock for the generate wait.
  useEffect(() => {
    if (!generating) return;
    setGenElapsed(0);
    const t = window.setInterval(() => setGenElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [generating]);

  async function findSimilar(body: { imageBase64: string } | { text: string }, source: 'photo' | 'search') {
    setFinding(source); setError(''); setFound(null);
    try {
      const r = await fetch('/api/portal/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, level }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Something went wrong — try again.'); return; }
      const seed = (typeof d.extractedText === 'string' && d.extractedText.trim())
        || ('text' in body ? body.text : '');
      setFound({ source, seedText: seed, matches: Array.isArray(d.matches) ? d.matches : [] });
    } catch {
      setError('Connection error — try again.');
    } finally {
      setFinding(null);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setFinding('photo'); setError(''); setFound(null);
    let dataUrl: string;
    try {
      dataUrl = await fileToJpegDataUrl(file);
    } catch {
      setError('Could not read that photo — try again.'); setFinding(null); return;
    }
    await findSimilar({ imageBase64: dataUrl.split(',')[1] }, 'photo');
  }

  function submitSearch() {
    const text = query.trim();
    if (!text || finding) return;
    findSimilar({ text }, 'search');
  }

  async function generate() {
    if (!found || generating) return;
    setGenerating(true); setError('');
    const ctrl = new AbortController();
    const kill = window.setTimeout(() => ctrl.abort(), 295_000);
    try {
      const r = await fetch('/api/portal/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, seedText: found.seedText, kind: found.source }),
        signal: ctrl.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.questionId) {
        setError(d.error || 'That one didn’t pass our checks — try again or pick a bank match.');
        return;
      }
      router.push(`/app/practice?qid=${d.questionId}&from=generated`);
      return; // keep the progress screen up while the new page loads
    } catch {
      setError('That one didn’t pass our checks — try again or pick a bank match.');
    } finally {
      window.clearTimeout(kill);
    }
    setGenerating(false);
  }

  function reset() {
    setFound(null); setError(''); setQuery(''); setPanel('closed'); setGenerating(false); setOpening(null);
  }

  const stage = GEN_STAGES.reduce((cur, s) => (genElapsed >= s.at ? s.label : cur), GEN_STAGES[0].label);
  const busyLabel = finding === 'photo' ? 'Reading your photo…' : 'Searching the question bank…';

  // ── Generate wait: full-card takeover with staged progress ──
  if (generating) {
    return (
      <div className="mb-4 bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 h-8 w-8 rounded-full border-[3px] border-navy/20 border-t-navy animate-spin" aria-hidden />
        <p className="text-sm font-semibold text-navy" role="status">✨ {stage}</p>
        <p className="text-[11px] text-slate-400 mt-1.5">
          A fresh question, checked before you see it — this takes a minute or two. Keep this page open.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {/* Hidden inputs — `capture` forces iOS straight into the camera, so the
          album path needs its own input without it (same trick as the working
          editor below). */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={albumRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      {/* Entry row — two doors, one line each */}
      {!found && !finding && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => cameraRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl py-3 px-2 text-sm font-semibold text-slate-500 hover:border-navy/40 hover:text-navy transition-colors">
              📷 Snap a question
            </button>
            <button onClick={() => setPanel(panel === 'search' ? 'closed' : 'search')}
              className={`border-2 border-dashed rounded-xl py-3 px-2 text-sm font-semibold transition-colors ${
                panel === 'search' ? 'border-navy/50 text-navy bg-white' : 'border-slate-300 text-slate-500 hover:border-navy/40 hover:text-navy'}`}>
              🔍 Describe a question
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 text-center">
            From homework or a paper — we&apos;ll find one like it to practise here
            {panel !== 'search' && <> · <button onClick={() => albumRef.current?.click()} className="underline">or pick from photos</button></>}
          </p>
          {panel === 'search' && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
                placeholder="Describe it — e.g. quadratic inequality with modulus"
                className="min-w-0 flex-1 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30" />
              <button type="submit" disabled={!query.trim()}
                className="shrink-0 bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
                Find
              </button>
            </form>
          )}
        </>
      )}

      {/* Looking… */}
      {finding && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center">
          <div className="mx-auto mb-2 h-6 w-6 rounded-full border-[3px] border-navy/20 border-t-navy animate-spin" aria-hidden />
          <p className="text-sm text-slate-500" role="status">{busyLabel}</p>
        </div>
      )}

      {/* Matches (or none) */}
      {found && !finding && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {found.matches.length > 0
                ? `Questions like ${found.source === 'photo' ? 'your photo' : 'that'}`
                : 'No close match in the bank'}
            </p>
            <button onClick={reset} aria-label="Start over" className="text-slate-400 hover:text-navy text-sm leading-none">✕</button>
          </div>
          {found.source === 'photo' && found.seedText && (
            <p className="text-[11px] text-slate-400 mb-2 line-clamp-2">We read: “{found.seedText.slice(0, 160)}”</p>
          )}
          {found.matches.length > 0 && (
            <ul className="space-y-2">
              {found.matches.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => { setOpening(m.id); router.push(`/app/practice?qid=${m.id}&from=${found.source}`); }}
                    disabled={opening !== null}
                    className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-navy/40 transition-colors disabled:opacity-60">
                    <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed line-clamp-3 [&>p]:my-0">
                      <MathMarkdown content={m.preview} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                      {m.topics.map((t) => <span key={t} className="bg-slate-100 rounded-full px-2 py-0.5">{t}</span>)}
                      {m.totalMarks ? <span>{m.totalMarks} mark{m.totalMarks === 1 ? '' : 's'}</span> : null}
                      <span className="ml-auto font-semibold text-navy">{opening === m.id ? 'Opening…' : 'Try it now →'}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found.seedText ? (
            <button onClick={generate} disabled={opening !== null}
              className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                found.matches.length === 0
                  ? 'w-full bg-navy text-[hsl(45,100%,96%)] hover:opacity-90'
                  : 'w-full border border-navy/25 text-navy hover:bg-navy/5'}`}>
              ✨ {found.matches.length === 0 ? 'Make me one like it' : 'None of these? Make me a new one'}
            </button>
          ) : (
            found.matches.length === 0 && (
              <p className="text-sm text-slate-500 mt-1">
                We couldn&apos;t read enough from that to work with — try a clearer photo, or describe the question instead.
              </p>
            )
          )}
          <p className="text-[11px] text-slate-300 mt-2 text-center">Made-for-you questions: {DAILY_GENERATE_CAP} a day · bank questions are unlimited</p>
        </div>
      )}

      {error && !finding && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
