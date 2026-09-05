// The Notebook's fading mistakes list — SPEC-PORTAL-V2 §6, rules Adrian set
// on 6 Sep 2026. PURE: no I/O, `now` always injectable. The store
// (lib/notebook-mistakes-store.ts) owns every read and write; this file owns
// every judgement call.
//
// One entry per student × mistake pattern. Its title is the self-study sheet's
// diagnosis skill title when a sheet named it ("Solving a trigonometric
// equation in a double angle"), else "<error kind label> in <topic>" from the
// lost part's error_kind and the question's topic ("Sign in Trigonometry").
//
// States, and the words the student reads:
//   dark           Still happening  — new evidence lands here (created or darkened)
//   light          Getting better   — one clean result
//   fixed          Fixed            — two clean results (a clean paper counts as two)
//   student_fixed  Getting better · you marked this fixed — the student tapped
//                  "Corrected"; becomes fixed after ONE clean result on any
//                  surface, or after STUDENT_FIXED_DAYS with no recurrence
// Any new evidence of the same mistake, in any state, → dark again with
// `came_back` set (the row's "came back" tag), cleared when it reaches fixed.
//
// Evidence comes from two surfaces:
//   • a released paper (entriesFromRun): the sheet diagnosis skills when the
//     run carries one, else every lost part with a valid error_kind; every
//     topic the paper tested with no marks lost is a clean result (weight 2);
//   • a graded practice attempt (observationsFromAttempt): wrong/partial with
//     the grader's error tags darkens "<kind> in <topic>" (or the entries the
//     assignment was sent to fix); correct is one clean result on the topic /
//     the linked entries.
// Every observation carries the source's id as `evidence.ref`, and an entry
// that already holds that ref ignores the observation — so a release hook that
// fires twice, or the backfill re-run, changes nothing.

import { ERROR_KIND_LABEL, isErrorKind, type ErrorKind } from './error-kinds';
import { readDiagnosis } from './sheet-diagnosis';
import { sgtDateISO } from './sgt';

export type MistakeState = 'dark' | 'light' | 'fixed' | 'student_fixed';
export const MISTAKE_STATES: readonly MistakeState[] = ['dark', 'light', 'fixed', 'student_fixed'];

/** Clean results that turn a dark entry light. */
export const CLEAN_FOR_LIGHT = 1;
/** Clean results that turn an entry fixed. */
export const CLEAN_FOR_FIXED = 2;
/** A later paper with no marks lost on the skill counts as this many clean results. */
export const PAPER_CLEAN_WEIGHT = 2;
/** A graded attempt right on the skill counts as this many. */
export const ATTEMPT_CLEAN_WEIGHT = 1;
/** A "Corrected" entry with no recurrence for this long becomes fixed. */
export const STUDENT_FIXED_DAYS = 14;
/** Evidence kept per entry — oldest dropped past this. */
export const MAX_EVIDENCE = 40;
const MAX_TITLE = 120;
const MAX_TOPIC_IN_TITLE = 80;

export interface MistakeEvidence {
  kind: 'paper' | 'attempt';
  /** The run id or the student_attempts id — the idempotency key. */
  ref: string;
  /** Where on the source: "Q11(a), Q20" for a paper, the topic for an attempt. */
  label: string | null;
  /** The paper's name (papers only). */
  paper: string | null;
  /** ISO instant of the release / the attempt. */
  date: string;
  /** true = a clean result on the skill; false = the mistake showed. */
  clean: boolean;
}

export interface MistakeEntry {
  airtable_student_id: string;
  subject: string | null;
  title: string;
  error_kind: string | null;
  topic: string | null;
  state: MistakeState;
  seen_count: number;
  clean_count: number;
  came_back: boolean;
  evidence: MistakeEvidence[];
  /** portal_assignments ids of the Practice items that fix it. */
  practice_ids: string[];
  last_seen_at: string | null;
  last_clean_at: string | null;
  student_fixed_at: string | null;
}

export interface MistakeObservation {
  kind: 'mistake';
  /** Null = only reachable through `assignmentId` (a linked Practice item). */
  title: string | null;
  errorKind: ErrorKind | null;
  topic: string | null;
  subject: string | null;
  /** A Practice item this attempt was on — targets the entries linked to it first. */
  assignmentId?: string | null;
  evidence: MistakeEvidence;
}

