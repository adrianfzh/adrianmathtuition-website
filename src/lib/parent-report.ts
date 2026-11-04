// 👪 Weekly parent report — the judgement calls and the words (SPEC-PARENT-REPORT.md,
// Adrian 4 Nov 2026: "yes build it FOR THE APP"). Pure and tested; the reads and
// writes live in lib/parent-report-store.ts.
//
// Rules this file keeps:
// - Every number is counted here, from the student's own rows. Nothing is
//   estimated, and a "win" appears only when the counts really show one.
// - The words never say HOW anything was worked out (Adrian: keep data logic
//   internal) — "the one thing to work on", never "our model scored…".
// - Plain Singapore classroom English, no hype, no comparison with other children.
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import { isErrorKind, type ErrorKind } from '@/lib/error-kinds';
import { addDaysISO, sgtDateISO } from '@/lib/sgt';

const DAY = 86_400_000;

// ── inputs ───────────────────────────────────────────────────────────────────

export interface ReportAttempt {
  at: string;                 // ISO timestamp
  questionId: string | null;
  topics: string[];
  verdict: string | null;
  score: number | null;
  outOf: number | null;
  helpSteps: number;
  science: boolean;
}
export interface ReportPaperLoss { topic: string; lost: number; kind: string | null }
export interface ReportPaper {
  releasedAt: string;
  name: string;
  subject: string;            // 'A Math' | 'E Math' | 'H2 Math' | …
  awarded: number | null;
  max: number | null;
  losses: ReportPaperLoss[];  // per question part: topic, marks lost, kind of mistake
}
export interface ReportMistake { topic: string | null; errorKind: string | null; seen: number; lastSeenAt: string | null }
export interface ReportInputs {
  weekStart: string;          // SGT Monday, YYYY-MM-DD
  now: Date;
  attempts: ReportAttempt[];  // the last LOOKBACK_DAYS
  papers: ReportPaper[];      // released in the last LOOKBACK_DAYS
  mistakes: ReportMistake[];  // Notebook rows seen in the last LOOKBACK_DAYS
  stretch: { done: number; total: number } | null;
}

export const LOOKBACK_DAYS = 90;
export const WEAK_DAYS = 28;
export const WIN_RECENT_DAYS = 14;
export const WIN_BEFORE_DAYS = 56;
export const WIN_MIN_TRIES = 4;
export const WIN_MIN_GAIN = 0.2;
export const PAPER_MIN_GAIN = 5; // percentage points

// ── facts (stored as parent_reports.facts) ───────────────────────────────────

export type Win =
  | { kind: 'topic'; topic: string; before: [number, number]; after: [number, number] }
  | { kind: 'paper'; subject: string; beforePct: number; afterPct: number };

export interface ReportFacts {
  v: 1;
  weekStart: string;
  weekEnd: string;            // the Sunday
  active: boolean;
  practiceDays: number;
  questionsTried: number;
  rightFirst: number;
  papers: { name: string; subject: string; awarded: number | null; max: number | null }[];
  stretch: { done: number; total: number } | null;
  wins: Win[];
  weakSpot: { topic: string; kind: ErrorKind | null } | null;
  focus: { topic: string; questionIds: string[] } | null;
}

/** Wrong on the first try: same rule the practice difficulty job uses (lib/practice-difficulty mathAttemptWrong). */
export function attemptWrong(a: Pick<ReportAttempt, 'verdict' | 'score' | 'outOf' | 'helpSteps'>): boolean {
  if (a.helpSteps > 0) return true;
  if (a.outOf != null && a.outOf > 0 && a.score != null && Number.isFinite(a.score)) return a.score / a.outOf < 0.5;
  return a.verdict !== 'correct';
}

/** Maths papers only for the weak spot (the 10-minute set comes from the maths bank). */
export const isMathSubject = (s: string) => /math/i.test(s);

const key = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** Each question's first try (earliest attempt), maths only, with a topic. */
export function firstTries(attempts: readonly ReportAttempt[]): (ReportAttempt & { topic: string })[] {
  const byQ = new Map<string, ReportAttempt>();
  for (const a of attempts) {
    if (a.science || !a.questionId || !a.topics.length) continue;
    const prev = byQ.get(a.questionId);
    if (!prev || a.at < prev.at) byQ.set(a.questionId, a);
  }
  return [...byQ.values()].map(a => ({ ...a, topic: a.topics[0] }));
}

