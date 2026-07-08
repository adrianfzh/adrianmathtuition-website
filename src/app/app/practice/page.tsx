'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { getSupabaseBrowser } from '@/lib/supabase-client';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

// Retrieval-first practice (PORTAL.md + tiered-router spec) + the Phase E
// grading loop: pick a topic → real bank question → type/snap working →
// Opus marks it line-by-line → revise → re-mark. Stage 1 (the picker) is a
// progress-aware grid scoped to the student's level AND subjects; the grading
// loop below it is unchanged. Students authenticate via the portal session;
// the admin-password mode remains for Adrian's testing (all levels, no mastery).

const REMARK = [remarkMath, remarkGfm];
const REHYPE = [rehypeRaw, rehypeKatex];

type LevelOpt = { key: string; label: string };

// Fallback level list shown before the overview call resolves. Kept in sync
// with ALL_QB_LEVELS in lib/practice.ts (can't import that here — it pulls in
// server-only modules).
const DEFAULT_LEVELS: LevelOpt[] = [
  { key: 'S1', label: 'Sec 1' }, { key: 'S2', label: 'Sec 2' },
  { key: 'S3_EM', label: 'Sec 3 E-Math' }, { key: 'S3_AM', label: 'Sec 3 A-Math' },
  { key: 'EM', label: 'O-Level E-Math' }, { key: 'EM_NA', label: 'E-Math (NA)' },
  { key: 'AM', label: 'O-Level A-Math' }, { key: 'JC1', label: 'JC1 H2 Math' },
  { key: 'JC2', label: 'JC2 H2 Math' },
];

type TopicStatus = 'strong' | 'practising' | 'weak' | 'new';
type TopicCard = {
  topic: string;
  questionCount: number;
  attempts: number;
  mastery: number | null;
  status: TopicStatus;
  lastPracticedAt: string | null;
};
type Recommended = { topic: string; level: string; reason: string };

