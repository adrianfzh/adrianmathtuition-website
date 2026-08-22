// Per-student topic mastery — the "continuous diagnosis" ledger.
//
// One estimate per topic, refreshed from EVERY capture surface each time it is
// read: marked-paper questions (released runs) and notebook re-attempts. This
// is how the re-mark loop closes: a student beats a notebook entry today and
// the topic's score moves today — diagnosis is a running estimate, not a
// snapshot of the last paper.
//
// Derived on read, deliberately: at one tutor's scale every consumer already
// holds the source rows (the notebook API fetches runs AND entries), so a
// materialised table would only add write hooks that can drift. If consumers
// multiply later, this function becomes the refresher for one.
//
// Evidence model (weights in "marks of evidence"):
//   paper question   weight = its max marks, half-life 60 days, value = awarded/max
//   notebook attempt weight = 2,             half-life 30 days, value = 1/0
//   confident-and-wrong attempts weigh ×1.5 — a misconception the student was
//   sure about is stronger negative evidence than a known gap.
// Exam evidence outweighing re-attempts, and recency decay, mirror the source
// hierarchy every serious mastery system uses (exam > practice > conversation).
//
// Pure (repo testing policy): no I/O, `now` injectable.

import type { StudentPaper } from './portal-marking';

export const PAPER_HALF_LIFE_DAYS = 60;
export const ATTEMPT_HALF_LIFE_DAYS = 30;
export const ATTEMPT_WEIGHT = 2;
export const MISCONCEPTION_MULT = 1.5;
/** Marks-equivalent of NOMINAL (undecayed) evidence a topic needs before its
 * score is shown — same bar as the focus lists (portal-marking
 * MIN_TOPIC_MARKS): below it, one 2-mark slip reads as "you are bad at
 * vectors". Nominal, because decay would hide even a fresh 4-mark question. */
export const EVIDENCE_MIN = 4;
/** …but a topic whose evidence has decayed below this is ancient history —
 * showing a months-stale score would be a claim about the present. */
export const STALE_FLOOR = 1.5;
/** Evidence newer than this drives the ↑/↓ trend arrow. */
export const RECENT_DAYS = 21;
export const MAX_TOPICS = 10;

export interface MasteryAttempt {
  at: string;
  verdict: 'correct' | 'wrong';
  confident?: boolean;
}

/** The slice of a notebook entry this model reads. */
export interface MasteryEntry {
  topic: string | null;
  attempts: unknown;
}

export interface TopicMastery {
  topic: string;
  /** 0–100 weighted estimate. */
  score: number;
  /** Marks-equivalent of evidence behind the score. */
  evidence: number;
  /** 'up' | 'down' when the last RECENT_DAYS of evidence moved the score ≥5 points. */
  delta: 'up' | 'down' | null;
  state: 'weak' | 'shaky' | 'solid';
}

function decay(ageDays: number, halfLife: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / halfLife);
}

function ageDays(iso: string, now: Date): number {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(t)) return 0;
  return (now.getTime() - t) / 86400e3;
}

interface Evidence {
  topic: string;
  age: number;
  weight: number; // pre-decay
  halfLife: number;
  value: number; // 0..1
}

function collectEvidence(papers: StudentPaper[], entries: MasteryEntry[], now: Date): Evidence[] {
  const ev: Evidence[] = [];
  for (const p of papers) {
    const age = ageDays(p.date, now);
    for (const q of p.questions) {
      if (!q.topic || q.max <= 0) continue;
      ev.push({ topic: q.topic, age, weight: q.max, halfLife: PAPER_HALF_LIFE_DAYS, value: q.awarded / q.max });
    }
  }
  for (const e of entries) {
    if (!e.topic || !Array.isArray(e.attempts)) continue;
    for (const raw of e.attempts) {
      const a = raw as Partial<MasteryAttempt>;
      if (typeof a?.at !== 'string') continue;
      if (a.verdict !== 'correct' && a.verdict !== 'wrong') continue;
      const wrong = a.verdict === 'wrong';
      ev.push({
        topic: e.topic,
        age: ageDays(a.at, now),
        weight: ATTEMPT_WEIGHT * (wrong && a.confident === true ? MISCONCEPTION_MULT : 1),
        halfLife: ATTEMPT_HALF_LIFE_DAYS,
        value: wrong ? 0 : 1,
      });
    }
  }
  return ev;
}

function weighted(ev: Evidence[]): { score: number; evidence: number } | null {
  let sw = 0, swv = 0;
  for (const e of ev) {
    const w = e.weight * decay(e.age, e.halfLife);
    sw += w;
    swv += w * e.value;
  }
  if (sw <= 0) return null;
  return { score: (swv / sw) * 100, evidence: sw };
}

/**
 * The student's per-topic mastery, weakest first. `papers` must be released
 * only and scoped to the student (buildStudentMarking guarantees both).
 */
export function computeMastery(
  papers: StudentPaper[],
  entries: MasteryEntry[],
  now: Date = new Date(),
): TopicMastery[] {
  const all = collectEvidence(papers, entries, now);
  const byTopic = new Map<string, Evidence[]>();
  for (const e of all) {
    const list = byTopic.get(e.topic);
    if (list) list.push(e);
    else byTopic.set(e.topic, [e]);
  }

  const out: TopicMastery[] = [];
  for (const [topic, ev] of byTopic) {
    const full = weighted(ev);
    if (!full) continue;
    const nominal = ev.reduce((s, e) => s + e.weight, 0);
    if (nominal < EVIDENCE_MIN || full.evidence < STALE_FLOOR) continue;

    // Trend: does dropping the recent evidence change the estimate? Needs
    // real evidence on BOTH sides of the cut, or the arrow is noise.
    const older = ev.filter(e => e.age > RECENT_DAYS);
    const hasRecent = older.length < ev.length;
    const old = weighted(older);
    let delta: TopicMastery['delta'] = null;
    if (hasRecent && old && old.evidence >= 2) {
      const moved = full.score - old.score;
      if (moved >= 5) delta = 'up';
      else if (moved <= -5) delta = 'down';
    }

    const score = Math.round(full.score);
    out.push({
      topic,
      score,
      evidence: Math.round(full.evidence * 10) / 10,
      delta,
      state: score < 60 ? 'weak' : score < 75 ? 'shaky' : 'solid',
    });
  }

  return out
    .sort((a, b) => a.score - b.score || b.evidence - a.evidence)
    .slice(0, MAX_TOPICS);
}
