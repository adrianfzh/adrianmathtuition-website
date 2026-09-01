'use client';

// The timed set (2026-09-02): a few real bank questions against an exam-pace
// clock, no solutions and no marking until the end. Adrian's point — untimed
// practice hides the time losses a prelim exposes.
//
// Phases:
//   setup   — level / topics (empty = mixed) / Standard–Advanced / 3 or 5
//   ready   — the set is built; marks + minutes shown; Start begins the clock
//   running — wall-clock countdown from startedAt (backgrounding the tab or
//             reloading doesn't buy time); one question at a time, typed or
//             photographed working; resumable from localStorage
//   marking — every attempted question → /api/portal/practice/grade in
//             parallel, tagged { setId, elapsedSec, timeLimitSec }; blanks
//             never hit the grader
//   results — score, time used, one coaching line, then per-question feedback
//             with the worked solution now unlocked and a "redo" link into the
//             ordinary practice flow (?qid=…&from=timed)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MathMarkdown } from '@/lib/math-markdown';
import { MathText, QuestionView, type Question } from '../question-view';
import { fileToJpegDataUrl } from '../image-downscale';
import type { Tier } from '../topic-picker';
import { topicOrderComparator } from '@/lib/notes-tree';
import {
  TIMED_SET_COUNTS, coachingLine, formatClock, marksForTiming, summariseSet,
  type SetItemOutcome, type TimedSetCount,
} from '@/lib/timed-set';

type LevelOpt = { key: string; label: string };
type TopicRow = { topic: string; n: number; advanced_count?: number };
type SetQuestion = Question & { topic: string | null };
type BuiltSet = {
  setId: string; level: string; tier: Tier | null; mixed: boolean; topics: string[];
  count: number; totalMarks: number; timeLimitSec: number; questions: SetQuestion[];
};
type Answer = { text: string; photo: string | null };
type LineComment = { line: number; ok: boolean; comment: string; fix?: string; tag?: string };
type GradeResult = {
  verdict: 'correct' | 'partial' | 'wrong'; score: number; outOf: number;
  partBreakdown: { label: string; awarded: number; outOf: number; comment: string }[];
  lineComments: LineComment[]; strengths: string[]; nextSteps: string[]; transcribedLines?: string[];
};
type Graded =
  | { status: 'blank' }
  | { status: 'marked'; result: GradeResult; lines: string[] }
  | { status: 'error'; message: string };
type Phase = 'setup' | 'ready' | 'running' | 'marking' | 'results';

// In-flight set survives a tab death / reload. Photos ride along as JPEG data
// URLs (≈300 KB each, five at most) — over quota just means no resume.
const STORE_KEY = 'timed_set_v1';
type Stored = { set: BuiltSet; startedAt: number; answers: Record<string, Answer>; idx: number };
function loadStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s?.set?.setId || !Array.isArray(s.set.questions) || !s.set.questions.length || typeof s.startedAt !== 'number') return null;
    return s;
  } catch { return null; }
}
function saveStored(s: Stored) { try { window.localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* quota / private mode */ } }
function clearStored() { try { window.localStorage.removeItem(STORE_KEY); } catch { /* noop */ } }

const CARD = 'bg-white border border-slate-200 rounded-2xl p-5';
const CHIP_ON = 'bg-navy text-[hsl(45,100%,96%)] border-navy';
const CHIP_OFF = 'bg-white text-slate-600 border-slate-300';

