// What to teach a student NEXT — the pure half of the Next lesson card
// (/admin/students/[id]/next, 5 Oct 2026). Adrian: "a sec three student who
// finished em trigonometric ratios would probably do em trigonometry sine rule
// and cosine rule next > so a link or the pdf is ready there for me to print.
// or if exam season knows what to suggest".
//
// Two rules live here, both pure and tested (teaching-order.test.ts):
//   chooseNext   — the next step in the course's teaching order
//                  (data/teaching-order.json, Adrian edits it) after the last
//                  thing this student was taught, skipping what is covered
//   examSeason   — an exam keyed in Airtable within EXAM_SEASON_DAYS turns the
//                  suggestion into exam prep: the tested topics + the next Set
//                  papers not yet given (nextSetPapers)
// The store (lib/next-lesson-store.ts) gathers the events; nothing here reads
// Airtable or Supabase.
import orderFile from '../../data/teaching-order.json';

export type Course = 'EM' | 'AM' | 'H2' | 'S1' | 'S2';
export type Subject = 'AM' | 'EM' | 'H2';

export interface Step {
  /** canonical topic */
  t: string;
  /** the bank sub-skills (subgroups.name) the step is narrowed to; absent = the whole topic */
  s?: string[];
  label?: string;
  /** school year it is normally taught in (3/4 O-Level, 1/2 lower sec and JC) */
  y: number;
}

export const TEACHING_ORDER = (orderFile as unknown as { courses: Record<Course, Step[]> }).courses;

/** A day's worth of sources counts as one lesson when picking the last thing taught. */
const ANCHOR_SPREAD_DAYS = 3;
/** Coverage older than this does not count — last year's topic is fair game again. */
export const COVERAGE_DAYS = 300;
/** An exam this close switches the card to exam prep. */
export const EXAM_SEASON_DAYS = 21;

const DAY = 86_400_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function stepLabel(step: Step): string {
  return step.label || step.t;
}

/** Which course a subject + Airtable level is taught from. */
export function courseFor(subject: Subject, level: string | null): Course {
  if (subject === 'H2') return 'H2';
  if (subject === 'AM') return 'AM';
  if (level === 'Sec 1') return 'S1';
  if (level === 'Sec 2') return 'S2';
  return 'EM';
}

/** "Sec 3" → 3, "Sec 5" → 4 (N(A) Sec 5 sits the O-Level syllabus), "JC1" → 1. */
export function studentYear(level: string | null): number {
  const l = String(level ?? '');
  const m = /^Sec (\d)$/.exec(l);
  if (m) return Math.min(4, Number(m[1]));
  const j = /^JC(\d)$/.exec(l);
  if (j) return Number(j[1]);
  return 3;
}

export type CoverageSource = 'lesson' | 'material' | 'assignment' | 'exam';

/** One thing that says a topic (or a sub-skill under it) was met. */
export interface CoverageEvent {
  topic: string;
  /** a bank sub-skill name when the source knows it */
  skill?: string | null;
  at: string; // ISO date or instant
  source: CoverageSource;
}

/**
 * Does an event cover a step? Same topic, and either the event names one of the
 * step's sub-skills, or it names the topic only — then it covers that topic's
 * steps up to the student's own year (a Sec 3 EOY that tested "Trigonometry"
 * covered the Sec 3 trig steps, not the Sec 4 3D one).
 */
export function covers(e: CoverageEvent, step: Step, year: number): boolean {
  if (norm(e.topic) !== norm(step.t)) return false;
  if (!step.s?.length) return true;
  if (e.skill) return step.s.some((s) => norm(s) === norm(e.skill!));
  return step.y <= year;
}

export interface WeakTopic { topic: string; lost: number }

export interface NextSuggestion {
  step: Step;
  index: number;
  label: string;
  /** plain words: why this one */
  why: string;
  /** the step it follows, when there was one */
  after: string | null;
}

/**
 * The next step to teach.
 *   1. the last thing taught (a lesson log, a printed or given sheet — the newest, and the furthest along the order when several sources
 *      landed within a few days) → the first step after it not yet covered;
 *   2. no record of teaching → how far the school's own tests got (past Exams'
 *      tested topics in this year) → the first step after that not covered;
 *   3. neither → their weakest recent topic (lost marks), else the first
 *      uncovered step of the student's year.
 * A last lesson rated Slow keeps the same step ("finish it first").
 */
