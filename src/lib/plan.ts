// "My Plan" — the student's adaptive revision plan (SPEC-REVISION-PLAN.md).
//
// Pure shaping over lib/mastery.ts: the mastery model is the single source of
// truth for scores/trends/thresholds (a disagreement with the notebook page
// would be a bug by definition), and this file only decides what the plan
// SAYS about it — three bands, caps, plain-language evidence sentences, the
// empty-state flag. Derived on every read; there is no stored plan to drift.
//
//   Focus topics — the lowest-mastery topics still showable (they clear
//     EVIDENCE_MIN and STALE_FLOOR inside computeMastery) that aren't solid.
//   Keep warm   — topics whose score is fine but whose decayed evidence is
//     sliding toward STALE_FLOOR: the plan rotates them back in before the
//     model has to stop vouching for them.
//   Wins        — notebook re-attempts beaten and papers handed in inside
//     RECENT_DAYS, so the plan visibly responds to work done.
//
// Pure (repo testing policy): no I/O, `now` injectable.

import type { StudentPaper } from './portal-marking';
import {
  computeMastery,
  ATTEMPT_WEIGHT,
  MISCONCEPTION_MULT,
  EVIDENCE_MIN,
  RECENT_DAYS,
  type MasteryEntry,
  type MasteryAttempt,
  type TopicMastery,
} from './mastery';
import { sgtToday } from './notebook';

export const FOCUS_MAX = 3;
export const WARM_MAX = 3;
/** Decayed evidence at/below this reads as "fading" — halfway-ish between a
 * fresh EVIDENCE_MIN and the STALE_FLOOR cut where the score disappears. */
export const WARM_EVIDENCE_CEILING = 3;
export const WINS_MAX = 8;

/** The slice of a notebook row the plan reads (superset of MasteryEntry). */
export interface PlanEntry extends MasteryEntry {
  questionNumber?: string | null;
  paperName?: string | null;
}

export interface PlanFocusTopic {
  topic: string;
  score: number;
  state: TopicMastery['state'];
  delta: TopicMastery['delta'];
  /** Plain words: "Lost 9 of 14 marks across 2 papers, last on 21 Aug." */
  evidence: string;
  practiceHref: string;
}

export interface PlanWarmTopic {
  topic: string;
  score: number;
  state: TopicMastery['state'];
  /** "last touched 6 weeks ago" */
  lastTouched: string;
  practiceHref: string;
}

export interface PlanWin {
  kind: 'paper' | 'reattempt';
  label: string;
  /** YYYY-MM-DD (SGT) — newest first in the band. */
  date: string;
  dateLabel: string;
}

export interface RevisionPlan {
  focus: PlanFocusTopic[];
  keepWarm: PlanWarmTopic[];
  wins: PlanWin[];
  /** Under EVIDENCE_MIN marks of total evidence: show the hand-in CTA. */
  empty: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08-21" → "21 Aug". */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : iso;
}

function practiceHref(topic: string): string {
  return `/app/practice?topic=${encodeURIComponent(topic)}`;
}

function ageDays(iso: string, now: Date): number {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(t)) return Infinity;
  return (now.getTime() - t) / 86400e3;
}

function validAttempts(e: PlanEntry): MasteryAttempt[] {
  if (!Array.isArray(e.attempts)) return [];
  const out: MasteryAttempt[] = [];
  for (const raw of e.attempts) {
    const a = raw as Partial<MasteryAttempt>;
    if (typeof a?.at !== 'string') continue;
    if (a.verdict !== 'correct' && a.verdict !== 'wrong') continue;
    out.push(a as MasteryAttempt);
  }
  return out;
}

// Per-topic raw facts for the sentences. Deliberately NOT scores: arithmetic
// about what happened (marks lost, papers counted, last date), while every
// judgement (weights, decay, thresholds) stays in computeMastery.
interface TopicFacts {
  paperLost: number;
  paperMax: number;
  paperCount: number;
  attemptWrong: number;
  attemptCount: number;
  /** Latest evidence date, YYYY-MM-DD (SGT for attempts). */
  lastDate: string | null;
}

function collectFacts(papers: StudentPaper[], entries: PlanEntry[]): Map<string, TopicFacts> {
  const facts = new Map<string, TopicFacts>();
  const get = (topic: string): TopicFacts => {
    let f = facts.get(topic);
    if (!f) {
      f = { paperLost: 0, paperMax: 0, paperCount: 0, attemptWrong: 0, attemptCount: 0, lastDate: null };
      facts.set(topic, f);
    }
    return f;
  };
  const touch = (f: TopicFacts, date: string) => {
    if (!f.lastDate || date > f.lastDate) f.lastDate = date;
  };

  for (const p of papers) {
    const seen = new Set<string>();
    for (const q of p.questions) {
      if (!q.topic || q.max <= 0) continue;
      const f = get(q.topic);
      f.paperLost += Math.max(0, q.max - q.awarded);
      f.paperMax += q.max;
      if (!seen.has(q.topic)) {
        seen.add(q.topic);
        f.paperCount += 1;
      }
      touch(f, p.date);
    }
  }
  for (const e of entries) {
    if (!e.topic) continue;
    const f = get(e.topic);
    for (const a of validAttempts(e)) {
      f.attemptCount += 1;
      if (a.verdict === 'wrong') f.attemptWrong += 1;
      touch(f, sgtToday(new Date(a.at)));
    }
  }
  return facts;
}