function inWeek(iso: string, weekStart: string, weekEnd: string): boolean {
  const d = sgtDateISO(new Date(iso));
  return d >= weekStart && d <= weekEnd;
}

/** Plain wins: a topic whose first tries clearly went up, or a paper score that went up. At most two. */
export function findWins(inp: Pick<ReportInputs, 'attempts' | 'papers' | 'now'>): Win[] {
  const wins: Win[] = [];
  const now = inp.now.getTime();
  const recentFrom = new Date(now - WIN_RECENT_DAYS * DAY).toISOString();
  const beforeFrom = new Date(now - WIN_BEFORE_DAYS * DAY).toISOString();
  const tally = new Map<string, { name: string; b: [number, number]; a: [number, number] }>();
  for (const f of firstTries(inp.attempts)) {
    if (f.at < beforeFrom) continue;
    const k = key(f.topic);
    const t = tally.get(k) ?? { name: f.topic.trim(), b: [0, 0], a: [0, 0] };
    const slot = f.at >= recentFrom ? t.a : t.b;
    slot[1]++;
    if (!attemptWrong(f)) slot[0]++;
    tally.set(k, t);
  }
  const topicWins = [...tally.values()]
    .filter(t => t.b[1] >= WIN_MIN_TRIES && t.a[1] >= WIN_MIN_TRIES && t.a[0] >= 3)
    .map(t => ({ t, gain: t.a[0] / t.a[1] - t.b[0] / t.b[1] }))
    .filter(x => x.gain >= WIN_MIN_GAIN)
    .sort((x, y) => y.gain - x.gain || x.t.name.localeCompare(y.t.name));
  for (const { t } of topicWins.slice(0, 2)) wins.push({ kind: 'topic', topic: t.name, before: t.b, after: t.a });

  // Papers: the last fortnight's marks against the six weeks before, same subject,
  // at least two papers on each side (one short topical set against a full paper
  // is not a fair comparison). Marks are pooled: total scored / total possible.
  const scored = inp.papers.filter(p => p.max != null && p.max > 0 && p.awarded != null);
  for (const s of [...new Set(scored.map(p => p.subject))].sort()) {
    const mine = scored.filter(p => p.subject === s && p.releasedAt >= beforeFrom);
    const after = mine.filter(p => p.releasedAt >= recentFrom), before = mine.filter(p => p.releasedAt < recentFrom);
    if (after.length < 2 || before.length < 2) continue;
    const pct = (ps: ReportPaper[]) => Math.round((100 * ps.reduce((t, p) => t + p.awarded!, 0)) / ps.reduce((t, p) => t + p.max!, 0));
    if (pct(after) - pct(before) >= PAPER_MIN_GAIN) wins.push({ kind: 'paper', subject: s, beforePct: pct(before), afterPct: pct(after) });
  }
  return wins.slice(0, 2);
}

/**
 * The ONE main weak spot: the maths topic with the most marks lost lately
 * (papers), plus wrong first tries and Notebook mistakes. Looks back WEAK_DAYS;
 * a quiet month falls back to the whole lookback. Null when there is nothing.
 */
export function findWeakSpot(inp: Pick<ReportInputs, 'attempts' | 'papers' | 'mistakes' | 'now'>): { topic: string; kind: ErrorKind | null } | null {
  for (const days of [WEAK_DAYS, LOOKBACK_DAYS]) {
    const from = new Date(inp.now.getTime() - days * DAY).toISOString();
    const score = new Map<string, { name: string; pts: number; kinds: Map<string, number> }>();
    const add = (topic: string | null | undefined, pts: number, kind?: string | null) => {
      if (!topic || !topic.trim() || pts <= 0) return;
      const k = key(topic);
      const s = score.get(k) ?? { name: topic.trim(), pts: 0, kinds: new Map() };
      s.pts += pts;
      if (kind && isErrorKind(kind)) s.kinds.set(kind, (s.kinds.get(kind) ?? 0) + pts);
      score.set(k, s);
    };
    for (const p of inp.papers) if (p.releasedAt >= from && isMathSubject(p.subject)) for (const l of p.losses) add(l.topic, l.lost, l.kind);
    for (const f of firstTries(inp.attempts)) if (f.at >= from && attemptWrong(f)) add(f.topic, 2);
    for (const m of inp.mistakes) if ((m.lastSeenAt ?? '') >= from) add(m.topic, Math.max(1, m.seen), m.errorKind);
    const best = [...score.values()].sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name))[0];
    if (!best) continue;
    // Name the kind of mistake only when one kind is at least half of them.
    const kinds = [...best.kinds.entries()].sort((a, b) => b[1] - a[1]);
    const total = kinds.reduce((s, [, n]) => s + n, 0);
    const kind = kinds.length && kinds[0][1] * 2 >= total ? (kinds[0][0] as ErrorKind) : null;
    return { topic: best.name, kind };
  }
  return null;
}

