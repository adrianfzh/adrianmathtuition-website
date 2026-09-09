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
import { CARELESS_KINDS, reconcileKind, type ErrorKind } from './error-kinds';

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
  /** The rule or habit the student does not have, when the error revealed one
   *  (the marker's part-level `gap`, or the worker's own reading). A skill
   *  with a gap is never `optional`, whatever it cost — Adrian, 7 Sep 2026,
   *  Denise's Q3(b): a 2-mark integration slip that was a fundamental gap and
   *  landed in the sheet's Optional tail. */
  gap?: string;
  /** Set by applyPracticeFocus (Adrian, 10 Sep 2026): the worker filed this as
   *  ① teach, but every mark it lost on this paper went to a slip inside a
   *  right method — the marker's kinds were all careless-bucket (arithmetic,
   *  copied wrongly, sign, rounding, units, careless) and no part named a gap —
   *  so the cover treats it as ② show. The section is still on the sheet; it is
   *  just not the lead, and Adrian is told so he can revise it. */
  slipOnly?: boolean;
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
  const gap = typeof r.gap === 'string' && r.gap.trim() ? r.gap.replace(/\s+/g, ' ').trim().slice(0, 160) : null;
  // A named gap is teaching material, never an optional tail (7 Sep 2026).
  const finalTier: DiagnosisTier = gap && tier === 'optional' ? 'teach' : tier;
  return {
    title, marks: Math.min(marks, 200), questions, why, tier: finalTier,
    ...(gap ? { gap } : {}),
    ...(r.slipOnly === true ? { slipOnly: true } : {}),
  };
}

// ── Practice Again focus — slips inside a right method earn no practice ─────
// Adrian, 10 Sep 2026, Isabelle's AM 2024 P1: "the differentiation question was
// incorrect because she just copied the question wrongly, her
// method/working/idea/concept is okay > so this should not be the main teaching
// … there is no need to practice again for arithmetic errors, transfer errors,
// rounding off errors, copy wrongly (or errors like that) if method/approach of
// doing question is correct … the analysis page should as usual reflect loss of
// marks by magnitude, but practice again sheet need not include practice for
// that. practice again sheet focuses on wrong approach/method/concepts".
//
// The worker is told the same in its prompt; this is the deterministic gate
// behind it, read from the marker's own part-level kinds so a sheet that still
// leads with a slip cannot make the cover lead with it.

export type FocusPart = {
  /** "Q8(b)" — the label a skill's `questions` entry is matched against. */
  question: string;
  /** The marker's kind read against its sentence (reconcileKind); null when unlabelled. */
  kind: ErrorKind | null;
  /** The marker's part-level gap, when it named one. */
  gap: string | null;
  lost: number;
};

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;

/** "Q8(b)" / "8b" / "Q9(a)(ii)" → { n: '8', p: 'b' } / { n: '9', p: 'aii' }. */
function questionKey(label: string): { n: string; p: string } | null {
  const m = String(label ?? '').replace(/\s+/g, '').match(/^Q?(\d+)(.*)$/i);
  if (!m) return null;
  return { n: m[1], p: m[2].replace(/[^a-z0-9]/gi, '').toLowerCase() };
}

/** A skill's "Q8" names every part of Q8; its "Q8(b)" names (b) and (b)(i). */
export function questionCovers(skillQuestion: string, partQuestion: string): boolean {
  const a = questionKey(skillQuestion), b = questionKey(partQuestion);
  if (!a || !b || a.n !== b.n) return false;
  return !a.p || b.p.startsWith(a.p);
}

/**
 * Every part that lost marks on the run, with the marker's kind and gap — the
 * evidence applyPracticeFocus rules on. Reads `marking_output.parts` (the
 * contract) and falls back to the back-compat `marking.parts`, like
 * errorKindTotals; a part with no countable loss is skipped.
 */
