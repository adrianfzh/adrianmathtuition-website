'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { MathMarkdown } from '@/lib/math-markdown';
import { getSupabaseBrowser } from '@/lib/supabase-client';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

// Retrieval-first practice (PORTAL.md + tiered-router spec) + the Phase E
// grading loop: pick a topic → choose Standard / Advanced → real bank question
// → type/snap working → Opus marks it line-by-line → revise → re-mark. Stage 1
// (the picker) is a progress-aware grid scoped to the student's level AND
// subjects; the grading loop below it is unchanged. Students authenticate via
// the portal session; the admin-password mode remains for Adrian's testing
// (all levels, no mastery).
//
// Open to students during the marking-only beta (Adrian 2026-08-21: "students
// can choose a topic, then standard or advanced, then a question will get
// shown"). It was briefly embedded on the student Home; it now has its own
// tab — Home just links here.

// Every markdown/KaTeX string on this page goes through the ONE shared
// pipeline in lib/math-markdown.tsx (fixMathFences + prepareMath + KaTeX
// options). Until 2026-08-23 this file carried its own plugin set, which is
// why bank questions with `$\$18\,000$` rendered as "\18,000 .MrLimmade…" and
// `$$\begin{array}` tables sat inline and ran off the phone screen.

// Inline KaTeX for grader output (transcribed lines, comments, fixes). Typed
// student lines and plain-text comments pass through untouched — markdown
// rendering only kicks in when the string actually carries $...$ math, so a
// hand-typed "3*4*5" can never get italicised by markdown rules.
const INLINE_P = { p: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <>{text}</>;
  return <MathMarkdown content={text} components={INLINE_P} />;
}

type LevelOpt = { key: string; label: string };

// Picker types + the topic sheet live in ./topic-picker.tsx (student picker);
// strand/family grouping is lib/practice-strands.ts (pure, tested).
import {
  MasteryRing, STATUS_META, TIER_KEY, TopicPicker, TopicSheet,
  type Recommended, type Subgroup, type Tier, type TopicCard,
} from './topic-picker';
import { bankScope } from '@/lib/qb-levels';
import { topicOrderComparator } from '@/lib/notes-tree';
import { familyOf, variantOf } from '@/lib/practice-strands';

// Admin picker only: leading word before "(" → derived chip row.
function strandOf(topic: string): string {
  const head = (topic.split('(')[0] || topic).trim();
  return head.split(/\s+/)[0] || 'Other';
}

// Mirrors StructuredPart in lib/bank-question-markdown.ts (server module).
type QPart = { label: string; text: string; marks: number | null; subparts: QPart[] };
type Question = {
  id: string; markdown: string; stem: string; parts: QPart[];
  marks: number | null; figureUrl?: string | null; source: string | null; hasSolution: boolean;
};

function Md({ text }: { text: string }) {
  return <MathMarkdown content={text} />;
}

// Exam-style layout: a 4-column grid — part label · sub-part label · text ·
// marks. A part with its own text spans the two inner columns; a bare "(b)"
// that only carries sub-parts puts its label on the same row as "(i)", so
// "(b) (i) …" reads as one line the way it does on the paper. Marks sit in
// the last column, bottom-aligned, as "[3]". Only the text cells go through
// markdown, so KaTeX keeps working inside them.
function QuestionView({ q }: { q: Question }) {
  const rows: React.ReactNode[] = [];
  const label = 'font-semibold text-slate-800 whitespace-nowrap pr-1 self-baseline';
  const text = 'prose prose-sm max-w-none text-slate-800 leading-relaxed min-w-0 [&>p]:my-0 [&>p+p]:mt-2';
  const marks = 'self-end text-xs text-slate-500 tabular-nums pl-2 pb-0.5 whitespace-nowrap';
  const fmt = (l: string) => (l ? `(${l})` : '');
  q.parts.forEach((p, i) => {
    const hasText = p.text.trim().length > 0;
    if (hasText || p.subparts.length === 0) {
      rows.push(
        <div key={`p${i}`} className={label} style={{ gridColumn: 1 }}>{fmt(p.label)}</div>,
        <div key={`t${i}`} className={text} style={{ gridColumn: '2 / 4' }}><Md text={p.text} /></div>,
        <div key={`m${i}`} className={marks} style={{ gridColumn: 4 }}>{p.marks ? `[${p.marks}]` : ''}</div>,
      );
    }
    p.subparts.forEach((sp, j) => {
      rows.push(
        <div key={`p${i}s${j}`} className={label} style={{ gridColumn: 1 }}>{!hasText && j === 0 ? fmt(p.label) : ''}</div>,
        <div key={`l${i}s${j}`} className={label} style={{ gridColumn: 2 }}>{fmt(sp.label)}</div>,
        <div key={`t${i}s${j}`} className={text} style={{ gridColumn: 3 }}><Md text={sp.text} /></div>,
        <div key={`m${i}s${j}`} className={marks} style={{ gridColumn: 4 }}>{sp.marks ? `[${sp.marks}]` : ''}</div>,
      );
    });
  });
  const hasSub = q.parts.some(p => p.subparts.length > 0);
  // Both label columns size to their widest label ("(iii)"); an unused
  // sub-part column collapses to nothing.
  const cols = `max-content ${hasSub ? 'max-content' : '0'} minmax(0, 1fr) max-content`;
  return (
    <div className="math-working">
      {q.stem && (
        <div className={`prose prose-sm max-w-none text-slate-800 leading-relaxed ${q.parts.length ? 'mb-3' : ''}`}>
          <Md text={q.stem} />
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid items-start" style={{ gridTemplateColumns: cols, columnGap: '0.35rem', rowGap: '0.6rem' }}>
          {rows}
        </div>
      )}
    </div>
  );
}
type LineComment = { line: number; ok: boolean; comment: string; fix?: string; tag?: string; severity?: string };
type MarkAnatomyItem = { code: string; for: string; earned: boolean };
type GradeResult = {
  verdict: 'correct' | 'partial' | 'wrong';
  score: number; outOf: number;
  partBreakdown: { label: string; awarded: number; outOf: number; comment: string; markAnatomy?: MarkAnatomyItem[] }[];
  lineComments: LineComment[];
  strengths: string[]; nextSteps: string[];
  transcribedLines?: string[];
};