/** Display round: half marks are real, long floats are not. */
function marks(n: number): number {
  return Math.round(n * 10) / 10;
}

function evidenceSentence(f: TopicFacts | undefined): string {
  if (!f) return 'Based on your recent marked work.';
  const parts: string[] = [];
  if (f.paperLost > 0) {
    parts.push(
      `lost ${marks(f.paperLost)} of ${marks(f.paperMax)} marks across ${f.paperCount} paper${f.paperCount === 1 ? '' : 's'}`,
    );
  }
  if (f.attemptWrong > 0) {
    parts.push(
      `got ${f.attemptWrong} of ${f.attemptCount} notebook re-attempt${f.attemptCount === 1 ? '' : 's'} wrong`,
    );
  }
  let s = parts.length
    ? parts.join(' and ')
    : 'based on your recent marked work';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (f.lastDate) s += `, last on ${shortDate(f.lastDate)}`;
  return `${s}.`;
}

function lastTouchedLabel(f: TopicFacts | undefined, now: Date): string {
  if (!f?.lastDate) return 'not touched in a while';
  const days = ageDays(f.lastDate, now);
  if (days < 1) return 'last touched today';
  if (days < 2) return 'last touched yesterday';
  if (days < 14) return `last touched ${Math.floor(days)} days ago`;
  return `last touched ${Math.round(days / 7)} weeks ago`;
}

// Nominal (undecayed) evidence across everything — the empty-state gate. Same
// weights collectEvidence uses, summed without the topic split; below
// EVIDENCE_MIN there is nothing honest for a plan to say.
function totalNominalEvidence(papers: StudentPaper[], entries: PlanEntry[]): number {
  let sum = 0;
  for (const p of papers) {
    for (const q of p.questions) {
      if (q.topic && q.max > 0) sum += q.max;
    }
  }
  for (const e of entries) {
    if (!e.topic) continue;
    for (const a of validAttempts(e)) {
      sum += ATTEMPT_WEIGHT * (a.verdict === 'wrong' && a.confident === true ? MISCONCEPTION_MULT : 1);
    }
  }
  return sum;
}

function collectWins(papers: StudentPaper[], entries: PlanEntry[], now: Date): PlanWin[] {
  const wins: PlanWin[] = [];
  for (const p of papers) {
    if (ageDays(p.date, now) > RECENT_DAYS) continue;
    // Portal submissions are already named "Handed in 22 Aug" — don't stutter.
    const name = /^handed in\b/i.test(p.name) ? p.name : `Handed in ${p.name}`;
    wins.push({
      kind: 'paper',
      label: `${name}${p.pct !== null ? ` — ${p.pct}%` : ''}`,
      date: p.date,
      dateLabel: shortDate(p.date),
    });
  }
  for (const e of entries) {
    // One win per entry, on its latest correct re-attempt in the window — a
    // streak on the same question is one win, not a feed of duplicates.
    let latest: string | null = null;
    for (const a of validAttempts(e)) {
      if (a.verdict !== 'correct' || ageDays(a.at, now) > RECENT_DAYS) continue;
      const day = sgtToday(new Date(a.at));
      if (!latest || day > latest) latest = day;
    }
    if (!latest) continue;
    const q = e.questionNumber ? `Q${e.questionNumber}` : 'a question';
    const where = e.paperName ? ` from ${e.paperName}` : '';
    const topic = e.topic ? ` (${e.topic})` : '';
    wins.push({
      kind: 'reattempt',
      label: `Beat ${q}${where}${topic}`,
      date: latest,
      dateLabel: shortDate(latest),
    });
  }
  return wins
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label))
    .slice(0, WINS_MAX);
}

/**
 * Shape one student's plan. `papers` must come from buildStudentMarking
 * (released-only, student-scoped) and `entries` from their notebook rows —
 * loadPapersAndNotebook hands back exactly this pair.
 */
export function buildPlan(
  papers: StudentPaper[],
  entries: PlanEntry[],
  now: Date = new Date(),
): RevisionPlan {
  const mastery = computeMastery(papers, entries, now); // weakest first, gated + capped there
  const facts = collectFacts(papers, entries);

  const focus: PlanFocusTopic[] = mastery
    .filter(t => t.state !== 'solid')
    .slice(0, FOCUS_MAX)
    .map(t => ({
      topic: t.topic,
      score: t.score,
      state: t.state,
      delta: t.delta,
      evidence: evidenceSentence(facts.get(t.topic)),
      practiceHref: practiceHref(t.topic),
    }));

  const inFocus = new Set(focus.map(f => f.topic));
  const keepWarm: PlanWarmTopic[] = mastery
    .filter(t => !inFocus.has(t.topic) && t.evidence <= WARM_EVIDENCE_CEILING)
    .sort((a, b) => a.evidence - b.evidence)
    .slice(0, WARM_MAX)
    .map(t => ({
      topic: t.topic,
      score: t.score,
      state: t.state,
      lastTouched: lastTouchedLabel(facts.get(t.topic), now),
      practiceHref: practiceHref(t.topic),
    }));

  return {
    focus,
    keepWarm,
    wins: collectWins(papers, entries, now),
    empty: totalNominalEvidence(papers, entries) < EVIDENCE_MIN,
  };
}