export default function TimedFlow({ levels, initialLevel, initialTopics }: {
  levels: LevelOpt[]; initialLevel: string; initialTopics: string[];
}) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [level, setLevel] = useState(initialLevel);
  const [topicRows, setTopicRows] = useState<TopicRow[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [chosen, setChosen] = useState<string[]>(initialTopics);   // [] = every topic (mixed)
  const [tier, setTier] = useState<Tier>('Standard');
  const [count, setCount] = useState<TimedSetCount>(3);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');

  const [set, setSet] = useState<BuiltSet | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resumed, setResumed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [graded, setGraded] = useState<Record<string, Graded>>({});
  const [elapsedSec, setElapsedSec] = useState(0);
  const [solutions, setSolutions] = useState<Record<string, string>>({});
  const [solLoading, setSolLoading] = useState<string | null>(null);

  const finishing = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Resume an in-flight set. The clock kept running while the tab was gone;
  // a set whose clock has already run out is discarded, not auto-graded —
  // grading yesterday's half-answers on today's visit would silently burn the
  // daily cap for a set the student isn't even looking at.
  useEffect(() => {
    const s = loadStored();
    if (!s) return;
    if (Date.now() - s.startedAt >= s.set.timeLimitSec * 1000) { clearStored(); return; }
    setSet(s.set); setStartedAt(s.startedAt); setAnswers(s.answers || {});
    setIdx(Math.min(Math.max(0, s.idx || 0), s.set.questions.length - 1));
    setLevel(s.set.level); setNow(Date.now()); setResumed(true); setPhase('running');
  }, []);

  // Topic list for the level (setup only).
  useEffect(() => {
    if (phase !== 'setup') return;
    let cancelled = false;
    setTopicsLoading(true);
    fetch(`/api/portal/practice/topics?level=${encodeURIComponent(level)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setTopicRows(Array.isArray(d.topics) ? d.topics : []); })
      .catch(() => { if (!cancelled) setTopicRows([]); })
      .finally(() => { if (!cancelled) setTopicsLoading(false); });
    return () => { cancelled = true; };
  }, [level, phase]);

  // Prefilled topics (an exam's tested-topics list) are matched to the bank's
  // names case-insensitively; one the bank doesn't carry at this level drops
  // off and is counted so the student sees why the set is narrower — nothing
  // left = mixed. A level switch clears the selection, so nothing drops then.
  const [droppedTopics, setDroppedTopics] = useState(0);
  useEffect(() => {
    if (topicsLoading) return;
    const byLower = new Map(topicRows.map(r => [r.topic.toLowerCase(), r.topic]));
    const kept = [...new Set(chosen.map(t => byLower.get(t.toLowerCase())).filter((t): t is string => !!t))];
    if (kept.length !== chosen.length || kept.some((t, i) => t !== chosen[i])) {
      setDroppedTopics(chosen.length - kept.length);
      setChosen(kept);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicRows, topicsLoading]);

  // The clock.
  const remaining = set && startedAt !== null ? set.timeLimitSec - Math.floor((now - startedAt) / 1000) : 0;
  useEffect(() => {
    if (phase !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Persist while running.
  useEffect(() => {
    if (phase !== 'running' || !set || startedAt === null) return;
    saveStored({ set, startedAt, answers, idx });
  }, [phase, set, startedAt, answers, idx]);

  const finish = useCallback(async (auto: boolean) => {
    if (!set || startedAt === null || finishing.current) return;
    finishing.current = true;
    // Forget the set BEFORE grading starts: a reload mid-marking must land on
    // setup, never resume an expired clock and grade everything a second time.
    clearStored();
    const used = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const elapsed = auto ? set.timeLimitSec : Math.min(set.timeLimitSec, used);
    setElapsedSec(elapsed);
    setPhase('marking');
    const timed = { setId: set.setId, elapsedSec: elapsed, timeLimitSec: set.timeLimitSec };
    const results: Record<string, Graded> = {};
    await Promise.all(set.questions.map(async q => {
      const a = answers[q.id];
      const text = (a?.text || '').trim();
      if (!a?.photo && !text) { results[q.id] = { status: 'blank' }; return; }
      const lines = (a?.text || '').split('\n');
      const body = a?.photo
        ? { questionId: q.id, image: { data: a.photo.split(',')[1], mediaType: 'image/jpeg' }, timed }
        : { questionId: q.id, lines, timed };
      try {
        const r = await fetch('/api/portal/practice/grade', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) { results[q.id] = { status: 'error', message: d.error || 'Marking failed' }; return; }
        // Same rule as the practice flow: use the grader's echoed lines only
        // when the count matches, so lineComments' numbering stays valid.
        const tl: string[] | undefined = d.result?.transcribedLines;
        results[q.id] = {
          status: 'marked', result: d.result,
          lines: a?.photo ? (tl || lines) : (tl && tl.length === lines.length ? tl : lines),
        };
      } catch { results[q.id] = { status: 'error', message: 'Connection error while marking' }; }
    }));
    setGraded(results);
    const blank = Object.values(results).filter(g => g.status === 'blank').length;
    fetch('/api/portal/practice/timed-set', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finish', setId: set.setId, attempted: set.questions.length - blank, blank, elapsedSec: elapsed, timeLimitSec: set.timeLimitSec, auto }),
    }).catch(() => { /* telemetry is best-effort */ });
    clearStored();
    setPhase('results');
  }, [set, startedAt, answers]);

  // Time's up → auto-finish with whatever is on the page.
  useEffect(() => {
    if (phase === 'running' && set && startedAt !== null && remaining <= 0) void finish(true);
  }, [phase, set, startedAt, remaining, finish]);

  async function build() {
    setBuilding(true); setError('');
    try {
      const r = await fetch('/api/portal/practice/timed-set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, topics: chosen, tier, count }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Could not build a set'); return; }
      setSet(d as BuiltSet); setAnswers({}); setGraded({}); setSolutions({}); setIdx(0); setResumed(false);
      setPhase('ready');
    } catch { setError('Connection error'); }
    finally { setBuilding(false); }
  }
  function start() {
    if (!set) return;
    const t = Date.now();
    finishing.current = false;
    setStartedAt(t); setNow(t); setPhase('running');
  }
  function reset() {
    finishing.current = false;
    clearStored();
    setSet(null); setStartedAt(null); setAnswers({}); setGraded({}); setSolutions({}); setIdx(0);
    setError(''); setResumed(false); setPhase('setup');
  }

  const q = set?.questions[idx] ?? null;
  const ans: Answer = q ? (answers[q.id] ?? { text: '', photo: null }) : { text: '', photo: null };
  function setText(text: string) {
    if (!q) return;
    const id = q.id;
    setAnswers(a => ({ ...a, [id]: { text, photo: a[id]?.photo ?? null } }));
  }
  function setPhoto(photo: string | null) {
    if (!q) return;
    const id = q.id;
    setAnswers(a => ({ ...a, [id]: { text: a[id]?.text ?? '', photo } }));
  }
  async function pickPhoto(file: File | undefined) {
    if (!file || !q) return;
    setPhotoBusy(true); setError('');
    try { setPhoto(await fileToJpegDataUrl(file)); }
    catch { setError('Could not read that photo — try again.'); }
    finally { setPhotoBusy(false); }
  }
  async function showSolution(qid: string) {
    setSolLoading(qid);
    try {
      const r = await fetch(`/api/portal/practice/solution?id=${encodeURIComponent(qid)}`);
      const d = await r.json();
      setSolutions(s => ({ ...s, [qid]: r.ok ? d.markdown : '_Could not load the solution._' }));
    } catch { setSolutions(s => ({ ...s, [qid]: '_Could not load the solution._' })); }
    finally { setSolLoading(null); }
  }
  function toggleTopic(t: string) {
    setChosen(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  const answered = set ? set.questions.filter(x => (answers[x.id]?.text || '').trim() || answers[x.id]?.photo).length : 0;

  // Textbook order, the same comparator the picker and the notes reader use.
  const orderedTopics = useMemo(() => {
    const cmp = topicOrderComparator(level);
    return [...topicRows].sort((a, b) => cmp(a.topic, b.topic));
  }, [topicRows, level]);

  // Finishing early with blanks (or while a photo is still being read) is a
  // one-tap mistake that costs marks — ask first; time-up never asks.
  function confirmFinish() {
    if (!set || photoBusy) return;
    const blank = set.questions.length - answered;
    if (blank > 0 && remaining > 0
      && !window.confirm(`${blank} question${blank === 1 ? ' is' : 's are'} still blank — finish and mark anyway?`)) return;
    void finish(false);
  }

  // ── Setup ──
  if (phase === 'setup') {
    const anyAdvanced = topicRows.some(r => (r.advanced_count ?? 0) > 0);
    return (
      <div className="pb-20 sm:pb-6 max-w-2xl mx-auto space-y-4">
        <Link href="/app/practice" className="text-sm text-slate-500 hover:text-navy">← Practise</Link>
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight">⏱ Timed set</h1>
          <p className="text-sm text-slate-600 mt-1">
            A few real exam questions against the clock at exam pace. No solutions, no marking until the clock stops — then every question is marked line by line.
          </p>
        </div>

        {levels.length > 1 && (
          <div className={CARD}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Subject</p>
            <div className="flex flex-wrap gap-2">
              {levels.map(l => (
                <button key={l.key} onClick={() => { setLevel(l.key); setChosen([]); setDroppedTopics(0); }}
                  className={`text-sm font-semibold rounded-full border px-3.5 py-1.5 ${level === l.key ? CHIP_ON : CHIP_OFF}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={CARD}>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Topics</p>
            <p className="text-xs text-slate-500 truncate max-w-[60%]">{chosen.length === 0 ? 'Mixed — every topic' : chosen.join(', ')}</p>
          </div>
          {topicsLoading ? (
            <div className="h-24 animate-pulse bg-slate-50 rounded-xl" />
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pr-1">
              <button onClick={() => setChosen([])}
                className={`text-xs font-semibold rounded-full border px-3 py-1.5 ${chosen.length === 0 ? CHIP_ON : CHIP_OFF}`}>
                🔀 Mixed
              </button>
              {orderedTopics.map(r => (
                <button key={r.topic} onClick={() => toggleTopic(r.topic)}
                  className={`text-xs text-left rounded-full border px-3 py-1.5 ${chosen.includes(r.topic) ? CHIP_ON : CHIP_OFF}`}>
                  {r.topic}
                </button>
              ))}
            </div>
          )}
          {droppedTopics > 0 && (
            <p className="text-[11px] text-amber-700 mt-2">
              {droppedTopics} of the exam&apos;s topics {droppedTopics === 1 ? 'isn’t' : 'aren’t'} in the question bank for this subject yet — the rest are selected.
            </p>
          )}
        </div>

        {/* Stacked, not side-by-side: two chip pairs in two columns overlap at
            390px (seen on the first phone screenshot). */}
        <div className={`${CARD} space-y-4`}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Difficulty</p>
            <div className="flex gap-2">
              {(['Standard', 'Advanced'] as Tier[]).map(t => (
                <button key={t} onClick={() => setTier(t)} disabled={t === 'Advanced' && !topicsLoading && !anyAdvanced}
                  className={`text-sm font-semibold rounded-full border px-3.5 py-1.5 disabled:opacity-40 ${tier === t ? CHIP_ON : CHIP_OFF}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Questions</p>
            <div className="flex gap-2">
              {TIMED_SET_COUNTS.map(n => (
                <button key={n} onClick={() => setCount(n)}
                  className={`text-sm font-semibold rounded-full border px-3.5 py-1.5 ${count === n ? CHIP_ON : CHIP_OFF}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button onClick={build} disabled={building || topicsLoading}
          className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-2xl py-3.5 text-base font-semibold disabled:opacity-50 active:scale-[0.98] transition">
          {building ? 'Building your set…' : 'Build my set'}
        </button>
        <p className="text-[11px] text-slate-400 text-center">Each question counts as one marked attempt for the day.</p>
      </div>
    );
  }

  // ── Ready ──
  if (phase === 'ready' && set) {
    return (
      <div className="pb-20 sm:pb-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-navy tracking-tight">⏱ Ready?</h1>
        <div className={CARD}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-black text-navy tabular-nums leading-none">{formatClock(set.timeLimitSec)}</p>
              <p className="text-xs text-slate-500 mt-1.5">
                {set.questions.length} question{set.questions.length === 1 ? '' : 's'} · {set.totalMarks} marks · exam pace
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>{set.tier ?? 'Standard'}</p>
              <p className="truncate max-w-[10rem]">{set.mixed ? 'Mixed topics' : set.topics.join(', ')}</p>
            </div>
          </div>
          <ul className="mt-4 text-sm text-slate-700 space-y-1.5 list-disc pl-5">
            <li>The clock starts when you press Start and keeps running if you leave the page.</li>
            <li>No solutions and no marking until the clock stops.</li>
            <li>Stuck on a part? Move on — come back if there is time.</li>
            <li>When time is up, whatever you have written is marked.</li>
          </ul>
        </div>
        <button onClick={start}
          className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-2xl py-3.5 text-base font-semibold active:scale-[0.98] transition">
          ▶ Start the clock
        </button>
        <button onClick={reset} className="w-full text-sm text-slate-500 py-2">Change the set</button>
      </div>
    );
  }

  // ── Running ──
  if (phase === 'running' && set && q) {
    const low = remaining <= 120;
    return (
      <div className="pb-24 sm:pb-6 max-w-2xl mx-auto">
        {/* top-14: the shell nav is sticky at top-0 (h-14, z-40) — at top-0
            the clock would scroll underneath it. */}
        <div className={`sticky top-14 z-20 -mx-4 px-4 py-2.5 mb-4 flex items-center gap-3 border-b backdrop-blur ${low ? 'bg-rose-50/95 border-rose-200' : 'bg-white/95 border-slate-200'}`}>
          <p className={`text-2xl font-black tabular-nums leading-none ${low ? 'text-rose-600' : 'text-navy'}`}>{formatClock(remaining)}</p>
          <p className="text-xs text-slate-500 flex-1">Q{idx + 1} of {set.questions.length} · {answered} answered</p>
          <button onClick={confirmFinish} disabled={photoBusy}
            className="text-xs font-semibold text-navy border border-navy/30 rounded-full px-3 py-1.5 disabled:opacity-40">
            Finish &amp; mark
          </button>
        </div>
        {resumed && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
            Picked up where you left off — the clock kept running.
          </p>
        )}

        <div className={`${CARD} mb-4`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Question {idx + 1}{q.topic ? ` · ${q.topic}` : ''}</span>
            {q.marks ? <span className="text-xs text-slate-500 tabular-nums">[{q.marks}]</span> : null}
          </div>
          <QuestionView q={q} />
          {q.figureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.figureUrl} alt="Figure" className="mt-3 max-h-72 rounded-xl border border-slate-100" />
          )}
        </div>

        <div className={`${CARD} mb-4`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Your working</p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={libraryRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          {ans.photo ? (
            <div className="mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ans.photo} alt="Your working" className="max-h-64 rounded-xl border border-slate-200" />
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => cameraRef.current?.click()} disabled={photoBusy}
                  className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">📷 Retake</button>
                <button onClick={() => setPhoto(null)}
                  className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">✕ Remove — type instead</button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={ans.text}
                onChange={(e) => setText(e.target.value)}
                rows={Math.max(5, ans.text.split('\n').length + 1)}
                placeholder={'Type your working, one step per line'}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-3 text-sm font-mono leading-6 focus:outline-none focus:ring-2 focus:ring-navy/30"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => cameraRef.current?.click()} disabled={photoBusy}
                  className="text-xs font-semibold text-slate-500 border border-dashed border-slate-300 rounded-lg px-3 py-2">
                  {photoBusy ? 'Reading photo…' : '📷 Photo of paper instead'}
                </button>
                <button onClick={() => libraryRef.current?.click()} disabled={photoBusy}
                  className="text-xs font-semibold text-slate-500 border border-dashed border-slate-300 rounded-lg px-3 py-2">🖼 Library</button>
              </div>
            </>
          )}
          {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
            className="bg-white border border-slate-300 text-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40">← Previous</button>
          <div className="flex-1 flex justify-center gap-1.5">
            {set.questions.map((x, i) => {
              const done = (answers[x.id]?.text || '').trim() || answers[x.id]?.photo;
              return (
                <button key={x.id} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}`}
                  className={`w-7 h-7 rounded-full text-xs font-semibold border ${i === idx ? CHIP_ON : done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : CHIP_OFF}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          {idx < set.questions.length - 1 ? (
            <button onClick={() => setIdx(i => Math.min(set.questions.length - 1, i + 1))}
              className="bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5 text-sm font-semibold">Next →</button>
          ) : (
            <button onClick={confirmFinish} disabled={photoBusy}
              className="bg-navy text-[hsl(45,100%,96%)] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Finish ✓</button>
          )}
        </div>
      </div>
    );
  }

  // ── Marking ──
  if (phase === 'marking' && set) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className={`${CARD} w-full max-w-sm text-center`}>
          <div className="text-3xl mb-2">✏️</div>
          <p className="text-base font-bold text-navy">Marking your set…</p>
          <p className="text-xs text-slate-500 mt-1">
            {answered} of {set.questions.length} attempted · about 30 seconds
          </p>
          <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-1/2 bg-navy/70 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // ── Results ──
  if (phase === 'results' && set) {
    const outcomes: SetItemOutcome[] = set.questions.map(x => {
      const g = graded[x.id];
      const attempted = !!g && g.status !== 'blank';
      return g?.status === 'marked'
        ? { marks: marksForTiming(x.marks), attempted, score: g.result.score, outOf: g.result.outOf }
        : { marks: marksForTiming(x.marks), attempted, score: null, outOf: null };
    });
    const s = summariseSet(outcomes);
    const tone = s.pct == null ? 'text-navy' : s.pct >= 75 ? 'text-emerald-600' : s.pct >= 50 ? 'text-amber-600' : 'text-rose-600';
    return (
      <div className="pb-20 sm:pb-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-navy tracking-tight">Your timed set</h1>
        <div className={CARD}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className={`text-4xl font-black tabular-nums leading-none ${tone}`}>{s.score}<span className="text-xl text-slate-400 font-bold">/{s.outOf}</span></p>
              <p className="text-xs text-slate-500 mt-2">
                {formatClock(elapsedSec)} used of {formatClock(set.timeLimitSec)}
                {s.blank ? ` · ${s.blank} blank` : ''}{s.unmarked ? ` · ${s.unmarked} not marked` : ''}
              </p>
            </div>
            {s.pct != null && <p className={`text-lg font-bold ${tone}`}>{s.pct}%</p>}
          </div>
          <p className="text-sm text-slate-700 mt-3">{coachingLine(s, elapsedSec, set.timeLimitSec)}</p>
        </div>

        {set.questions.map((x, i) => {
          const g = graded[x.id];
          const sol = solutions[x.id];
          return (
            <div key={x.id} className={CARD}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Q{i + 1}{x.topic ? ` · ${x.topic}` : ''}</span>
                {g?.status === 'marked' ? (
                  <span className={`text-sm font-bold rounded-full px-3 py-1 ${
                    g.result.verdict === 'correct' ? 'bg-emerald-50 text-emerald-700'
                    : g.result.verdict === 'partial' ? 'bg-amber-50 text-amber-700'
                    : 'bg-rose-50 text-rose-700'}`}>
                    {g.result.score}/{g.result.outOf}
                  </span>
                ) : g?.status === 'blank' ? (
                  <span className="text-sm font-bold rounded-full px-3 py-1 bg-slate-100 text-slate-500">Not attempted</span>
                ) : (
                  <span className="text-xs font-semibold rounded-full px-3 py-1 bg-amber-50 text-amber-700">Not marked</span>
                )}
              </div>
              <QuestionView q={x} />
              {x.figureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.figureUrl} alt="Figure" className="mt-3 max-h-72 rounded-xl border border-slate-100" />
              )}

              {g?.status === 'marked' && <Feedback g={g} />}
              {g?.status === 'error' && <p className="text-sm text-amber-700 mt-3">{g.message} — your working was not lost; redo it below without the clock.</p>}
              {g?.status === 'blank' && (
                <p className="text-sm text-slate-600 mt-3">Nothing written. In the exam, a first line on a blank question is the cheapest mark on the paper.</p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-4">
                {/* The solution route returns answer + worked solution; many
                    bank rows carry only the answer, so the button never hides —
                    it just promises less. */}
                {sol === undefined && (
                  <button onClick={() => showSolution(x.id)} disabled={solLoading === x.id}
                    className="bg-white border border-emerald-300 text-emerald-700 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {solLoading === x.id ? 'Loading…' : x.hasSolution ? '🔎 Show solution' : '🔎 Show answer'}
                  </button>
                )}
                <a href={`/app/practice?qid=${encodeURIComponent(x.id)}&from=timed`}
                  className="text-sm font-semibold text-navy underline">
                  Redo without the clock →
                </a>
              </div>
              {sol !== undefined && (
                <div className="mt-3 bg-white border border-emerald-100 rounded-2xl p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-2">Worked solution</div>
                  <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed math-working">
                    <MathMarkdown content={sol} />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button onClick={reset}
          className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-2xl py-3.5 text-base font-semibold active:scale-[0.98] transition">
          ⏱ Another set
        </button>
        <Link href="/app/practice" className="block text-center text-sm text-slate-500 py-2">← Back to Practise</Link>
        <p className="text-[11px] text-slate-300 text-center">AI-marked — not always perfect. If a mark looks wrong, trust your working and check with Adrian.</p>
      </div>
    );
  }

  return <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-400">Loading…</div>;
}

// Per-question feedback on the results page — the practice flow's panel,
// trimmed to what matters after a set: the working with per-line verdicts,
// part marks, and the next steps.
function Feedback({ g }: { g: Extract<Graded, { status: 'marked' }> }) {
  const byLine = new Map<number, LineComment>();
  for (const c of g.result.lineComments) byLine.set(c.line, c);
  return (
    <div className="mt-4">
      <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 mb-3">
        {g.lines.map((l, i) => {
          const c = byLine.get(i + 1);
          if (!l.trim() && !c) return null;
          return (
            <div key={i} className={`px-3 py-2 text-sm ${c && !c.ok ? 'bg-rose-50/50' : ''}`}>
              <div className="flex gap-2">
                <span className="text-slate-300 font-mono text-xs pt-0.5 w-5 shrink-0">{i + 1}</span>
                <span className={`text-slate-800 flex-1 whitespace-pre-wrap ${l.includes('$') ? '' : 'font-mono'}`}><MathText text={l} /></span>
                {c && <span>{c.ok ? '✓' : '✗'}</span>}
              </div>
              {c && (
                <div className="ml-7 mt-1 text-[13px] text-slate-600">
                  <MathText text={c.comment} />
                  {c.fix && <div className="text-emerald-700 mt-0.5">→ <MathText text={c.fix} /></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {g.result.partBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {g.result.partBreakdown.map(p => (
            <span key={p.label} title={p.comment.replace(/\$/g, '')}
              className="text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
              ({p.label}) {p.awarded}/{p.outOf}
            </span>
          ))}
        </div>
      )}
      {g.result.nextSteps.length > 0 && (
        <ul className="text-sm text-slate-700 list-disc pl-5 space-y-0.5">
          {g.result.nextSteps.map((st, i) => <li key={i}><MathText text={st} /></li>)}
        </ul>
      )}
    </div>
  );
}
