// Science practice — the pure, client-safe half (2026-09-02). The question
// bank for physics / chemistry / biology lives in a SEPARATE Supabase project
// (SPEC-SUBJECTS.md Part 1; ref eaxnstsecxmqdobfvmjh); the portal reads it
// through lib/science-bank.ts (server-only). This module holds what both the
// server routes and the client flow need: the level keys, subject gating,
// MCQ handling and mastery arithmetic. No I/O.
//
// v1 scope (Adrian, 2026-09-02: "can we have physics questions practice too?
// … gatekeep from students first"): physics only, behind
// SCIENCE_PRACTICE_OPEN_TO_STUDENTS (lib/portal-beta). The bank is ~75 %
// MCQ, and the "never ship another company's watermark" rule keeps the
// (unscanned) image questions out for now, so the eligible pool is text-only:
// ≈2,100 MCQ + ≈100 structured questions across the 21 O-Level topics.

export type ScienceSubject = 'physics' | 'chemistry' | 'biology';

export interface ScienceLevel {
  /** Portal level key — sits beside the math keys in the picker's level chips. */
  key: string;
  label: string;
  subject: ScienceSubject;
  /** `questions.level` in the science project ('PHYS' / 'CHEM' / 'BIO'). */
  bankLevel: string;
  /** The Airtable Students.Subjects option that unlocks it once the flag opens. */
  airtableSubject: string;
}

export const SCIENCE_LEVELS: ScienceLevel[] = [
  { key: 'PHY', label: 'Physics', subject: 'physics', bankLevel: 'PHYS', airtableSubject: 'Physics' },
];

export function scienceLevel(key: string | null | undefined): ScienceLevel | null {
  return SCIENCE_LEVELS.find(l => l.key === key) ?? null;
}
export function isScienceLevel(key: string | null | undefined): boolean {
  return scienceLevel(key) !== null;
}
export function scienceSubjectOf(key: string | null | undefined): ScienceSubject | null {
  return scienceLevel(key)?.subject ?? null;
}
export function isScienceSubject(s: unknown): s is ScienceSubject {
  return s === 'physics' || s === 'chemistry' || s === 'biology';
}

/** How the caller reaches science practice: Adrian's preview (every science
 *  level), the flag open (levels their Airtable subjects unlock), or closed. */
export type ScienceAccess = 'preview' | 'open' | 'closed';

export function scienceLevelsFor(subjects: string[] | null | undefined, access: ScienceAccess): { key: string; label: string }[] {
  if (access === 'closed') return [];
  const subs = new Set((subjects ?? []).map(s => s.trim().toLowerCase()));
  return SCIENCE_LEVELS
    .filter(l => access === 'preview' || subs.has(l.airtableSubject.toLowerCase()))
    .map(l => ({ key: l.key, label: l.label }));
}

// ── MCQ ──────────────────────────────────────────────────────────────────────
// Physics P1 rows store the answer as a bare letter and the options inside the
// stem ("A) 0.33 m/s\nB) 330 m/s …"). Marked deterministically — no model call,
// so MCQ attempts are cap-exempt (attempted_via 'portal-mcq').

export const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type McqLetter = (typeof MCQ_LETTERS)[number];

export function isMcqAnswer(answer: unknown): answer is McqLetter {
  return typeof answer === 'string' && /^[A-D]$/.test(answer.trim().toUpperCase()) && answer.trim().length === 1;
}

/** The option letters actually present in the stem, in order; null when the
 *  text carries no recognisable "A) …" / "A. …" / "(A) …" option lines. */
export function mcqOptionsIn(text: string | null | undefined): McqLetter[] | null {
  if (!text) return null;
  const found: McqLetter[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*\(?([A-D])[).:]\s+\S/);
    if (m && !found.includes(m[1] as McqLetter)) found.push(m[1] as McqLetter);
  }
  return found.length >= 2 ? found : null;
}

