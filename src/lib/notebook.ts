// Error-notebook logic — the data rules behind /app/notebook.
//
// An entry is born from every dropped-marks question on a released marked
// paper, and is conquered (archived) when the student proves the mistake is
// gone: ARCHIVE_STREAK consecutive correct re-attempts on the matched variant
// question. A wrong re-attempt resets the streak and pulls the entry due again
// sooner. Entries re-attempt the VARIANT, never the original — re-serving the
// identical question tests memory of the answer, not the concept.
//
// Pure (repo testing policy): no I/O, `now` always injectable. The route owns
// reads/writes; this file owns every judgement call.

import type { StudentPaper } from './portal-marking';

/** Consecutive correct re-attempts that archive ("conquer") an entry. */
export const ARCHIVE_STREAK = 2;
/** A correct attempt schedules the next look this many days out. */
export const DUE_AFTER_CORRECT_DAYS = 7;
/** A wrong attempt brings the entry back sooner. */
export const DUE_AFTER_WRONG_DAYS = 3;

export type Verdict = 'correct' | 'wrong' | 'unclear';

/** Today's date in Singapore, as YYYY-MM-DD (Vercel runs in UTC). */
export function sgtToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Answer checking
//
// Students type final answers on a phone; official answers come from the
// practice pipeline with inline TeX. The bar is honesty, not cleverness:
// return 'correct'/'wrong' only when the comparison is safe (exact after
// normalisation, or numeric within an answers-which-round-to tolerance), and
// 'unclear' otherwise so the UI reveals the answer and lets the student judge.
// ---------------------------------------------------------------------------

/** Strip TeX chrome and formatting noise; lowercase; drop all whitespace. */
export function normalizeAnswer(raw: string): string {
  let s = String(raw ?? '').toLowerCase();
  s = s.replace(/\$|\\\(|\\\)|\\\[|\\\]/g, '');
  s = s.replace(/\\left|\\right|\\,|\\;|\\!/g, '');
  s = s.replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  s = s.replace(/\\text\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\times|×|·|∙|\*/g, '*');
  s = s.replace(/\\div|÷/g, '/');
  s = s.replace(/\\pi|π/g, 'pi');
  s = s.replace(/\^\{?\\circ\}?|\\degree|°/g, '');
  s = s.replace(/−|–|—/g, '-');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\/g, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/\.$/, '');
  return s;
}

/** Parse a normalised token as a number; supports simple fractions "a/b". */
function asNumber(s: string): number | null {
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const frac = s.match(/^\(?(-?\d+(?:\.\d+)?)\)?\/\(?(-?\d+(?:\.\d+)?)\)?$/);
  if (frac) {
    const den = parseFloat(frac[2]);
    return den === 0 ? null : parseFloat(frac[1]) / den;
  }
  return null;
}

/** awrt-style: equal within 0.5% relative tolerance (3 s.f. rounding drift). */
export function numbersMatch(a: number, b: number): boolean {
  if (a === b) return true;
  const tol = Math.max(Math.abs(a), Math.abs(b)) * 5e-3 + 1e-9;
  return Math.abs(a - b) <= tol;
}

/** Split a RAW answer into parts on "or" / "," / ";" (before spaces vanish). */
function splitParts(raw: string): string[] {
  return String(raw ?? '')
    .split(/\bor\b|[,;]/i)
    .map(normalizeAnswer)
    .filter(Boolean);
}

/** "x=2" → "2"; leaves anything longer than a single-letter lead-in alone. */
function stripLead(s: string): string {
  return s.replace(/^[a-z]=/, '');
}

function tokensEqual(a: string, b: string): boolean {
  if (a === b || stripLead(a) === stripLead(b)) return true;
  const an = asNumber(stripLead(a));
  const bn = asNumber(stripLead(b));
  return an !== null && bn !== null && numbersMatch(an, bn);
}

/**
 * Compare a typed answer with the official one.
 * 'unclear' is a real outcome, not a failure — the UI shows the answer and
 * asks the student to judge, which is exactly what a paper answer key does.
 */
