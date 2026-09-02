// The self-study sheet's diagnosis, written back onto the marking run so the
// marked paper's cover follows it.
//
// Adrian, 2 Sep 2026: "the sheet's diagnosis should drive the cover, not the
// cover the sheet." The cover ("Where your marks went", lib/front-page-html.ts)
// used to rank what to work on with a coarse keyword classifier over the
// marker's notes (lib/paper-analysis.ts). The sheet worker — a headless session
// following the self-study-sheet skill — reads the student's actual working and
// produces a far better ranked diagnosis, but it never reached the run, so the
// cover and the sheet stapled behind it could disagree on what mattered most.
//
// Now the worker sends its diagnosis in the `done` payload, the sheet-jobs route
// stores it as `paper_marking_runs.result_json.diagnosis`, and the cover is
// built FROM it whenever it exists — in the sheet's own section order, so page 1
// and the practice sheet read as one document. The keyword classifier is the
// fallback for a paper that has no sheet (yet).
//
// SINGLE PAPER, like the cover and the sheet (both since 2 Sep 2026): a
// diagnosis is of the run it is stored on and nothing else.
//
// Pure: no I/O. The route validates with normaliseDiagnosis (fail-soft — a
// malformed diagnosis is logged and skipped, never a reason to fail the sheet),
// and both front-page builders map it to themes with themesFromDiagnosis.

import type { Theme } from './paper-analysis';

/** The sheet's own triage (skill Step 2): ① teach and practise, ② show the line
 *  and move on (slips — no practice), ③ optional practice at the back. */
export type DiagnosisTier = 'teach' | 'show' | 'optional';

export type DiagnosisSkill = {
  /** The sheet's section heading, verbatim — what the student will see there. */
  title: string;
  /** Marks lost to it on THIS paper. */
  marks: number;
  /** Where it showed, e.g. ["Q11(a)", "Q20"]. */
  questions: string[];
  /** One sentence — the marker's or the worker's note. TeX allowed. */
  why: string;
  tier: DiagnosisTier;
};

export type Diagnosis = {
  /** ISO timestamp of the write-back. */
  at: string;
  /** The sheet_jobs row that produced it. */
  sheetJobId: string;
  /** In the order the sheet takes them. */
  skills: DiagnosisSkill[];
};

/** A sheet has four core skills plus a few one-liners and an optional tail;
 *  anything past this is not a diagnosis, it is a dump. */
export const MAX_SKILLS = 12;
const MAX_QUESTIONS_PER_SKILL = 12;
const TIERS: readonly DiagnosisTier[] = ['teach', 'show', 'optional'];

/**
 * A question label the cover can match against its own "Q10" / "Q10(a)" labels
 * (lib/paper-analysis.ts worstQuestions): trimmed, no inner spaces, a leading Q.
 * Workers write "11(a)", "q20" and "Q 7" — all three become what the page uses.
 */
export function questionLabel(v: unknown): string {
  let s = String(v ?? '').trim().replace(/\s+/g, '');
  if (!s) return '';
  s = s.replace(/^q(?=[\d(])/, 'Q');
  if (/^\d/.test(s)) s = `Q${s}`;
  return s.slice(0, 20);
}

function normaliseSkill(input: unknown): DiagnosisSkill | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  const title = String(r.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!title) return null;
  // Marks must be a number (or a numeric string — curl payloads are hand-typed).
  // `null`/`true` coerce to 0/1 through Number(), which would invent a tally, so
  // only those two forms are read.
  const marks = typeof r.marks === 'number' ? r.marks
    : typeof r.marks === 'string' && r.marks.trim() ? Number(r.marks) : NaN;
  if (!Number.isFinite(marks) || marks < 0) return null;
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map(questionLabel).filter(Boolean).slice(0, MAX_QUESTIONS_PER_SKILL);
  const why = String(r.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const tierRaw = String(r.tier ?? '').trim().toLowerCase();
  // An unknown tier is read as the core: a section on the sheet is something to
  // learn unless the worker said otherwise.
  const tier = (TIERS as readonly string[]).includes(tierRaw) ? (tierRaw as DiagnosisTier) : 'teach';
  return { title, marks: Math.min(marks, 200), questions, why, tier };
}

/**
 * Validate and tidy a diagnosis. Accepts the worker's array of skills OR the
 * stored `{ at, sheetJobId, skills }` object (so a stored value re-reads through
 * the same gate and junk on the row can never crash a render).
 *
 * Returns null when nothing usable is in it. Skills that fail (no title, no
 * numeric marks) are dropped individually; the rest survive. Order is the
 * sheet's, except that `optional` skills are moved to the end — the sheet puts
 * its Optional section last, and the cover must too.
 */
export function normaliseDiagnosis(
  input: unknown,
  ctx: { sheetJobId?: string; at?: string } = {},
): Diagnosis | null {
  const obj = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>) : null;
  const raw: unknown[] | null = Array.isArray(input) ? input
    : obj && Array.isArray(obj.skills) ? (obj.skills as unknown[]) : null;
  if (!raw) return null;
  const skills = raw.map(normaliseSkill).filter((s): s is DiagnosisSkill => s !== null).slice(0, MAX_SKILLS);
  if (!skills.length) return null;
  const ordered = [...skills.filter(s => s.tier !== 'optional'), ...skills.filter(s => s.tier === 'optional')];
  const at = ctx.at || (typeof obj?.at === 'string' && obj.at) || new Date().toISOString();
  const sheetJobId = ctx.sheetJobId || (typeof obj?.sheetJobId === 'string' ? obj.sheetJobId : '');
  return { at, sheetJobId, skills: ordered };
}

/** The diagnosis on a run's `result_json`, or null when there is none worth reading. */
export function readDiagnosis(resultJson: unknown): Diagnosis | null {
  const d = (resultJson as { diagnosis?: unknown } | null | undefined)?.diagnosis;
  if (!d || typeof d !== 'object') return null;
  return normaliseDiagnosis(d);
}

/**
 * The cover's themes, built from the sheet instead of the keyword classifier.
 *
 * One theme per skill, in the sheet's order: title = the section heading,
 * marks = what it cost on this paper, the first question + the note as the
 * evidence line the page prints. `papers` is 1 and `live` is true because a
 * diagnosis is of exactly the paper the cover fronts. `tier` and `questions`
 * ride along so the page can keep `show` skills out of the top three
 * (chooseThemes) and tie the closing line to every question the skill named.
 */
export function themesFromDiagnosis(d: Diagnosis, paperName = 'this paper'): Theme[] {
  return d.skills.map((s, i) => ({
    key: `sheet-${i + 1}`,
    title: s.title,
    marks: s.marks,
    occasions: Math.max(1, s.questions.length),
    papers: 1,
    live: true,
    latestMarks: s.marks,
    examples: s.questions.length || s.why
      ? [{ paperName, question: s.questions[0] ?? '', why: s.why }]
      : [],
    tier: s.tier,
    questions: s.questions,
  }));
}