export interface CleanObservation {
  kind: 'clean';
  /** Exactly one of title / topic / assignmentId decides which entries it reaches. */
  title?: string | null;
  topic?: string | null;
  assignmentId?: string | null;
  weight: number;
  evidence: MistakeEvidence;
}

export type Observation = MistakeObservation | CleanObservation;

// ---------------------------------------------------------------------------
// Titles, labels, small helpers
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Sign in Trigonometry" — the title of an entry born from a lost part. */
export function mistakeTitle(kind: ErrorKind, topic: string): string {
  const t = topic.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC_IN_TITLE);
  return `${capitalise(ERROR_KIND_LABEL[kind])} in ${t}`.slice(0, MAX_TITLE);
}

/** Topics compare case-insensitively, whitespace-collapsed. */
export function topicKey(topic: string | null | undefined): string {
  return String(topic ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}
export function sameTopic(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = topicKey(a);
  return ka !== '' && ka === topicKey(b);
}

/** "Q11(a)(ii)" → "11"; "11" → "11"; "(b)" / "?" → null (no question number). */
export function questionNumberOf(label: string): string | null {
  const m = String(label ?? '').trim().match(/^q?\s*(\d+)/i);
  return m ? m[1] : null;
}

/** "Q11(a)" from a question number and a part label ("(a)" or "a"). */
export function partLabel(questionNumber: string, label: string): string {
  const q = /\d/.test(questionNumber) ? `Q${questionNumber}` : questionNumber || '?';
  const l = String(label ?? '').trim();
  if (!l) return q;
  return l.startsWith('(') ? `${q}${l}` : `${q}(${l})`;
}

/** The grader's practice tags (lib/practice-grade-prompt ERROR_TAGS) → the nine kinds. */
const TAG_TO_KIND: Record<string, ErrorKind> = {
  'arithmetic-slip': 'arithmetic',
  'method-error': 'concept',
  'conceptual-gap': 'concept',
  'sign-error': 'sign',
  'rounding': 'rounding',
  'notation': 'careless',
  'missing-step': 'incomplete',
  'incomplete': 'incomplete',
  'misread-question': 'misread',
};
export function tagToErrorKind(tag: unknown): ErrorKind | null {
  if (isErrorKind(tag)) return tag;
  return typeof tag === 'string' ? TAG_TO_KIND[tag] ?? null : null;
}

export function hasEvidence(entry: MistakeEntry, ref: string): boolean {
  return entry.evidence.some(e => e.ref === ref);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-08-21T03:00:00Z" → "21 Aug" (Singapore calendar day). */
export function shortDate(iso: string | null | undefined): string {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return '';
  const day = sgtDateISO(t);
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

// ---------------------------------------------------------------------------
// A released paper → observations
// ---------------------------------------------------------------------------

interface RunPart { label: string; max: number; awarded: number; kind: ErrorKind | null }
interface RunQuestion { number: string; topic: string | null; max: number; lost: number; parts: RunPart[] }

/**
 * The marked questions of a run, reduced to what the mistakes list reads.
 * Reads `marking_output.parts` (the contract, lib/error-kinds.ts) and falls
 * back to the `marking.parts` copy; a question with no readable parts still
 * contributes its totals so a fully-correct topic can count as clean.
 */
export function readRunQuestions(resultJson: unknown): RunQuestion[] {
  const results = asRecord(resultJson)?.results;
  if (!Array.isArray(results)) return [];
  const out: RunQuestion[] = [];
  for (const raw of results) {
    const q = asRecord(raw);
    if (!q) continue;
    const mo = asRecord(q.marking_output);
    const marking = asRecord(q.marking);
    const rawParts = Array.isArray(mo?.parts) ? mo.parts
      : Array.isArray(marking?.parts) ? marking.parts : [];
    const parts: RunPart[] = [];
    for (const p of rawParts) {
      const part = asRecord(p);
      if (!part) continue;
      const mx = num(part.max), aw = num(part.awarded);
      if (mx === null || aw === null) continue;
      parts.push({ label: str(part.label), max: mx, awarded: aw, kind: isErrorKind(part.error_kind) ? part.error_kind : null });
    }
    let max: number, lost: number;
    if (parts.length) {
      max = parts.reduce((s, p) => s + p.max, 0);
      lost = parts.reduce((s, p) => s + Math.max(0, p.max - p.awarded), 0);
    } else {
      max = num(marking?.total_max) ?? 0;
      lost = Math.max(0, max - (num(marking?.total_awarded) ?? 0));
    }
    out.push({
      number: str(q.question_number) || '?',
      topic: str(asRecord(mo?.meta)?.topic_detected) || null,
      max, lost, parts,
    });
  }
  return out;
}

/** The kind that cost the most marks across these parts, or null. */
function dominantKind(parts: RunPart[]): ErrorKind | null {
  const tally = new Map<ErrorKind, number>();
  for (const p of parts) {
    const lost = p.max - p.awarded;
    if (lost <= 0 || !p.kind) continue;
    tally.set(p.kind, (tally.get(p.kind) ?? 0) + lost);
  }
  let best: ErrorKind | null = null, bestLost = 0;
  for (const [k, v] of tally) if (v > bestLost) { best = k; bestLost = v; }
  return best;
}

/**
 * Observations from one released run. `releasedAt` is the evidence date (the
 * backfill passes the stored release instant, the hook passes now).
 *
 * Mistakes: the sheet diagnosis skills with marks lost when the run carries a
 * diagnosis (result_json.diagnosis, lib/sheet-diagnosis.ts) — titled by the
 * skill, topic and dominant kind read off the questions it names — else one per
 * (topic, error_kind) among the lost parts, titled mistakeTitle(). A lost part
 * with no valid kind, or on a question with no topic, cannot name a pattern and
 * is skipped rather than guessed.
 *
 * Clean results (weight PAPER_CLEAN_WEIGHT): every topic the paper tested with
 * no marks lost; and any diagnosis skill listed at 0 marks.
 */
export function entriesFromRun(
  resultJson: unknown,
  runId: string,
  releasedAt: string,
  meta: { paperName?: string | null; subject?: string | null } = {},
): Observation[] {
  const questions = readRunQuestions(resultJson);
  const paper = meta.paperName?.trim() || null;
  const subject = meta.subject?.trim() || null;
  const ev = (label: string | null, clean: boolean): MistakeEvidence =>
    ({ kind: 'paper', ref: runId, label, paper, date: releasedAt, clean });
  const out: Observation[] = [];

  const byNumber = new Map<string, RunQuestion>();
  for (const q of questions) if (!byNumber.has(q.number)) byNumber.set(q.number, q);

  const diagnosis = readDiagnosis(resultJson);
  if (diagnosis) {
    for (const skill of diagnosis.skills) {
      const named = skill.questions
        .map(l => byNumber.get(questionNumberOf(l) ?? ''))
        .filter((q): q is RunQuestion => !!q);
      const topic = named.find(q => q.topic)?.topic ?? null;
      const label = skill.questions.length ? skill.questions.join(', ') : null;
      if (skill.marks > 0) {
        out.push({
          kind: 'mistake',
          title: skill.title.slice(0, MAX_TITLE),
          errorKind: dominantKind(named.flatMap(q => q.parts)),
          topic, subject,
          evidence: ev(label, false),
        });
      } else {
        out.push({ kind: 'clean', title: skill.title.slice(0, MAX_TITLE), weight: PAPER_CLEAN_WEIGHT, evidence: ev(label, true) });
      }
    }
  } else {
    // (topic, kind) → the parts that lost marks to it
    const groups = new Map<string, { topic: string; kind: ErrorKind; labels: string[] }>();
    for (const q of questions) {
      if (!q.topic) continue;
      for (const p of q.parts) {
        if (!p.kind || p.max - p.awarded <= 0) continue;
        const key = `${topicKey(q.topic)}|${p.kind}`;
        const g = groups.get(key) ?? { topic: q.topic, kind: p.kind, labels: [] };
        g.labels.push(partLabel(q.number, p.label));
        groups.set(key, g);
      }
    }
    for (const g of groups.values()) {
      out.push({
        kind: 'mistake',
        title: mistakeTitle(g.kind, g.topic),
        errorKind: g.kind, topic: g.topic, subject,
        evidence: ev(g.labels.join(', '), false),
      });
    }
  }

  // Topics tested with nothing lost — a clean result for every entry on them.
  const topics = new Map<string, { topic: string; max: number; lost: number; numbers: string[] }>();
  for (const q of questions) {
    if (!q.topic || q.max <= 0) continue;
    const t = topics.get(topicKey(q.topic)) ?? { topic: q.topic, max: 0, lost: 0, numbers: [] };
    t.max += q.max; t.lost += q.lost;
    t.numbers.push(partLabel(q.number, ''));
    topics.set(topicKey(q.topic), t);
  }
  for (const t of topics.values()) {
    if (t.lost > 0) continue;
    out.push({ kind: 'clean', topic: t.topic, weight: PAPER_CLEAN_WEIGHT, evidence: ev(t.numbers.join(', '), true) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// A graded practice attempt → observations
// ---------------------------------------------------------------------------

export interface AttemptInput {
  attemptId: string | number;
  verdict: 'correct' | 'partial' | 'wrong';
  /** The question's first topic (questions.topics[0]). */
  topic: string | null;
  /** The grader's tags on the lines that were wrong (ERROR_TAGS or the nine kinds). */
  tags: readonly string[];
  /** A "From Adrian" / Practice-Again item the attempt was on, if any. */
  assignmentId?: string | null;
  /** ISO instant of the attempt. */
  at: string;
  subject?: string | null;
}

/**
 * Correct → one clean result on the topic (and on the entries the assignment is
 * linked to). Wrong or partial → one mistake per distinct kind among the tags,
 * "<kind> in <topic>"; when the attempt was a Practice item, ONE observation
 * carrying the assignment id instead, so the entries it was sent to fix darken
 * (its title is the fallback if nothing is linked to it yet). A wrong attempt
 * with no recognisable tag and no assignment names no pattern → nothing.
 */
export function observationsFromAttempt(a: AttemptInput): Observation[] {
  const ref = String(a.attemptId);
  const topic = a.topic?.trim() || null;
  const assignmentId = a.assignmentId?.trim() || null;
  const ev = (clean: boolean): MistakeEvidence =>
    ({ kind: 'attempt', ref, label: topic, paper: null, date: a.at, clean });

  if (a.verdict === 'correct') {
    if (!topic && !assignmentId) return [];
    return [{ kind: 'clean', topic, assignmentId, weight: ATTEMPT_CLEAN_WEIGHT, evidence: ev(true) }];
  }

  const kinds: ErrorKind[] = [];
  for (const t of a.tags) {
    const k = tagToErrorKind(t);
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  const subject = a.subject?.trim() || null;

  if (assignmentId) {
    const kind = kinds[0] ?? null;
    return [{
      kind: 'mistake',
      title: kind && topic ? mistakeTitle(kind, topic) : null,
      errorKind: kind, topic, subject, assignmentId,
      evidence: ev(false),
    }];
  }
  if (!topic) return [];
  return kinds.map(kind => ({
    kind: 'mistake' as const,
    title: mistakeTitle(kind, topic),
    errorKind: kind, topic, subject,
    evidence: ev(false),
  }));
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

function evidenceDate(e: MistakeEvidence, now: Date): string {
  return Number.isFinite(Date.parse(e.date)) ? e.date : now.toISOString();
}

function pushEvidence(list: MistakeEvidence[], e: MistakeEvidence): MistakeEvidence[] {
  const next = [...list, e];
  return next.length > MAX_EVIDENCE ? next.slice(next.length - MAX_EVIDENCE) : next;
}

function stateAfterClean(state: MistakeState, cleanCount: number): MistakeState {
  if (state === 'fixed') return 'fixed';
  if (state === 'student_fixed') return 'fixed';           // one clean result seals it
  if (cleanCount >= CLEAN_FOR_FIXED) return 'fixed';
  if (cleanCount >= CLEAN_FOR_LIGHT) return 'light';
  return state;
}

/**
 * Fold one observation into an entry (or create one). Returns the SAME object
 * when nothing changes — the entry already holds this evidence ref, or a clean
 * result arrives for an entry that does not exist (a clean result never creates
 * an entry: there is no mistake to record).
 */
export function applyObservation(
  entry: MistakeEntry | null,
  obs: Observation,
  now: Date,
): MistakeEntry | null {
  const at = evidenceDate(obs.evidence, now);

  if (obs.kind === 'mistake') {
    if (!entry) {
      if (!obs.title) return null;
      return {
        airtable_student_id: '',
        subject: obs.subject,
        title: obs.title,
        error_kind: obs.errorKind,
        topic: obs.topic,
        state: 'dark',
        seen_count: 1,
        clean_count: 0,
        came_back: false,
        evidence: [{ ...obs.evidence, clean: false }],
        practice_ids: [],
        last_seen_at: at,
        last_clean_at: null,
        student_fixed_at: null,
      };
    }
    if (hasEvidence(entry, obs.evidence.ref)) return entry;
    // A placeholder (linked before any evidence) darkening for the first time
    // is simply born, not "coming back".
    const cameBack = entry.state !== 'dark' && entry.seen_count > 0 ? true : entry.came_back;
    return {
      ...entry,
      subject: entry.subject ?? obs.subject,
      error_kind: entry.error_kind ?? obs.errorKind,
      topic: entry.topic ?? obs.topic,
      state: 'dark',
      seen_count: entry.seen_count + 1,
      clean_count: 0,
      came_back: cameBack,
      evidence: pushEvidence(entry.evidence, { ...obs.evidence, clean: false }),
      last_seen_at: at,
    };
  }

  // clean
  if (!entry) return null;
  if (hasEvidence(entry, obs.evidence.ref)) return entry;
  const weight = Math.max(1, Math.floor(obs.weight));
  const cleanCount = entry.clean_count + weight;
  const state = stateAfterClean(entry.state, cleanCount);
  return {
    ...entry,
    state,
    clean_count: cleanCount,
    came_back: state === 'fixed' ? false : entry.came_back,
    evidence: pushEvidence(entry.evidence, { ...obs.evidence, clean: true }),
    last_clean_at: at,
  };
}

/** The student's "Corrected" tap. Only a live (dark / light) entry moves. */
export function markCorrected(entry: MistakeEntry, now: Date): MistakeEntry {
  if (entry.state !== 'dark' && entry.state !== 'light') return entry;
  return { ...entry, state: 'student_fixed', student_fixed_at: now.toISOString() };
}

/** The 14-day rule: a "Corrected" entry with no recurrence since becomes fixed. */
export function sweepStudentFixed(entry: MistakeEntry, now: Date): MistakeEntry {
  if (entry.state !== 'student_fixed') return entry;
  const t = Date.parse(entry.student_fixed_at ?? '');
  if (!Number.isFinite(t)) return entry;
  if (now.getTime() - t < STUDENT_FIXED_DAYS * 86400e3) return entry;
  return { ...entry, state: 'fixed', came_back: false };
}

// ---------------------------------------------------------------------------
// Folding a batch into a student's entries (pure — the store persists the diff)
// ---------------------------------------------------------------------------

export interface FoldResult<T extends MistakeEntry> {
  /** Entries that did not exist before this batch. */
  created: MistakeEntry[];
  /** Existing entries whose fields changed (same object identity as the input row, spread with the new fields). */
  updated: T[];
  /** Every entry after the fold, existing and new. */
  all: (T | MistakeEntry)[];
}

/**
 * Apply a batch of observations to one student's entries.
 *
 * Targeting: a mistake reaches the entries linked to its assignment when it
 * carries one and any are linked; else the entry with its title, created if
 * absent. A clean result reaches the linked entries / the titled entry / every
 * entry on the topic. Mistakes fold FIRST, and a clean result from the same
 * source (same `evidence.ref`) skips any entry that source just darkened — so
 * one paper can darken "Sign in Trigonometry" and clean "Concept in Circles"
 * while never cleaning what it darkened.
 */
export function foldObservations<T extends MistakeEntry>(
  entries: T[],
  observations: Observation[],
  now: Date,
  identity?: string,
): FoldResult<T> {
  type Work = { entry: MistakeEntry; original: T | null; dirty: boolean };
  const work: Work[] = entries.map(e => ({ entry: e, original: e, dirty: false }));
  const byTitle = new Map<string, number>();
  work.forEach((w, i) => byTitle.set(w.entry.title, i));
  const darkened = new Map<string, Set<number>>();
  const markDarkened = (ref: string, i: number) => {
    const s = darkened.get(ref) ?? new Set<number>();
    s.add(i);
    darkened.set(ref, s);
  };
  const applyTo = (i: number, obs: Observation) => {
    const next = applyObservation(work[i].entry, obs, now);
    if (next && next !== work[i].entry) { work[i].entry = next; work[i].dirty = true; }
    if (obs.kind === 'mistake') markDarkened(obs.evidence.ref, i);
  };
  const linkedTo = (assignmentId: string | null | undefined): number[] => {
    if (!assignmentId) return [];
    return work.map((w, i) => (w.entry.practice_ids.includes(assignmentId) ? i : -1)).filter(i => i >= 0);
  };

  for (const obs of observations) {
    if (obs.kind !== 'mistake') continue;
    const linked = linkedTo(obs.assignmentId);
    if (linked.length) { linked.forEach(i => applyTo(i, obs)); continue; }
    if (!obs.title) continue;
    const idx = byTitle.get(obs.title);
    if (idx !== undefined) { applyTo(idx, obs); continue; }
    const created = applyObservation(null, obs, now);
    if (!created) continue;
    if (identity) created.airtable_student_id = identity;
    work.push({ entry: created, original: null, dirty: true });
    byTitle.set(created.title, work.length - 1);
    markDarkened(obs.evidence.ref, work.length - 1);
  }

  for (const obs of observations) {
    if (obs.kind !== 'clean') continue;
    let targets: number[] = linkedTo(obs.assignmentId);
    if (!targets.length && obs.title) {
      const idx = byTitle.get(obs.title);
      targets = idx === undefined ? [] : [idx];
    }
    if (!targets.length && obs.topic) {
      targets = work.map((w, i) => (sameTopic(w.entry.topic, obs.topic) ? i : -1)).filter(i => i >= 0);
    }
    const skip = darkened.get(obs.evidence.ref);
    for (const i of targets) {
      if (skip?.has(i)) continue;
      applyTo(i, obs);
    }
  }

  return {
    created: work.filter(w => !w.original).map(w => w.entry),
    updated: work.filter(w => w.original && w.dirty).map(w => ({ ...(w.original as T), ...w.entry }) as T),
    all: work.map(w => (w.original ? ({ ...(w.original as T), ...w.entry }) as T : w.entry)),
  };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export type MistakeBand = 'still-happening' | 'getting-better' | 'fixed';

export function bandOf(state: MistakeState): MistakeBand {
  if (state === 'dark') return 'still-happening';
  if (state === 'fixed') return 'fixed';
  return 'getting-better';
}

/** The words on the screen (Adrian, 6 Sep 2026). */
export function stateLabel(state: MistakeState): string {
  switch (bandOf(state)) {
    case 'still-happening': return 'Still happening';
    case 'getting-better': return 'Getting better';
    default: return 'Fixed';
  }
}

const desc = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

/**
 * The Notebook's order: Still happening (newest evidence first), then Getting
 * better (most recent movement first), then the Fixed line. Entries with no
 * evidence yet (a placeholder linked before its paper released) are left out —
 * there is nothing to show a student about them.
 */
export function displayOrder<T extends MistakeEntry>(entries: T[]): {
  stillHappening: T[]; gettingBetter: T[]; fixed: T[];
} {
  const shown = entries.filter(e => e.seen_count > 0);
  const latest = (e: T) => [e.last_seen_at, e.last_clean_at, e.student_fixed_at].filter(Boolean).sort().pop() ?? null;
  return {
    stillHappening: shown.filter(e => bandOf(e.state) === 'still-happening')
      .sort((a, b) => desc(a.last_seen_at, b.last_seen_at) || a.title.localeCompare(b.title)),
    gettingBetter: shown.filter(e => bandOf(e.state) === 'getting-better')
      .sort((a, b) => desc(latest(a), latest(b)) || a.title.localeCompare(b.title)),
    fixed: shown.filter(e => bandOf(e.state) === 'fixed')
      .sort((a, b) => desc(latest(a), latest(b)) || a.title.localeCompare(b.title)),
  };
}

/** The most recent time the mistake SHOWED — "Prelim P1 · Q11(a) · 21 Aug". */
export function latestSighting(entry: MistakeEntry): MistakeEvidence | null {
  let best: MistakeEvidence | null = null;
  for (const e of entry.evidence) {
    if (e.clean) continue;
    if (!best || e.date > best.date) best = e;
  }
  return best;
}

export function sightingLine(e: MistakeEvidence | null): string {
  if (!e) return '';
  const where = e.kind === 'paper'
    ? [e.paper, e.label].filter(Boolean).join(' · ')
    : ['Practice', e.label].filter(Boolean).join(' · ');
  return [where, shortDate(e.date)].filter(Boolean).join(' · ');
}