/** The bank stores MCQ options as single-newline lines ("…?\nA) 1 N\nB) 2 N");
 *  markdown folds single newlines into spaces, so the options ran together on
 *  one line. Put each option on its own paragraph. Non-MCQ text is untouched. */
export function mcqStemParagraphs(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/[ \t]*\n[ \t]*(?=\(?[A-D][).:]\s+\S)/g, '\n\n').replace(/\n{3,}/g, '\n\n');
}

/** "b", "B)", "(B)", "B) 330 m/s", "option B" → "B"; anything else → null. */
export function normaliseMcqChoice(input: string | null | undefined): McqLetter | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(?:option\s+|ans(?:wer)?\s*[:=]?\s*)?\(?([A-Da-d])\)?(?:[).:]|\s|$)/i);
  return m ? (m[1].toUpperCase() as McqLetter) : null;
}

export interface McqGrade {
  verdict: 'correct' | 'wrong';
  score: number;
  outOf: number;
  partBreakdown: { label: string; awarded: number; outOf: number; comment: string }[];
  lineComments: { line: number; ok: boolean; comment: string; fix?: string }[];
  strengths: string[];
  nextSteps: string[];
}

export function gradeMcq(answer: McqLetter, choice: McqLetter, marks: number | null | undefined): McqGrade {
  const outOf = typeof marks === 'number' && marks > 0 ? marks : 1;
  const ok = choice === answer;
  return {
    verdict: ok ? 'correct' : 'wrong',
    score: ok ? outOf : 0,
    outOf,
    partBreakdown: [],
    lineComments: [{
      line: 1, ok,
      comment: ok ? `${choice} is correct.` : `${choice} is not the answer — the correct option is ${answer}.`,
      ...(ok ? {} : { fix: answer }),
    }],
    strengths: ok ? ['Correct option chosen.'] : [],
    nextSteps: ok ? [] : ['Open the solution, then find what in the question rules out the option you picked.'],
  };
}

// ── Mastery ──────────────────────────────────────────────────────────────────
// Science attempts can't carry a `question_id` (the FK points at the MATH bank),
// so the picker's mastery is computed here from `marking_json` instead of the
// practice_overview RPC. Same scale as the RPC: score/outOf × 100 per attempt,
// averaged per topic.

export interface ScienceAttemptLite {
  topics: string[];
  score: number | null;
  outOf: number | null;
  attemptedAt: string;
}
export interface TopicMastery { attempts: number; mastery: number | null; lastPracticedAt: string | null }

export function computeScienceMastery(rows: ScienceAttemptLite[]): Map<string, TopicMastery> {
  const acc = new Map<string, { n: number; sum: number; scored: number; last: string | null }>();
  for (const r of rows) {
    const topic = r.topics?.[0];
    if (!topic) continue;
    const cur = acc.get(topic) ?? { n: 0, sum: 0, scored: 0, last: null };
    cur.n++;
    if (typeof r.score === 'number' && typeof r.outOf === 'number' && r.outOf > 0) {
      cur.sum += (r.score / r.outOf) * 100;
      cur.scored++;
    }
    if (!cur.last || r.attemptedAt > cur.last) cur.last = r.attemptedAt;
    acc.set(topic, cur);
  }
  const out = new Map<string, TopicMastery>();
  for (const [topic, c] of acc) {
    out.set(topic, { attempts: c.n, mastery: c.scored ? Math.round(c.sum / c.scored) : null, lastPracticedAt: c.last });
  }
  return out;
}

// ── Images ───────────────────────────────────────────────────────────────────
/** Public URL for a science-bank image (bare filename or already absolute). */
export function scienceImageUrl(baseUrl: string, imageUrl: string | null | undefined): string | null {
  const s = (imageUrl ?? '').trim();
  if (!s || s === '[]') return null;
  if (/^https?:\/\//.test(s)) return s;
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/question_images/${s.replace(/^question_images\//, '')}`;
}