// Camera-photo downscale lives in ./image-downscale.ts, shared with the
// question-finder ("Snap a question"), which sends the same kind of photo.
import { fileToJpegDataUrl } from './image-downscale';
import QuestionFinder from './question-finder';

// `initialLevels` comes from the server page for a signed-in student (their
// scoped QB levels) so the level control is right on first paint; null means
// "not a student — detect admin/locked client-side".
// "From Adrian" assignment mode (SPEC-ASSIGN.md): the server page resolves the
// assigned bank question and hands it in as `initialAssignment`. The flow then
// skips the picker, shows a banner with Adrian's note, and grades through the
// same /grade route with `assignmentId` attached (cap-exempt, marks the
// assignment, Telegrams Adrian). Tier toggle / "Try another" are hidden —
// this is THE question, not a stream.
export type InitialAssignment = {
  id: string; title: string; note: string | null; reminder: string | null; dueLabel: string | null;
  topic: string | null; tier: Tier | null; status: 'assigned' | 'submitted' | 'marked';
  score: number | null; outOf: number | null; question: Question;
};

// ?qid= deep-link mode (the page resolves + eligibility-checks the question
// server-side): ONE fixed bank question in the same graded loop — from a
// marked paper's "Try it now", a My Notebook retry, a photo/search match, or
// a freshly generated question. Like assignment mode there is no picker and
// no question stream; unlike it there is no due date, no Telegram, no cap
// exemption — it's a normal practice attempt on a chosen question. `topic`
// (the question's bank topic, when known) powers the "more of this topic"
// follow-up after grading.
export type FixedQuestion = {
  question: Question;
  from: 'marked' | 'photo' | 'search' | 'generated' | 'notebook' | null;
  topic: string | null;
};

const FIXED_FROM: Record<NonNullable<FixedQuestion['from']> | 'link', { label: string; blurb: string }> = {
  marked: { label: '📄 From your marked paper', blurb: 'A question like the one you dropped marks on — try it here, then get it marked.' },
  notebook: { label: '📓 From your notebook', blurb: 'A twin of a question you dropped marks on — beat it here and get it marked.' },
  photo: { label: '📷 Matched to your photo', blurb: 'The closest bank question to the one you snapped — work it here and get it marked.' },
  search: { label: '🔍 From your search', blurb: 'Work it here — snap or type your working and get it marked.' },
  generated: { label: '✨ Made for you', blurb: 'A fresh question written for you and checked to solve correctly. Work it here and get it marked.' },
  link: { label: '🎯 Practice question', blurb: 'Work it here — snap or type your working and get it marked.' },
};