export function chooseNext(input: {
  order: Step[];
  year: number;
  events: CoverageEvent[];
  now: Date;
  lastMastery?: string | null;
  /** canonical topics with the most recent lost marks, worst first — used only when nothing says what was taught */
  weak?: string[];
}): NextSuggestion | null {
  const { order, year, now } = input;
  if (!order.length) return null;
  const since = now.getTime() - COVERAGE_DAYS * DAY;
  const events = input.events.filter((e) => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) && t >= since && t <= now.getTime() + DAY;
  });
  const coveredIdx = new Set<number>();
  for (const e of events) order.forEach((st, i) => { if (covers(e, st, year)) coveredIdx.add(i); });

  const stepsOf = (e: CoverageEvent) => order.map((st, i) => (covers(e, st, year) ? i : -1)).filter((i) => i >= 0);
  const pickAfter = (anchor: number) => {
    for (let i = anchor + 1; i < order.length; i++) if (!coveredIdx.has(i)) return i;
    return -1;
  };
  const firstOfYear = () => {
    const start = order.findIndex((st) => st.y >= year);
    const from = start < 0 ? 0 : start;
    for (let i = from; i < order.length; i++) if (!coveredIdx.has(i)) return i;
    return from;
  };
  const make = (i: number, why: string, after: number | null): NextSuggestion => ({
    step: order[i], index: i, label: stepLabel(order[i]), why,
    after: after === null ? null : stepLabel(order[after]),
  });

  // 1. taught
  // work sent in the app counts as covered, but only a lesson or a printed sheet says where teaching is
  const taught = events.filter((e) => (e.source === 'lesson' || e.source === 'material') && stepsOf(e).length)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (taught.length) {
    const newest = Date.parse(taught[0].at);
    const recent = taught.filter((e) => newest - Date.parse(e.at) <= ANCHOR_SPREAD_DAYS * DAY);
    // furthest along among the recent; a whole-topic event anchors at its LAST covered step
    const anchor = Math.max(...recent.flatMap(stepsOf));
    const from = SOURCE_WORDS[taught[0].source];
    if (input.lastMastery === 'Slow' && taught[0].source === 'lesson') {
      return make(anchor, `Last lesson on ${stepLabel(order[anchor])} was marked Slow — finish it first.`, null);
    }
    const next = pickAfter(anchor);
    if (next >= 0) return make(next, `Comes after ${stepLabel(order[anchor])} (${from}).`, anchor);
    const wrap = firstOfYear();
    return make(wrap, `Everything after ${stepLabel(order[anchor])} is covered — back to the first open step of the year.`, null);
  }

  // 2. how far school got
  const schoolIdx = events.filter((e) => e.source === 'exam').flatMap(stepsOf).filter((i) => order[i].y === year);
  if (schoolIdx.length) {
    const anchor = Math.max(...schoolIdx);
    const next = pickAfter(anchor);
    if (next >= 0) return make(next, `No lesson record yet; school's tests got as far as ${stepLabel(order[anchor])}.`, anchor);
  }

  // 3. no record of teaching: their weakest recent topic, else the first open step of the year
  for (const t of input.weak ?? []) {
    const i = order.findIndex((st) => norm(st.t) === norm(t));
    if (i >= 0) return make(i, `No record yet of what was taught; recent marked work loses most marks on ${t}.`, null);
  }
  const i = firstOfYear();
  return make(i, 'No record yet of what was taught — the first open step of the year.', null);
}

const SOURCE_WORDS: Record<CoverageSource, string> = {
  lesson: 'the lesson log',
  material: 'a sheet printed for them',
  assignment: 'work sent in the app',
  exam: 'a school test',
};

// ── exam season ────────────────────────────────────────────────────────────

export interface ExamLike {
  id: string;
  label: string;          // "EOY", "Prelims"
  subject: string;        // "A Math"
  paper: string | null;   // "P1"
  date: string;           // YYYY-MM-DD
  daysLeft: number;
  testedTopics: string[];
}

/** The nearest exam within the window, with its papers merged (P1 + P2 of one subject = one exam). */
export function examSeason(exams: ExamLike[], windowDays = EXAM_SEASON_DAYS): (ExamLike & { papers: string[] }) | null {
  const near = exams.filter((e) => e.daysLeft >= 0 && e.daysLeft <= windowDays)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.paper ?? '').localeCompare(b.paper ?? ''));
  if (!near.length) return null;
  const first = near[0];
  const same = near.filter((e) => e.subject === first.subject && e.label === first.label);
  const topics: string[] = [];
  for (const e of same) for (const t of e.testedTopics) if (!topics.includes(t)) topics.push(t);
  return { ...first, testedTopics: topics, papers: same.map((e) => e.paper).filter((p): p is string => !!p) };
}

/** "A Math" → 'AM' (the Set papers' bank level); null for a subject with no Sets. */
export function setLevelFor(subject: string, level: string | null): string | null {
  const s = subject.trim().toLowerCase();
  if (s.startsWith('a math')) return 'AM';
  if (s.startsWith('e math')) return 'EM';
  // H2: no Set is offered — H2 Set 1 was retracted on 3 Oct 2026 (two candidate Sets await Adrian's pick)
  if (s.startsWith('h2')) return null;
  if (!s || s === 'math') return /^Sec [345]$/.test(level ?? '') ? 'EM' : null;
  return null;
}

export interface SetRef { set: number; paper: 'P1' | 'P2' }

/** The next Set not yet given: the lowest set number with a paper not handed out, both its papers. */
export function nextSetPapers(available: SetRef[], given: SetRef[]): SetRef[] {
  const done = new Set(given.map((g) => `${g.set}|${g.paper}`));
  const sets = [...new Set(available.map((a) => a.set))].sort((a, b) => a - b);
  for (const n of sets) {
    const open = available.filter((a) => a.set === n && !done.has(`${a.set}|${a.paper}`))
      .sort((a, b) => a.paper.localeCompare(b.paper));
    if (open.length) return open;
  }
  return [];
}

/** Steps of the order whose topic an exam tests — for the exam card's topic list in teaching order. */
export function topicsInOrder(order: Step[], topics: string[]): string[] {
  const want = new Map(topics.map((t) => [norm(t), t]));
  const out: string[] = [];
  for (const st of order) {
    const hit = want.get(norm(st.t));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  for (const t of topics) if (!out.includes(t)) out.push(t);
  return out;
}