export function checkTypedAnswer(typed: string, official: string): Verdict {
  const t = normalizeAnswer(typed);
  const o = normalizeAnswer(official);
  if (!t || !o) return 'unclear';
  if (tokensEqual(t, o)) return 'correct';

  const oParts = splitParts(official);
  const tParts = splitParts(typed);
  if (oParts.length > 1) {
    // Multi-part answers ("x = 2 or x = 5"): every part must be matched, in
    // any order. A partial match is 'unclear', never 'wrong' — they may have
    // found one real root.
    if (tParts.length === oParts.length) {
      const left = [...oParts];
      const allMatched = tParts.every(tp => {
        const i = left.findIndex(op => tokensEqual(tp, op));
        if (i === -1) return false;
        left.splice(i, 1);
        return true;
      });
      if (allMatched) return 'correct';
    }
    return 'unclear';
  }

  // Single-part official: a clean numeric mismatch is safely 'wrong'; symbolic
  // disagreement ("2(x+1)" vs "2x+2") is beyond this checker — 'unclear'.
  const tn = asNumber(stripLead(t));
  const on = asNumber(stripLead(o));
  if (tn !== null && on !== null) return numbersMatch(tn, on) ? 'correct' : 'wrong';
  return 'unclear';
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface ScheduleState {
  streak: number;
  status: 'live' | 'archived';
  next_due: string | null;
}

/** Fold one recorded verdict into an entry's streak/status/due date. */
export function applyVerdict(
  prev: { streak: number },
  verdict: 'correct' | 'wrong',
  today: string,
): ScheduleState {
  if (verdict === 'correct') {
    const streak = prev.streak + 1;
    if (streak >= ARCHIVE_STREAK) return { streak, status: 'archived', next_due: null };
    return { streak, status: 'live', next_due: addDaysIso(today, DUE_AFTER_CORRECT_DAYS) };
  }
  return { streak: 0, status: 'live', next_due: addDaysIso(today, DUE_AFTER_WRONG_DAYS) };
}

// ---------------------------------------------------------------------------
// Sync: released papers → new notebook rows
// ---------------------------------------------------------------------------

export interface NotebookInsert {
  airtable_student_id: string;
  run_id: string;
  question_number: string;
  paper_name: string | null;
  paper_date: string | null;
  topic: string | null;
  awarded: number;
  max_marks: number;
  comment: string | null;
  slips: string[];
  question_prompt: string | null;
  variant_question: string | null;
  variant_answer: string | null;
  variant_note: string | null;
  variant_origin: string | null;
  /** Question-bank id of the twin (null for generated twins) — lets the
   * reveal fetch the full worked solution instead of a bare answer. */
  variant_qb_id: string | null;
  next_due: string;
}

export function entryKey(runId: string, questionNumber: string): string {
  return `${runId}|${questionNumber}`;
}

/**
 * New entries for every dropped-marks question not already in the notebook.
 * `papers` must come from buildStudentMarking (released-only is enforced
 * there); the variant is the run's practice item picked for that question.
 */
export function buildEntriesFromPapers(
  studentId: string,
  papers: StudentPaper[],
  existingKeys: Set<string>,
  today: string,
): NotebookInsert[] {
  const inserts: NotebookInsert[] = [];
  for (const paper of papers) {
    for (const q of paper.dropped) {
      if (existingKeys.has(entryKey(paper.id, q.questionNumber))) continue;
      const variant = paper.practice.find(it => it.for === q.questionNumber) ?? null;
      inserts.push({
        airtable_student_id: studentId,
        run_id: paper.id,
        question_number: q.questionNumber,
        paper_name: paper.name,
        paper_date: paper.date,
        topic: q.topic,
        awarded: q.awarded,
        max_marks: q.max,
        comment: q.comment || null,
        slips: q.slips,
        question_prompt: q.prompt,
        variant_question: variant?.question || null,
        variant_answer: variant?.answer || null,
        variant_note: variant?.note || null,
        variant_origin: variant?.origin || null,
        variant_qb_id: variant?.id || null,
        next_due: today,
      });
    }
  }
  return inserts;
}

// ---------------------------------------------------------------------------
// "Questions to retry" — display order for the My Notebook band (/app/my-notes)
// ---------------------------------------------------------------------------

/** The slice of a notebook row the retry band orders on. */
export interface RetrySource {
  status: 'live' | 'archived';
  topic: string | null;
  paper_date: string | null;
  question_number: string;
}

/**
 * Live (unconquered) entries in display order: grouped by topic A→Z with
 * untagged entries last, newest paper first inside a topic, question number
 * (numeric-aware, so Q10 follows Q9) as the tiebreak. Pure — the page slices
 * its display cap on top; archived (conquered) entries never show.
 */
export function retryOrder<T extends RetrySource>(entries: T[]): T[] {
  return entries
    .filter(e => e.status === 'live')
    .sort(
      (a, b) =>
        Number(a.topic === null) - Number(b.topic === null) ||
        (a.topic ?? '').localeCompare(b.topic ?? '') ||
        (b.paper_date ?? '').localeCompare(a.paper_date ?? '') ||
        a.question_number.localeCompare(b.question_number, undefined, { numeric: true }),
    );
}