export default function PracticeFlow({ initialLevels = null, initialAssignment = null, initialTarget = null, initialQuestion = null }: {
  initialLevels?: LevelOpt[] | null; initialAssignment?: InitialAssignment | null;
  /** Deep link from /notes ("Practise this topic"): preselect the level and
   *  open that topic's sheet once the overview loads. One-shot. */
  initialTarget?: { level: string | null; topic: string } | null;
  initialQuestion?: FixedQuestion | null;
}) {
  const assignment = initialAssignment;
  // Fixed ?qid= question — assignment wins if both somehow arrive.
  const fixedQ = assignment ? null : initialQuestion;
  const targetRef = useRef(initialTarget);
  // mode: checking → student (portal session) | admin (password) | locked
  const [mode, setMode] = useState<'checking' | 'student' | 'admin' | 'locked'>(initialLevels || assignment ? 'student' : 'checking');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Stage 1 picker state
  const [levels, setLevels] = useState<LevelOpt[]>(initialLevels ?? []);
  const [level, setLevel] = useState(() => {
    const t = initialTarget?.level;
    if (t && (!initialLevels || initialLevels.some(l => l.key === t))) return t;
    return initialLevels?.some(l => l.key === 'AM') ? 'AM' : (initialLevels?.[0]?.key ?? 'AM');
  });
  const [tier, setTier] = useState<Tier>(assignment?.tier ?? 'Standard');
  const [tierPicked, setTierPicked] = useState(!!assignment || !!fixedQ);   // admin: topic chosen → pick Standard/Advanced → question
  const [topics, setTopics] = useState<TopicCard[]>([]);
  const [recommended, setRecommended] = useState<Recommended[]>([]);
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);   // question types for the level (topic sheet)
  const [topic, setTopic] = useState(assignment?.topic ?? '');
  const [sheetTopic, setSheetTopic] = useState<string | null>(null);   // student: topic sheet open for…
  const [subgroup, setSubgroup] = useState<Subgroup | null>(null);     // chosen question type (null = whole topic)
  const [loadingOverview, setLoadingOverview] = useState(!!initialLevels && !assignment && !fixedQ); // student: skeleton on first paint, not "No topics"
  const [search, setSearch] = useState('');
  const [strand, setStrand] = useState('All');

  const [q, setQ] = useState<Question | null>(assignment?.question ?? fixedQ?.question ?? null);
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
  const [gradedViaPhoto, setGradedViaPhoto] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);      // camera (capture="environment")
  const libraryInputRef = useRef<HTMLInputElement>(null);   // photo album (no capture)
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [gradedLines, setGradedLines] = useState<string[]>([]);
  const [prevScore, setPrevScore] = useState<number | null>(null);
  const [weakTags, setWeakTags] = useState<string[]>([]);
  // Assignment mode: what the server knew at load (marked → score shown in
  // the banner until a fresh grade replaces it).
  const [assignDone, setAssignDone] = useState<{ score: number; outOf: number } | null>(
    assignment?.status === 'marked' && assignment.score != null && assignment.outOf != null
      ? { score: assignment.score, outOf: assignment.outOf } : null);

  // Admin generation harness state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gen, setGen] = useState<any>(null);
  const [genLoading, setGenLoading] = useState(false);

  // Remembered Standard/Advanced (topic sheet) — read after mount so SSR and
  // the first client paint agree.
  useEffect(() => {
    if (assignment || fixedQ) return;
    try {
      const t = window.localStorage.getItem(TIER_KEY);
      if (t === 'Standard' || t === 'Advanced') setTier(t);
    } catch { /* private mode */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function rememberTier(t: Tier) {
    setTier(t);
    try { window.localStorage.setItem(TIER_KEY, t); } catch { /* private mode */ }
  }

  // Detect portal session first; fall back to admin session mode. Skipped when
  // the server already told us this is a student.
  useEffect(() => {
    if (mode !== 'checking') return;
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
    if (assignment || fixedQ) return;   // the question is fixed; no picker, no overview
    setLoadingOverview(true); setTopic(''); setTopics([]); setRecommended([]); setSubgroups([]);
    setSheetTopic(null); setSubgroup(null);
    setQ(null); setExhausted(false); setError(''); resetAttempt(); setTierPicked(false);
    // Question types load alongside; the sheet reads them from state, so
    // opening a topic costs no round trip.
    fetch(`/api/portal/practice/subgroups?level=${encodeURIComponent(level)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setSubgroups(d.subgroups || []); })
      .catch(() => { /* sheet just shows "Start" with no type list */ });
    fetch(`/api/portal/practice/overview?level=${encodeURIComponent(level)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        // Syllabus/textbook order, not the API's alphabetical — the same
        // comparator the notes reader uses, so both surfaces list topics
        // the way the textbook does (Adrian, 2026-08-28).
        const byTextbook = topicOrderComparator(level);
        setTopics((d.topics || []).slice().sort((a: TopicCard, b: TopicCard) => byTextbook(a.topic, b.topic)));
        setRecommended(d.recommended || []);
        // One-shot deep-link: open the linked topic's sheet if this level has it.
        const target = targetRef.current;
        if (target && (d.topics || []).some((t: TopicCard) => t.topic === target.topic)) {
          setSheetTopic(target.topic);
          targetRef.current = null;
        }
        if (Array.isArray(d.levels) && d.levels.length) {
          setLevels(d.levels);
          if (!d.levels.some((l: LevelOpt) => l.key === level)) setLevel(d.levels[0].key);
        }
      })
      .catch(() => setError('Could not load your practice topics'))
      .finally(() => setLoadingOverview(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, mode]);

  // Scroll the tier chooser / question into view after a card click.
  useEffect(() => {
    if (assignment || fixedQ) return;   // already at the top of the page
    if (topic || q) questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, q]);

  // One-shot ?topic= deep-link — /app/marking's focus chips land here. Read
  // from window (not useSearchParams) so no Suspense boundary is needed. An
  // exact topic match opens that topic's sheet (one tap from a question);
  // anything else (marking's topic_detected doesn't always match a bank topic
  // name verbatim) lands in the search box so the closest rows are on screen.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    if ((mode !== 'student' && mode !== 'admin') || loadingOverview || topics.length === 0) return;
    deepLinked.current = true;
    const want = new URLSearchParams(window.location.search).get('topic')?.trim();
    if (!want) return;
    const exact = topics.find(t => t.topic.toLowerCase() === want.toLowerCase());
    if (exact) { if (mode === 'student') setSheetTopic(exact.topic); else startTopic(exact.topic); }
    else setSearch(want);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, loadingOverview, topics]);

  function resetAttempt() {
    setWorking(''); setGrade(null); setGradedLines([]); setGradedViaPhoto(false); setPrevScore(null); setSolution(null);
  }

  const fetchNext = useCallback(async (excludeIds: string[], topicArg?: string, tierArg?: Tier, sgArg?: Subgroup | null) => {
    const useTopic = topicArg ?? topic;
    if (!useTopic) return;
    const sg = sgArg === undefined ? subgroup : sgArg;
    setLoading(true); setError(''); setExhausted(false); resetAttempt();
    try {
      const r = await fetch('/api/portal/practice/next', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, topic: useTopic, exclude: excludeIds, tier: tierArg ?? tier, subgroupId: sg?.id ?? null }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Something went wrong'); return; }
      if (!d.question) { setExhausted(true); setQ(null); return; }
      setQ(d.question);
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }, [level, topic, tier, subgroup]);

  // Clicking a topic card / recommendation selects it and asks for the tier;
  // the question only loads once Standard / Advanced is chosen.
  function changeTopic() {
    setTopic(''); setSubgroup(null); setQ(null); setSeen([]); setExhausted(false); setError(''); resetAttempt(); setTierPicked(false);
  }
  function startTopic(t: string) {
    setTopic(t); setSubgroup(null); setSeen([]); setQ(null); setExhausted(false); setError(''); resetAttempt();
    setTierPicked(false);
  }
  function pickTier(t: Tier) {
    setTier(t); setTierPicked(true); setSeen([]); setExhausted(false);
    if (topic) fetchNext([], topic, t);
  }
  // Student: the topic sheet decided everything — topic, tier, and optionally
  // one question type — so the question loads straight away.
  function startFromSheet(t: string, tr: Tier, sg: Subgroup | null) {
    setSheetTopic(null);
    rememberTier(tr);
    setTopic(t); setSubgroup(sg); setSeen([]); setQ(null); setExhausted(false); setError(''); resetAttempt();
    setTierPicked(true);
    fetchNext([], t, tr, sg);
  }
  // Switching Standard ↔ Advanced on a loaded question restarts the topic on
  // the new tier (fresh unseen-list — the two pools don't overlap).
  function switchTier(t: Tier) {
    if (t === tier) return;
    rememberTier(t);
    setTierPicked(true); setSeen([]); setExhausted(false);
    if (topic) fetchNext([], topic, t);
  }
  // Exhausted a question type → widen to the whole topic on the same tier.
  function widenToTopic() {
    setSubgroup(null); setSeen([]); setExhausted(false);
    if (topic) fetchNext([], topic, tier, null);
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
      const body = {
        ...(photo
          ? { questionId: q.id, image: { data: photo.split(',')[1], mediaType: 'image/jpeg' } }
          : { questionId: q.id, lines }),
        ...(assignment ? { assignmentId: assignment.id } : {}),
      };
      const r = await fetch('/api/portal/practice/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Marking failed'); return; }
      if (grade) setPrevScore(grade.score);
      setGrade(d.result);
      // Typed path: the grader echoes the lines back as LaTeX. Use them only
      // when the count matches, so lineComments' numbering stays valid.
      const tl: string[] | undefined = d.result?.transcribedLines;
      setGradedLines(photo ? (tl || lines) : (tl && tl.length === lines.length ? tl : lines));
      setGradedViaPhoto(!!photo);
      setWeakTags(d.weaknessTags || []);
      if (assignment && d.result) setAssignDone({ score: d.result.score, outOf: d.result.outOf });
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
  const selected = topics.find(t => t.topic === topic) || null;
  const sheetCard = sheetTopic ? (topics.find(t => t.topic === sheetTopic) || null) : null;
  const sheetTypes = sheetTopic ? subgroups.filter(s => s.topic === sheetTopic) : [];
  // Students: once a topic is chosen the picker folds away into a "← Change
  // topic" bar so the tier chooser / question sits at the top of the card
  // instead of below a phone-length list of topic rows. Admin keeps the grid
  // (the test-generate harness works off the selected card).
  const pickerOpen = !assignment && !fixedQ && (!isStudent || !topic);
  const fixedMeta = fixedQ ? FIXED_FROM[fixedQ.from ?? 'link'] : null;
  // "Print a paper" entry (SPEC-PRINT-PAPER.md) — a slim row below the topic
  // list, not a fat card above everything (Adrian, phone review round 5: it
  // sat above the whole page and stayed on screen even while a question was
  // open). Hides the instant any topic is chosen, same as assignment/fixed
  // question mode — "the picker" is the only place it belongs.
  const showPrintEntry = !assignment && !fixedQ && !topic;

  return (
    <div className="pb-20 sm:pb-6 max-w-4xl mx-auto">
      {/* Assignment banner — replaces the title row + picker entirely. */}
      {assignment && (
        <div className="mb-4 pt-1">
          <Link href="/app/assignments" className="text-sm text-gray-500 hover:text-navy">← From Adrian</Link>
          <div className="mt-2 bg-navy text-[hsl(45,100%,96%)] rounded-2xl px-4 py-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-75">📬 From Adrian</p>
                <h1 className="font-bold text-base truncate">{assignment.title}</h1>
                <p className="text-[11px] opacity-75 mt-0.5">
                  {[assignment.topic, assignment.tier === 'Advanced' ? '🔥 Advanced' : assignment.tier, !assignDone ? assignment.dueLabel : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              {assignDone && (
                <span className="shrink-0 text-xs font-bold bg-[hsl(43,90%,60%)] text-navy rounded-full px-2.5 py-1">✅ {assignDone.score}/{assignDone.outOf}</span>
              )}
            </div>
            {assignment.note && <p className="text-sm mt-2 italic opacity-90">“{assignment.note}”</p>}
          </div>
          {/* 💡 Concept reminder — collapsed by default (Adrian, 30 Aug 2026:
              "a hint/reminder at the front before the question, as a dropdown
              closed by default, for the concept it is trying to teach").
              Game-plan drills fill it from the plan step; any assignment may
              carry one. */}
          {assignment.reminder && (
            <details className="mt-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 group">
              <summary className="text-sm font-semibold text-amber-900 cursor-pointer select-none list-none flex items-center gap-2">
                <span aria-hidden>💡</span> Reminder before you start
                <span className="ml-auto text-amber-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="text-sm text-amber-900 mt-2 whitespace-pre-line">{assignment.reminder}</div>
            </details>
          )}
        </div>
      )}
      {/* ?qid= context header — where this question came from, and the way
          back to the normal picker (a plain href so the qid clears). */}
      {fixedQ && fixedMeta && (
        <div className="mb-4 pt-1">
          <a href="/app/practice" className="text-sm text-gray-500 hover:text-navy">← All topics</a>
          <div className="mt-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{fixedMeta.label}</p>
            <p className="text-sm text-slate-600 mt-1">{fixedMeta.blurb}</p>
          </div>
        </div>
      )}
      {/* Title row — the level toggle sits beside the title (students
          usually have two: E Math / A Math). Hidden once a topic is picked. */}
      {!assignment && !fixedQ && (
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pt-1">
        <h1 className="text-xl font-bold text-navy">Practise</h1>
        {pickerOpen && levels.length > 1 && (
          <div className="inline-flex flex-wrap gap-0.5 bg-slate-100 rounded-full p-1">
            {levels.map((l) => (
              <button key={l.key} onClick={() => setLevel(l.key)}
                className={`text-xs font-semibold rounded-full px-3.5 py-1.5 transition-colors ${
                  level === l.key ? 'bg-navy text-[hsl(45,100%,96%)] shadow-sm' : 'text-slate-500 hover:text-navy'}`}>
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      {!isStudent && (
        <p className="text-sm text-slate-500 mb-4">Admin testing mode — all levels, retrieval + generation harness (no student mastery).</p>
      )}

      {/* ── Stage 1: progress-aware picker ── */}
      {!pickerOpen && !assignment && selected && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={changeTopic} aria-label="Back to topics"
            className="shrink-0 w-9 h-9 rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-navy inline-flex items-center justify-center hover:bg-slate-50">
            <span className="text-lg leading-none" aria-hidden>‹</span>
          </button>
          {/* Tapping the name reopens the sheet — change the question type or
              difficulty without going back to the list. */}
          <button onClick={() => setSheetTopic(selected.topic)} aria-label="Change question type or difficulty"
            className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-xl px-1 py-0.5 hover:bg-white/60">
            <MasteryRing pct={selected.mastery} size="sm" />
            <div className="min-w-0">
              {/* Variant as the title ("Increasing and Decreasing Functions"),
                  family + type underneath — the full "Family (Variant)" string
                  truncates on a phone before the part that matters. */}
              <div className="font-semibold text-navy text-sm truncate">{variantOf(selected.topic)}</div>
              <div className="text-[11px] text-slate-400 truncate">
                {variantOf(selected.topic) !== selected.topic && <>{familyOf(selected.topic)} · </>}
                {subgroup ? subgroup.name : 'A mix of every kind of question'}
              </div>
            </div>
            <span className="text-slate-300 text-xs shrink-0 ml-auto" aria-hidden>▾</span>
          </button>
        </div>
      )}

      {/* Student picker (./topic-picker.tsx): strand chips → family rows →
          topic sheet. Redesigned 2026-08-22 — see the file header there. */}
      {pickerOpen && isStudent && (
        <div className="mb-6">
          {/* Bring-your-own-question doors: 📷 photo → similar, 🔍 describe →
              find/generate. Students only — the API routes are session-authed. */}
          <QuestionFinder level={level} />
          <TopicPicker
            key={level}
            level={bankScope(level).level}
            topics={topics}
            recommended={recommended}
            subgroups={subgroups}
            loading={loadingOverview}
            search={search}
            onSearch={setSearch}
            onPick={(t) => setSheetTopic(t)}
            onStartType={(t, sg) => startFromSheet(t, tier, sg)}
          />
        </div>
      )}

      {/* Admin picker (testing harness): search + strand chips + card grid,
          plus the test-generate control. Unchanged by the student redesign. */}
      {pickerOpen && !isStudent && (<>
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-slate-400">{topic ? `Selected: ${topic}` : 'Pick a topic card to test-generate.'}</span>
        <button onClick={testGenerate} disabled={!topic || genLoading} title="Admin: generate + code-verify one question (Stage 2)"
          className="bg-white border border-violet-300 text-violet-700 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
          {genLoading ? 'Generating…' : '🧪 Test generate'}
        </button>
      </div>

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
                    {t.advancedCount > 0 && <span className="text-[11px] text-amber-600 font-medium">🔥 has advanced</span>}
                  </div>
                </div>
                <span className="text-navy text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline shrink-0">Start →</span>
              </button>
            );
          })}
        </div>
      )}
      </>)}

      {/* "Print a paper" — slim link below the topic list, gone once a topic
          is picked (showPrintEntry above). Same destination/behaviour as
          before, just demoted from a card above everything. */}
      {showPrintEntry && (
        <Link
          href="/app/print"
          className="flex items-center gap-2.5 mb-4 px-1 py-2.5 text-sm text-slate-500 hover:text-navy motion-safe:transition-colors"
        >
          <span aria-hidden>🖨️</span>
          <span className="flex-1 min-w-0">Print a paper — a mock exam or topic sheet to hand back in</span>
          <span aria-hidden className="text-slate-300">›</span>
        </Link>
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
              <div className="prose prose-sm max-w-none text-slate-800"><MathMarkdown content={gen.question?.question || ''} /></div>
              <div className="mt-3 text-sm text-slate-700"><b>Answer:</b> {gen.question?.answer}</div>
              <div className="mt-1 text-xs text-emerald-700">code-computed: {gen.verify?.computedAnswer} · wellPosed:{String(gen.verify?.wellPosed)} matches:{String(gen.verify?.matches)}</div>
              {gen.question?.solution && <details className="mt-2 text-sm text-slate-600"><summary className="cursor-pointer text-slate-500">solution</summary><div className="prose prose-sm max-w-none mt-1"><MathMarkdown content={gen.question.solution} /></div></details>}
            </>
          ) : (
            <div className="text-sm text-rose-700">{gen.reason || gen.error || 'failed'}{gen.lastVerify ? ` — computed ${gen.lastVerify.computedAnswer} vs claimed (mismatch); ${gen.lastVerify.reason || ''}` : ''}</div>
          )}
          <div className="mt-3 text-[11px] text-slate-400">Not saved to the bank (test mode). Not shown to students.</div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Finding a question…</p>}

      {exhausted && subgroup && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          You&apos;ve seen every {tier === 'Advanced' ? 'advanced ' : ''}“{subgroup.name}” question. <button onClick={widenToTopic} className="underline font-semibold">Try the whole topic</button>, <button onClick={() => setSheetTopic(topic)} className="underline font-semibold">pick another kind</button>, or <button onClick={() => pickTier(tier)} className="underline font-semibold">go through them again</button>.
        </div>
      )}
      {exhausted && !subgroup && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          {tier === 'Advanced' ? (
            <>You&apos;ve seen every advanced question for this topic. <button onClick={() => switchTier('Standard')} className="underline font-semibold">Switch to Standard</button>, <button onClick={changeTopic} className="underline font-semibold">try another topic</button>, or <button onClick={() => pickTier(tier)} className="underline font-semibold">go through them again</button>.</>
          ) : (
            <>You&apos;ve seen every question we have for this topic. <button onClick={changeTopic} className="underline font-semibold">Try another topic</button>, or <button onClick={() => pickTier(tier)} className="underline font-semibold">go through them again</button>.</>
          )}
        </div>
      )}

      <div ref={questionRef} className="scroll-mt-20">
      {/* Step 2: topic chosen → choose the tier. The question loads on tap. */}
      {topic && !tierPicked && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{topic}</p>
          <p className="text-sm text-slate-600 mb-3">How hard do you want it?</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => pickTier('Standard')}
              className="rounded-2xl border-2 border-navy bg-navy text-[hsl(45,100%,96%)] px-3 py-4 text-left hover:opacity-90 transition-opacity">
              <div className="font-bold text-sm">Standard</div>
              <div className="text-[11px] opacity-80 mt-0.5">Typical exam questions</div>
            </button>
            <button onClick={() => pickTier('Advanced')} disabled={!!selected && selected.advancedCount === 0}
              className="rounded-2xl border-2 border-amber-400 bg-amber-50 text-amber-900 px-3 py-4 text-left hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <div className="font-bold text-sm">🔥 Advanced</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                {selected && selected.advancedCount === 0 ? 'None for this topic yet' : 'Harder, multi-step'}
              </div>
            </button>
          </div>
        </div>
      )}

      {q && !loading && (
        <div className="space-y-4">
          {/* Question card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-3 gap-3">
              {assignment || fixedQ ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Question</span>
              ) : (
              <div className="inline-flex gap-1 bg-slate-100 rounded-lg p-0.5" role="radiogroup" aria-label="Question difficulty">
                {(['Standard', 'Advanced'] as Tier[]).map((t) => (
                  <button key={t} onClick={() => switchTier(t)} role="radio" aria-checked={tier === t}
                    disabled={t === 'Advanced' && !!selected && selected.advancedCount === 0}
                    className={`text-[11px] font-semibold rounded-md px-2.5 py-1 transition-colors disabled:opacity-40 ${
                      tier === t ? (t === 'Advanced' ? 'bg-amber-500 text-white' : 'bg-navy text-[hsl(45,100%,96%)]') : 'text-slate-500 hover:text-navy'}`}>
                    {t === 'Advanced' ? '🔥 Advanced' : 'Standard'}
                  </button>
                ))}
              </div>
              )}
              {q.marks ? (
                <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
              ) : null}
            </div>
            {q.figureUrl && (
              // Computed + vision-verified matplotlib figure for the question.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.figureUrl} alt="Figure for this question"
                className="w-full max-w-full rounded-xl border border-slate-200 mb-3 bg-white" />
            )}
            <QuestionView q={q} />
          </div>

          {/* Working editor (students): photo-first, typing as fallback */}
          {isStudent && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                Your working
              </p>

              {/* Two inputs on purpose: `capture` forces iOS straight into the
                  camera (no library option), so the album picker needs its own
                  input without it. */}
              <input
                ref={fileInputRef} type="file" accept="image/*" capture="environment"
                className="hidden"
                onChange={(e) => { handlePhotoPick(e.target.files?.[0]); e.target.value = ''; }}
              />
              <input
                ref={libraryInputRef} type="file" accept="image/*"
                className="hidden"
                onChange={(e) => { handlePhotoPick(e.target.files?.[0]); e.target.value = ''; }}
              />

              {photo ? (
                <div className="mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Your working" className="max-h-64 rounded-xl border border-slate-200" />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy || grading}
                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">📷 Retake</button>
                    <button onClick={() => libraryInputRef.current?.click()} disabled={photoBusy || grading}
                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">🖼 Choose another</button>
                    <button onClick={() => setPhoto(null)} disabled={grading}
                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5">✕ Remove — type instead</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy || grading}
                      className="border-2 border-dashed border-slate-300 rounded-xl py-5 px-2 text-sm font-semibold text-slate-500 hover:border-navy/40 hover:text-navy transition-colors">
                      {photoBusy ? 'Reading photo…' : '📷 Take a photo'}
                    </button>
                    <button onClick={() => libraryInputRef.current?.click()} disabled={photoBusy || grading}
                      className="border-2 border-dashed border-slate-300 rounded-xl py-5 px-2 text-sm font-semibold text-slate-500 hover:border-navy/40 hover:text-navy transition-colors">
                      🖼 Choose from photos
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 -mt-2 mb-1 text-center">of your working on paper</p>
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
                {solution === null && (!assignment || grade) && (
                  <button onClick={showSolution} disabled={solLoading}
                    className="bg-white border border-emerald-300 text-emerald-700 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                    {solLoading ? 'Loading…' : '🔎 Show solution'}
                  </button>
                )}
                {!assignment && !fixedQ && (
                <button onClick={tryAnother} disabled={loading}
                  className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
                  🔄 Try another
                </button>
                )}
                {assignment && grade && (
                  <Link href="/app/assignments" className="text-sm font-semibold text-navy underline ml-auto">Done — back to From Adrian →</Link>
                )}
                {fixedQ && grade && (
                  // Plain href on purpose — a Link would keep ?qid= in the URL
                  // and the server would hand the same fixed question back.
                  <a href={fixedQ.topic ? `/app/practice?topic=${encodeURIComponent(fixedQ.topic)}` : '/app/practice'}
                    className="text-sm font-semibold text-navy underline ml-auto">
                    {fixedQ.topic ? 'More of this topic →' : 'Practise more →'}
                  </a>
                )}
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

              {gradedViaPhoto && (
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

              {grade.partBreakdown.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {grade.partBreakdown.map(p => (
                    <div key={p.label} className="flex flex-wrap items-center gap-1.5">
                      <span title={p.comment.replace(/\$/g, '')}
                        className="text-xs bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">
                        ({p.label}) {p.awarded}/{p.outOf}
                      </span>
                      {/* Mark anatomy: how the marks were awarded. Earned = solid chip
                          (code only, phrase on tap-hold/hover); missed = outlined chip
                          with the phrase visible — the missed ones are the teaching. */}
                      {p.markAnatomy?.map((m, i) => m.earned ? (
                        <span key={i} title={m.for.replace(/\$/g, '')}
                          className="text-[11px] font-semibold bg-emerald-600/90 text-white rounded-full px-2 py-0.5">
                          {m.code} ✓
                        </span>
                      ) : (
                        <span key={i}
                          className="text-[11px] border border-rose-200 text-rose-700 bg-white rounded-full px-2 py-0.5">
                          <span className="font-semibold">{m.code}</span>
                          <span className="text-rose-600/80"> — <MathText text={m.for} /></span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {grade.strengths.length > 0 && (
                <p className="text-sm text-emerald-700 mb-1.5">💪 <MathText text={grade.strengths.join(' · ')} /></p>
              )}
              {grade.nextSteps.length > 0 && (
                <ul className="text-sm text-slate-700 list-disc pl-5 space-y-0.5">
                  {grade.nextSteps.map((s, i) => <li key={i}><MathText text={s} /></li>)}
                </ul>
              )}
              {weakTags.length > 0 && (
                <p className="text-xs text-slate-400 mt-3">
                  Working on: {weakTags.map(t => <span key={t} className="inline-block bg-slate-100 rounded-full px-2 py-0.5 ml-1">{t}</span>)}
                </p>
              )}
              <p className="text-[11px] text-slate-300 mt-3">AI-marked — not always perfect. If a mark looks wrong, trust your working and check with Adrian.</p>
            </div>
          )}

          {/* Solution (both modes) */}
          {!isStudent && q && solution === null && (
            <button onClick={showSolution} disabled={solLoading}
              className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {solLoading ? 'Loading…' : '🔎 Show solution'}
            </button>
          )}
          {!isStudent && !fixedQ && (
            <button onClick={tryAnother} disabled={loading}
              className="ml-2 bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm font-semibold">
              🔄 Try another
            </button>
          )}
          {solution !== null && (
            <div className="bg-white border border-emerald-100 rounded-2xl p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 mb-2">Worked solution</div>
              {/* Aligned working from lib/solution-format.ts: left-align the display
                  blocks (KaTeX centres by default) and let wide lines scroll. */}
              <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed math-working">
                <MathMarkdown content={solution} />
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Topic sheet (students) — Standard/Advanced, Start (mix) or one question type. */}
      {isStudent && sheetCard && (
        <TopicSheet
          topic={sheetCard}
          types={sheetTypes}
          tier={sheetCard.advancedCount === 0 ? 'Standard' : tier}
          onTier={rememberTier}
          onStart={(sg) => startFromSheet(sheetCard.topic, sheetCard.advancedCount === 0 ? 'Standard' : tier, sg)}
          onClose={() => setSheetTopic(null)}
        />
      )}
    </div>
  );
}