export function lostPartsForFocus(resultJson: unknown): FocusPart[] {
  const rj = asRecord(resultJson);
  const results = Array.isArray(rj?.results) ? rj.results : [];
  const out: FocusPart[] = [];
  for (const raw of results) {
    const q = asRecord(raw);
    if (!q) continue;
    const mo = asRecord(q.marking_output);
    const parts = Array.isArray(mo?.parts) ? mo.parts
      : Array.isArray(asRecord(q.marking)?.parts) ? (asRecord(q.marking)!.parts as unknown[]) : [];
    const qn = questionKey(String(q.question_number ?? ''));
    if (!qn) continue;
    for (const p of parts) {
      const part = asRecord(p);
      if (!part) continue;
      const mx = Number(part.max), aw = Number(part.awarded);
      if (!Number.isFinite(mx) || !Number.isFinite(aw) || mx - aw <= 0) continue;
      const label = String(part.label ?? '').replace(/[^a-z0-9()]/gi, '');
      const suffix = !label || label === 'whole' ? '' : /^\(/.test(label) ? label : `(${label})`;
      const gap = typeof part.gap === 'string' && part.gap.trim() ? part.gap.trim() : null;
      out.push({
        question: questionLabel(`${qn.n}${qn.p ? `(${qn.p})` : ''}${suffix}`),
        kind: reconcileKind(part.error_kind, part.error_summary),
        gap,
        lost: mx - aw,
      });
    }
  }
  return out;
}

/**
 * Demote a ① teach skill to ② show when every lost part it names was a slip
 * inside a right method: each matched part carries a careless-bucket kind (after
 * reconcileKind) and none names a gap. A skill that names no lost part, or one
 * part the marker called concept / misread / incomplete, left unlabelled, or
 * gave a gap, keeps its tier — the gate only ever moves a skill DOWN, and only
 * on the marker's evidence. The worker's own skill-level `gap` does not hold a
 * skill up: the marker's kinds are the ground truth of what went wrong on the
 * page (Isabelle's Q8(b) came back with a worker gap on a copied-wrongly V).
 */
export function applyPracticeFocus(skills: DiagnosisSkill[], parts: FocusPart[]): DiagnosisSkill[] {
  if (!parts.length) return skills;
  return skills.map(s => {
    if (s.tier !== 'teach') return s;
    const matched = parts.filter(p => s.questions.some(q => questionCovers(q, p.question)));
    if (!matched.length) return s;
    const slipOnly = matched.every(p => p.kind !== null && CARELESS_KINDS.includes(p.kind) && !p.gap);
    return slipOnly ? { ...s, tier: 'show', slipOnly: true } : s;
  });
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
  ctx: { sheetJobId?: string; at?: string; resultJson?: unknown } = {},
): Diagnosis | null {
  const obj = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>) : null;
  const raw: unknown[] | null = Array.isArray(input) ? input
    : obj && Array.isArray(obj.skills) ? (obj.skills as unknown[]) : null;
  if (!raw) return null;
  const read = raw.map(normaliseSkill).filter((s): s is DiagnosisSkill => s !== null).slice(0, MAX_SKILLS);
  if (!read.length) return null;
  // With the run in hand, the marker's part-level kinds gate the tiers (10 Sep
  // 2026). Idempotent — a skill already demoted stays `show`.
  const skills = ctx.resultJson === undefined ? read : applyPracticeFocus(read, lostPartsForFocus(ctx.resultJson));
  const ordered = [...skills.filter(s => s.tier !== 'optional'), ...skills.filter(s => s.tier === 'optional')];
  const at = ctx.at || (typeof obj?.at === 'string' && obj.at) || new Date().toISOString();
  const sheetJobId = ctx.sheetJobId || (typeof obj?.sheetJobId === 'string' ? obj.sheetJobId : '');
  return { at, sheetJobId, skills: ordered };
}

/** The diagnosis on a run's `result_json`, or null when there is none worth reading. */
export function readDiagnosis(resultJson: unknown): Diagnosis | null {
  const d = (resultJson as { diagnosis?: unknown } | null | undefined)?.diagnosis;
  if (!d || typeof d !== 'object') return null;
  // The run is right here, so a diagnosis stored before the focus gate existed
  // (10 Sep 2026) reads through it too — the cover is honest for old runs.
  return normaliseDiagnosis(d, { resultJson });
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
    ...(s.gap ? { gap: s.gap } : {}),
  }));
}