const STATUS_META: Record<TopicStatus, { label: string; cls: string }> = {
  strong: { label: 'Strong', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  practising: { label: 'Practising', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  weak: { label: 'Needs work', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  new: { label: 'Not started', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

// Strand = the leading word before "(" in a topic name (Differentiation,
// Integration, Trigonometry, Algebra, Number, Geometry, …). Everything else
// collapses to that word, so the chip row is derived, not hard-coded.
function strandOf(topic: string): string {
  const head = (topic.split('(')[0] || topic).trim();
  return head.split(/\s+/)[0] || 'Other';
}

// Decorative mastery ring (conic-gradient). The % is exposed as text; the ring
// itself is aria-hidden.
function MasteryRing({ pct }: { pct: number | null }) {
  const gold = 'hsl(42, 95%, 50%)';
  const track = 'hsl(220, 16%, 88%)';
  const deg = pct != null ? Math.round(Math.max(0, Math.min(100, pct)) * 3.6) : 0;
  return (
    <div
      aria-hidden
      className="relative w-12 h-12 shrink-0 rounded-full"
      style={{ background: pct != null ? `conic-gradient(${gold} ${deg}deg, ${track} ${deg}deg)` : track }}
    >
      <div className="absolute inset-[3px] rounded-full bg-white flex items-center justify-center text-[11px] font-bold text-navy">
        {pct != null ? `${pct}%` : '—'}
      </div>
    </div>
  );
}

type Question = { id: string; markdown: string; marks: number | null; source: string | null; hasSolution: boolean };
type LineComment = { line: number; ok: boolean; comment: string; fix?: string; tag?: string; severity?: string };
type GradeResult = {
  verdict: 'correct' | 'partial' | 'wrong';
  score: number; outOf: number;
  partBreakdown: { label: string; awarded: number; outOf: number; comment: string }[];
  lineComments: LineComment[];
  strengths: string[]; nextSteps: string[];
  transcribedLines?: string[];
};

// Downscale + re-encode any camera image to a small JPEG (also normalises
// HEIC on iOS, since Safari decodes it into the canvas).
async function fileToJpegDataUrl(file: File, maxDim = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read that image'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PracticePage() {
  // mode: checking → student (portal session) | admin (password) | locked
  const [mode, setMode] = useState<'checking' | 'student' | 'admin' | 'locked'>('checking');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Stage 1 picker state
  const [levels, setLevels] = useState<LevelOpt[]>(DEFAULT_LEVELS);
  const [level, setLevel] = useState('AM');
  const [topics, setTopics] = useState<TopicCard[]>([]);
  const [recommended, setRecommended] = useState<Recommended[]>([]);
  const [topic, setTopic] = useState('');
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [search, setSearch] = useState('');
  const [strand, setStrand] = useState('All');

  const [q, setQ] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState('');
  const [seen, setSeen] = useState<string[]>([]);
  const questionRef = useRef<HTMLDivElement>(null);

  const [solution, setSolution] = useState<string | null>(null);
  const [solLoading, setSolLoading] = useState(false);

  // Grading state (students only)
  const [working, setWorking] = useState('');
  const [photo, setPhoto] = useState<string | null>(null); // JPEG data URL, downscaled
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [gradedLines, setGradedLines] = useState<string[]>([]);
  const [prevScore, setPrevScore] = useState<number | null>(null);
  const [weakTags, setWeakTags] = useState<string[]>([]);

  // Admin generation harness state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gen, setGen] = useState<any>(null);
  const [genLoading, setGenLoading] = useState(false);

  // Detect portal session first; fall back to admin session mode
  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data: { user } }) => {
      if (user) { setMode('student'); return; }
      ensureAdminSession().then(ok => setMode(ok ? 'admin' : 'locked'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyAdmin(pw: string) {
    setAuthLoading(true);
    try {
      const ok = await loginAdminSession(pw);
      if (ok) setMode('admin');
      else { setAuthError('Incorrect password'); setMode('locked'); }
    } catch { setAuthError('Connection error'); setMode('locked'); }
    finally { setAuthLoading(false); }
  }

  // Load the progress-aware overview when the level changes (once authed).
  useEffect(() => {
    if (mode !== 'student' && mode !== 'admin') return;
    setLoadingOverview(true); setTopic(''); setTopics([]); setRecommended([]);
    setQ(null); setExhausted(false); setError(''); resetAttempt();
    fetch(`/api/portal/practice/overview?level=${encodeURIComponent(level)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setTopics(d.topics || []);
        setRecommended(d.recommended || []);
        if (Array.isArray(d.levels) && d.levels.length) {
          setLevels(d.levels);
          if (!d.levels.some((l: LevelOpt) => l.key === level)) setLevel(d.levels[0].key);
        }
      })
      .catch(() => setError('Could not load your practice topics'))
      .finally(() => setLoadingOverview(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, mode]);

  // Scroll the question into view once it loads (after a card click).
  useEffect(() => {
    if (q) questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [q]);

  function resetAttempt() {
    setWorking(''); setGrade(null); setGradedLines([]); setPrevScore(null); setSolution(null);
  }

  const fetchNext = useCallback(async (excludeIds: string[], topicArg?: string) => {
    const useTopic = topicArg ?? topic;
    if (!useTopic) return;
    setLoading(true); setError(''); setExhausted(false); resetAttempt();
    try {
      const r = await fetch('/api/portal/practice/next', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, topic: useTopic, exclude: excludeIds }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Something went wrong'); return; }
      if (!d.question) { setExhausted(true); setQ(null); return; }
      setQ(d.question);
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }, [level, topic]);

  // Clicking a topic card / recommendation starts that topic immediately.
  function startTopic(t: string) {
    setTopic(t); setSeen([]); fetchNext([], t);
  }
  function tryAnother() {
    const nextSeen = q ? [...seen, q.id] : seen;
    setSeen(nextSeen);
    fetchNext(nextSeen);
  }

  async function showSolution() {
    if (!q) return;
    setSolLoading(true);
    try {
      const r = await fetch(`/api/portal/practice/solution?id=${q.id}`);
      const d = await r.json();
      setSolution(r.ok ? d.markdown : '_Could not load the solution._');
    } catch { setSolution('_Could not load the solution._'); }
    finally { setSolLoading(false); }
  }

  async function handlePhotoPick(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true); setError('');
    try {
      setPhoto(await fileToJpegDataUrl(file));
    } catch { setError('Could not read that photo — try again.'); }
    finally { setPhotoBusy(false); }
  }

  async function submitForMarking() {
    if (!q || grading) return;
    const lines = working.split('\n');
    setGrading(true); setError('');
    try {
      const body = photo
        ? { questionId: q.id, image: { data: photo.split(',')[1], mediaType: 'image/jpeg' } }
        : { questionId: q.id, lines };
      const r = await fetch('/api/portal/practice/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Marking failed'); return; }
      if (grade) setPrevScore(grade.score);
      setGrade(d.result);
      setGradedLines(d.result?.transcribedLines || lines);
      setWeakTags(d.weaknessTags || []);
    } catch { setError('Connection error while marking'); }
    finally { setGrading(false); }
  }

  const commentsByLine = new Map<number, LineComment>();
  if (grade) for (const c of grade.lineComments) commentsByLine.set(c.line, c);

  // Admin test harness for Stage 2 generation (not part of the student flow).
  async function testGenerate() {
    if (!topic) return;
    setGenLoading(true); setGen(null);
    try {
      const r = await fetch('/api/portal/practice/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, topic, maxRetries: 1, cache: false }),
      });
      setGen(await r.json());
    } catch { setGen({ ok: false, error: 'connection error' }); }
    finally { setGenLoading(false); }
  }

  // ── Locked (no session, no admin cookie) ──
  if (mode === 'checking') {
    return <div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (mode === 'locked') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-7 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h1 className="text-lg font-bold text-slate-800">Practice</h1>
          <p className="text-xs text-slate-400 mb-5">Log in to the portal to practise — or enter the admin password (testing).</p>
          <a href="/login" className="block w-full bg-navy text-[hsl(45,100%,96%)] rounded-lg py-2.5 text-sm font-semibold mb-4">Log in</a>
          <form onSubmit={(e) => { e.preventDefault(); setAuthError(''); verifyAdmin(password); }}>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuthError(''); }} placeholder="Admin password"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-2" />
            {authError && <p className="text-xs text-red-500 mb-2">{authError}</p>}
            <button type="submit" disabled={authLoading || !password}
              className="w-full bg-slate-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">
              {authLoading ? 'Checking…' : 'Enter (admin)'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isStudent = mode === 'student';

  // Strand chips derived from the loaded topic list.
  const strandChips = ['All', ...Array.from(new Set(topics.map(t => strandOf(t.topic)))).sort()];
  const filteredTopics = topics.filter(t =>
    (strand === 'All' || strandOf(t.topic) === strand) &&
    (!search.trim() || t.topic.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <div className="pb-20 sm:pb-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-navy mb-1 pt-1">Practice</h1>
      <p className="text-sm text-slate-500 mb-4">
        {isStudent
          ? 'Pick a topic to start — snap or type your working and get it marked line by line.'
          : 'Admin testing mode — all levels, retrieval + generation harness (no student mastery).'}
      </p>

      {/* ── Stage 1: progress-aware picker ── */}
      {/* Segmented level control */}
      <div className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        {levels.map((l) => (
          <button key={l.key} onClick={() => setLevel(l.key)}
            className={`text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors ${
              level === l.key ? 'bg-navy text-[hsl(45,100%,96%)]' : 'text-slate-500 hover:text-navy'}`}>
            {l.label}
          </button>
        ))}
      </div>

      {/* Search + strand filter */}
      <div className="flex flex-col gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topics…"
          className="w-full sm:max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30" />
        {strandChips.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {strandChips.map((s) => (
              <button key={s} onClick={() => setStrand(s)}
                className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${
                  strand === s ? 'bg-navy text-[hsl(45,100%,96%)] border-navy' : 'bg-white text-slate-500 border-slate-200 hover:border-navy/40'}`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recommended for you (students only) */}
      {isStudent && recommended.length > 0 && (
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">⭐ Recommended for you</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {recommended.map((r) => {
              const t = topics.find(x => x.topic === r.topic);
              return (
                <button key={r.topic} onClick={() => startTopic(r.topic)}
                  className="group text-left rounded-2xl p-4 border border-[hsl(42,90%,62%)] bg-[hsl(45,100%,97%)] flex gap-3 items-center hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-[hsl(42,90%,50%)]">
                  <MasteryRing pct={t?.mastery ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-navy text-sm truncate">{r.topic}</div>
                    <div className="text-[11px] text-[hsl(35,55%,38%)] mt-0.5">{r.reason}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: test-generate control (kept from the old harness) */}
      {!isStudent && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-slate-400">{topic ? `Selected: ${topic}` : 'Pick a topic card to test-generate.'}</span>
          <button onClick={testGenerate} disabled={!topic || genLoading} title="Admin: generate + code-verify one question (Stage 2)"
            className="bg-white border border-violet-300 text-violet-700 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
            {genLoading ? 'Generating…' : '🧪 Test generate'}
          </button>
        </div>
      )}

      {/* Topic grid (web) / rows (mobile) */}
      {loadingOverview ? (
        <p className="text-sm text-slate-400 mb-5">Loading topics…</p>
      ) : filteredTopics.length === 0 ? (
        <p className="text-sm text-slate-400 mb-5">
          {topics.length === 0 ? 'No topics available for this level yet.' : 'No topics match your search.'}
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:[grid-template-columns:repeat(auto-fill,minmax(230px,1fr))] mb-6">
          {filteredTopics.map((t) => {
            const meta = STATUS_META[t.status];
            return (
              <button key={t.topic} onClick={() => startTopic(t.topic)}
                className={`group text-left bg-white border rounded-2xl p-4 flex gap-3 items-center transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy/30 ${
                  topic === t.topic ? 'border-navy ring-2 ring-navy/20' : 'border-slate-200'}`}>
                <MasteryRing pct={t.mastery} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-navy text-sm truncate">{t.topic}</div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                    <span className="text-[11px] text-slate-400">{t.questionCount}+ questions</span>
                  </div>
                </div>
                <span className="text-navy text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline shrink-0">Start →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stage 2 generation test result (admin) */}
      {!isStudent && gen && (
        <div className={`border rounded-2xl p-5 mb-5 ${gen.ok ? 'bg-violet-50 border-violet-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex justify-between items-center mb-2 text-xs">
            <span className="font-bold uppercase tracking-wide text-slate-500">🧪 Generated (test){gen.ms ? ` · ${(gen.ms / 1000).toFixed(0)}s` : ''}{typeof gen.attempts === 'number' ? ` · ${gen.attempts} attempt${gen.attempts === 1 ? '' : 's'}` : ''}</span>
            <span className={`font-bold ${gen.ok ? 'text-violet-700' : 'text-rose-600'}`}>{gen.ok ? '✓ VERIFIED' : '✗ REJECTED'}</span>
          </div>
          {gen.ok ? (
            <>
              <div className="prose prose-sm max-w-none text-slate-800"><ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{gen.question?.question || ''}</ReactMarkdown></div>
              <div className="mt-3 text-sm text-slate-700"><b>Answer:</b> {gen.question?.answer}</div>
              <div className="mt-1 text-xs text-emerald-700">code-computed: {gen.verify?.computedAnswer} · wellPosed:{String(gen.verify?.wellPosed)} matches:{String(gen.verify?.matches)}</div>
              {gen.question?.solution && <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer text-slate-500">solution</summary><div className="prose prose-sm max-w-none mt-1"><ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{gen.question.solution}</ReactMarkdown></div></details>}
            </>
          ) : (
            <div className="text-sm text-rose-700">{gen.reason || gen.error || 'failed'}{gen.lastVerify ? ` — computed ${gen.lastVerify.computedAnswer} vs claimed (mismatch); ${gen.lastVerify.reason || ''}` : ''}</div>
          )}
          <div className="mt-3 text-[11px] text-slate-400">Not saved to the bank (test mode). Not shown to students.</div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Finding a question…</p>}

      {exhausted && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          You&apos;ve seen every question we have for this topic. Try another topic, or tap the topic card again to go through them again.
        </div>
      )}

      <div ref={questionRef}>
      {q && !loading && (
        <div className="space-y-4">
          {/* Question card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            {q.marks ? (
              <div className="flex justify-end items-center mb-3 text-xs text-slate-400">
                <span className="font-semibold">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
              </div>
            ) : null}
            <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed">
              <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{q.markdown}</ReactMarkdown>
            </div>
          </div>

          {/* Working editor (students): photo-first, typing as fallback */}
          {isStudent && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Your working
              </p>

              <input
                ref={fileInputRef} type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={(e) => { handlePhotoPick(e.target.files?.[0]); e.target.value = ''; }}
              />

              {photo ? (
                <div className="mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Your working" className="max-h-64 rounded-xl border border-slate-200" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy || grading}
                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">📷 Retake</button>
                    <button onClick={() => setPhoto(null)} disabled={grading}
                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">✕ Remove — type instead</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy || grading}
                    className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 text-sm font-semibold text-slate-500 hover:border-navy/40 hover:text-navy transition-colors mb-3">
                    {photoBusy ? 'Reading photo…' : '📷 Snap a photo of your working on paper'}
                  </button>
                  <p className="text-[11px] text-slate-400 -mt-1 mb-2 text-center">or type it, one step per line:</p>
                  <textarea
                    value={working}
                    onChange={(e) => setWorking(e.target.value)}
                    rows={Math.max(5, working.split('\n').length + 1)}
                    placeholder={'e.g.\n2x^2 - 3x + 9 = 2(x^2 - 3/2 x) + 9\n= 2(x - 3/4)^2 - 9/8 + 9\n= 2(x - 3/4)^2 + 63/8'}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-3 text-sm font-mono leading-6 focus:outline-none focus:ring-2 focus:ring-navy/30"
                    disabled={grading}
                  />
                </>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button onClick={submitForMarking}
                  disabled={grading || (!photo && !working.trim()) || solution !== null}
                  className="bg-navy text-[hsl(45,100%,96%)] rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40">
                  {grading ? 'Marking… (≈30s)' : grade ? '✏️ Re-mark my working' : '✅ Get it marked'}
                </button>
                {solution === null && (
                  <button onClick={showSolution} disabled={solLoading}
                    className="bg-white border border-emerald-300 text-emerald-700 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {solLoading ? 'Loading…' : '🔎 Show solution'}
                  </button>
                )}
                <button onClick={tryAnother} disabled={loading}
                  className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
                  🔄 Try another
                </button>
                {solution !== null && (
                  <span className="text-xs text-slate-400">Marking is off once you&apos;ve seen the solution.</span>
                )}
              </div>
            </div>
          )}

          {/* Feedback panel */}
          {isStudent && grade && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Feedback</p>
                <div className="flex items-center gap-2">
                  {prevScore !== null && prevScore !== grade.score && (
                    <span className={`text-xs font-semibold ${grade.score > prevScore ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {grade.score > prevScore ? '▲' : '▼'} was {prevScore}/{grade.outOf}
                    </span>
                  )}
                  <span className={`text-sm font-bold rounded-full px-3 py-1 ${
                    grade.verdict === 'correct' ? 'bg-emerald-50 text-emerald-700'
                    : grade.verdict === 'partial' ? 'bg-amber-50 text-amber-700'
                    : 'bg-rose-50 text-rose-700'}`}>
                    {grade.score}/{grade.outOf}
                  </span>
                </div>
              </div>

              {grade.transcribedLines && (
                <p className="text-[11px] text-slate-400 mb-2">
                  📷 Transcribed from your photo — if a step was misread, retake a clearer shot.
                </p>
              )}

              {/* Working with per-line verdicts */}
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 mb-4">
                {gradedLines.map((l, i) => {
                  const c = commentsByLine.get(i + 1);
                  if (!l.trim() && !c) return null;
                  return (
                    <div key={i} className={`px-3 py-2 text-sm ${c && !c.ok ? 'bg-rose-50/50' : ''}`}>
                      <div className="flex gap-2">
                        <span className="text-slate-300 font-mono text-xs pt-0.5 w-5 shrink-0">{i + 1}</span>
                        <span className="font-mono text-slate-800 flex-1 whitespace-pre-wrap">{l}</span>
                        {c && <span>{c.ok ? '✓' : '✗'}</span>}
                      </div>
                      {c && (
                        <div className="ml-7 mt-1 text-[13px] text-slate-600">
                          {c.comment}
                          {c.fix && <div className="text-emerald-700 mt-0.5">→ {c.fix}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {grade.partBreakdown.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {grade.partBreakdown.map(p => (
                    <span key={p.label} title={p.comment}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                      ({p.label}) {p.awarded}/{p.outOf}
                    </span>
                  ))}
                </div>
              )}

              {grade.strengths.length > 0 && (
                <p className="text-sm text-emerald-700 mb-1.5">💪 {grade.strengths.join(' · ')}</p>
              )}
              {grade.nextSteps.length > 0 && (
                <ul className="text-sm text-slate-700 list-disc pl-5 space-y-0.5">
                  {grade.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
              {weakTags.length > 0 && (
                <p className="text-xs text-slate-400 mt-3">
                  Working on: {weakTags.map(t => <span key={t} className="inline-block bg-slate-100 rounded-full px-2 py-0.5 ml-1">{t}</span>)}
                </p>
              )}
              <p className="text-[11px] text-slate-300 mt-3">AI marking — Adrian reviews grades during the beta.</p>
            </div>
          )}

          {/* Solution (both modes) */}
          {!isStudent && q && solution === null && (
            <button onClick={showSolution} disabled={solLoading}
              className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {solLoading ? 'Loading…' : '🔎 Show solution'}
            </button>
          )}
          {!isStudent && (
            <button onClick={tryAnother} disabled={loading}
              className="ml-2 bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
              🔄 Try another
            </button>
          )}
          {solution !== null && (
            <div className="bg-white border border-emerald-100 rounded-2xl p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-2">Worked solution</div>
              <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
                <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{solution}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