/** The week's counts and the parts of the report that need no database. `focus` is filled by the store. */
export function buildReportFacts(inp: ReportInputs): ReportFacts {
  const weekEnd = addDaysISO(inp.weekStart, 6);
  const week = inp.attempts.filter(a => inWeek(a.at, inp.weekStart, weekEnd));
  const days = new Set(week.map(a => sgtDateISO(new Date(a.at))));
  const qs = new Set(week.map(a => a.questionId ?? `${a.at}`));
  // Right first time: of this week's attempts, those that were the question's first try and were right.
  const firsts = new Map(firstTries(inp.attempts).map(f => [f.questionId!, f]));
  let rightFirst = 0;
  for (const q of qs) { const f = firsts.get(q); if (f && inWeek(f.at, inp.weekStart, weekEnd) && !attemptWrong(f)) rightFirst++; }
  const papers = inp.papers
    .filter(p => inWeek(p.releasedAt, inp.weekStart, weekEnd))
    .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))
    .map(p => ({ name: p.name, subject: p.subject, awarded: p.awarded, max: p.max }));
  const stretchDone = inp.stretch && inp.stretch.done > 0 ? inp.stretch : null;
  const active = qs.size > 0 || papers.length > 0 || !!stretchDone;
  return {
    v: 1, weekStart: inp.weekStart, weekEnd, active,
    practiceDays: days.size, questionsTried: qs.size, rightFirst,
    papers, stretch: inp.stretch && inp.stretch.total > 0 ? inp.stretch : null,
    wins: active ? findWins(inp) : [],
    weakSpot: findWeakSpot(inp),
    focus: null,
  };
}

// ── the words ────────────────────────────────────────────────────────────────

const KIND_WORDS: Record<ErrorKind, string> = {
  concept: 'the idea itself is not yet clear',
  arithmetic: 'slips in the working (arithmetic)',
  transfer: 'copying numbers down wrongly',
  sign: 'sign mistakes (+ and −)',
  rounding: 'rounding',
  units: 'missing or wrong units',
  misread: 'misreading the question',
  incomplete: 'answers left unfinished',
  careless: 'careless slips',
  keywords: 'missing key words',
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MON[m - 1]}`;
}

export interface ReportWords {
  title: string;              // "Weekly report · 27 Oct – 2 Nov"
  heading: string;            // "Wei Ling's week" / "Your child's week"
  done: string[];             // what they did (bullets)
  wins: string[];             // plain wins (may be empty)
  weak: string | null;        // the one thing to work on
  action: string;             // the one action, above the button
  button: string;             // button text
  forwardText: string;        // the message a parent forwards to the child
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Everything the parent reads, from the stored facts. `name` is the child's first name (or null). */
export function reportWords(f: ReportFacts, name: string | null, focusUrl: string): ReportWords {
  const who = name || 'Your child';
  const title = `Weekly report · ${shortDate(f.weekStart)} – ${shortDate(f.weekEnd)}`;
  const heading = name ? `${name}’s week` : 'Your child’s week';
  const done: string[] = [];
  if (f.questionsTried) {
    done.push(`Practised on ${plural(f.practiceDays, 'day')} · ${plural(f.questionsTried, 'question')} tried${f.rightFirst ? ` · ${f.rightFirst} right on the first try` : ''}`);
  }
  const paperLine = (p: ReportFacts['papers'][number]) => (p.max ? `${p.name} — ${p.awarded ?? 0}/${p.max}` : p.name);
  if (f.papers.length > 2) {
    done.push(`${f.papers.length} papers marked · latest: ${paperLine(f.papers[f.papers.length - 1])}`);
  } else {
    for (const p of f.papers) done.push(`Paper marked: ${paperLine(p)}`);
  }
  if (f.stretch) done.push(`Weekly stretch set: ${f.stretch.done} of ${f.stretch.total} done`);
  if (!f.active) done.length = 0;

  const wins = f.wins.map(w => w.kind === 'topic'
    ? `${w.topic}: ${w.before[0]}/${w.before[1]} → ${w.after[0]}/${w.after[1]} right on the first try`
    : `${w.subject} papers: ${w.beforePct}% → ${w.afterPct}%`);

  const weak = f.weakSpot
    ? `${f.weakSpot.topic} — ${f.weakSpot.kind ? `most lost marks here were ${KIND_WORDS[f.weakSpot.kind]}` : 'most marks were lost here lately'}.`
    : null;

  const topic = f.focus?.topic ?? null;
  let action: string;
  if (f.active) {
    action = topic
      ? `One thing to do: a 10-minute set on ${topic}. Send this link to ${name || 'your child'}.`
      : `One thing to do: 10 minutes of practice this week. Send this link to ${name || 'your child'}.`;
  } else {
    action = topic
      ? `No practice this week. A 10-minute set on ${topic} is ready — send this link to ${name || 'your child'}.`
      : `No practice this week. 10 minutes is enough to start again — send this link to ${name || 'your child'}.`;
  }
  const forwardText = topic
    ? `Your 10-minute set on ${topic} is ready: ${focusUrl}`
    : `10 minutes of maths practice this week: ${focusUrl}`;
  void who;
  return { title, heading, done, wins, weak, action, button: 'Send to my child on WhatsApp', forwardText };
}

// ── invite codes ─────────────────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const INVITE_DAYS = 7;

export function newInviteCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null;
}

// ── private links (like the link in a "track your parcel" SMS) ───────────────
// <uuid>.<exp36>.<sig22>, HMAC-SHA256 with SIGNUP_SECRET, the purpose inside the
// signature so a report link can never be used as a parent-page cookie. Verify
// never throws. Same shape as lib/view-token.ts.

export const REPORT_LINK_DAYS = 14;
export const PARENT_COOKIE_DAYS = 180;
export const PARENT_COOKIE = 'parent_view';
type Purpose = 'parentreport' | 'parentview';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sig(secret: string, purpose: Purpose, body: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${body}`).digest('base64url').slice(0, 22);
}
function signFor(purpose: Purpose, id: string, days: number, secret: string, nowMs: number): string {
  if (!UUID_RE.test(id) || !secret) throw new Error('parent link: id and secret are required');
  const body = `${id}.${(Math.floor(nowMs / 1000) + days * 86400).toString(36)}`;
  return `${body}.${sig(secret, purpose, body)}`;
}
function verifyFor(purpose: Purpose, token: unknown, secret: string, nowMs: number): string | null {
  if (typeof token !== 'string' || !secret || token.length > 100) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [id, exp36, given] = parts;
  if (!UUID_RE.test(id) || !/^[0-9a-z]{1,10}$/.test(exp36) || given.length !== 22) return null;
  const a = Buffer.from(given), b = Buffer.from(sig(secret, purpose, `${id}.${exp36}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return parseInt(exp36, 36) > Math.floor(nowMs / 1000) ? id : null;
}

export const signReportToken = (reportId: string, secret: string, nowMs = Date.now()) => signFor('parentreport', reportId, REPORT_LINK_DAYS, secret, nowMs);
export const verifyReportToken = (t: unknown, secret: string, nowMs = Date.now()) => verifyFor('parentreport', t, secret, nowMs);
export const signParentCookie = (parentId: string, secret: string, nowMs = Date.now()) => signFor('parentview', parentId, PARENT_COOKIE_DAYS, secret, nowMs);
export const verifyParentCookie = (t: unknown, secret: string, nowMs = Date.now()) => verifyFor('parentview', t, secret, nowMs);

// ── the words a parent agrees to (consent) ───────────────────────────────────

export const PARENT_NOTICE_VERSION = 'parent-report-v1-2026-11';
export const PARENT_NOTICE: readonly string[] = [
  'You are the parent or guardian of this child.',
  'Each Sunday evening we email you a short report on their practice and marked papers that week.',
  'The report shows only your own child’s work. It never compares them with other children.',
  'Your child can see in their app that a parent is linked.',
  'You can stop the reports at any time with the “Stop these reports” link in every report.',
  'Report links stop working after 14 days.',
];
export const PARENT_NOTICE_HASH = createHash('sha256').update(`${PARENT_NOTICE_VERSION}\n${PARENT_NOTICE.join('\n')}`).digest('hex');

export function isEmail(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}
