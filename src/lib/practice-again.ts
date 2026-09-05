// Practice Again hands back its questions — SPEC-PORTAL-V2 §7, pure half.
//
// Until 6 Sep 2026 the Mac sheet worker filed a DOCX + PDF into Dropbox and the
// portal knew a FILE existed and nothing about its questions. Now the worker's
// `done` payload also carries `questions[]` — one entry per practice question on
// the sheet, in sheet order — and /api/admin/sheet-jobs turns each into a
// portal_assignments row (source 'practice-again') that sits in status 'held'
// until Adrian's Approve & release lets the paper, the sheet and the items out
// together. Adrian, 6 Sep 2026: the sheet's release covers every question on
// it, including the ones the worker wrote itself — he reads them all in the PDF,
// so there is no per-question tick.
//
// This module is the shape-checking and row-building; the I/O (bank lookup,
// upsert, release flip, cancel delete) is lib/practice-again-store.ts. Every
// function here is total: a malformed payload yields fewer rows, never a throw,
// because a bad questions[] must NEVER fail the sheet job (the sheet itself is
// already filed and Adrian already told).

import type { AssignmentSource } from './assignments';

/** What the worker sends per practice question (scripts/sheet-worker/WORKER_PROMPT.md step 5). */
export type SheetQuestionIn = {
  section?: unknown;
  index?: unknown;
  skill_title?: unknown;
  question_id?: unknown;
  text_latex?: unknown;
  answer_latex?: unknown;
  marks?: unknown;
  topic?: unknown;
};

/** One practice question, cleaned. `position` is its 0-based place in the payload — the sheet order. */
export type SheetQuestion = {
  position: number;
  /** The worker's own numbering on the sheet ("Practice 2", 1) — for the title only. */
  section: string | null;
  index: number | null;
  skillTitle: string | null;
  /** A bank uuid the worker named — verified against `questions` before it is trusted. */
  questionId: string | null;
  /** The question the worker wrote, when it wrote one. */
  textLatex: string | null;
  answerLatex: string | null;
  marks: number | null;
  topic: string | null;
};

/** A sheet has a few sections of two or three practice questions each; more than this is a dump. */
export const MAX_SHEET_QUESTIONS = 40;
const MAX_TEXT = 6000;
const MAX_ANSWER = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+$/g, '').trim();
  return t ? t.slice(0, max) : null;
}

function intOrNull(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= lo && i <= hi ? i : null;
}

/**
 * Clean the worker's `questions[]`. Entries that are not objects, or that name
 * neither a bank id nor a written question WITH its answer, are dropped and
 * counted in `skipped`. Positions are the payload's own order after dropping,
 * so the same payload always yields the same (sheet_job_id, position) keys —
 * that is what makes a re-run of `done` idempotent.
 */
export function sanitizeSheetQuestions(raw: unknown): { questions: SheetQuestion[]; skipped: number } {
  if (!Array.isArray(raw)) return { questions: [], skipped: 0 };
  const out: SheetQuestion[] = [];
  let skipped = 0;
  for (const item of raw.slice(0, MAX_SHEET_QUESTIONS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { skipped++; continue; }
    const r = item as SheetQuestionIn;
    const qidRaw = str(r.question_id, 60);
    const questionId = qidRaw && UUID_RE.test(qidRaw) ? qidRaw.toLowerCase() : null;
    const textLatex = str(r.text_latex, MAX_TEXT);
    const answerLatex = str(r.answer_latex, MAX_ANSWER);
    // Nothing to practise: no bank row named and no written question+answer.
    if (!questionId && !(textLatex && answerLatex)) { skipped++; continue; }
    out.push({
      position: out.length,
      section: str(r.section, 60),
      index: intOrNull(r.index, 0, 999),
      skillTitle: str(r.skill_title, 120),
      questionId,
      textLatex,
      answerLatex,
      marks: intOrNull(r.marks, 1, 50),
      topic: str(r.topic, 80),
    });
  }
  skipped += Math.max(0, raw.length - MAX_SHEET_QUESTIONS);
  return { questions: out, skipped };
}

/** The sheet_jobs columns the rows are built from. */
export type PracticeAgainJob = {
  id: string;
  run_id: string;
  airtable_student_id: string;
  paper_name?: string | null;
};

/** The portal_assignments row to insert for one sheet question (status 'held'). */
export type PracticeAgainInsert = {
  airtable_student_id: string;
  kind: 'question' | 'generated';
  question_id: string | null;
  title: string;
  topic: string | null;
  level: null;
  tier: null;
  note: null;
  reminder: null;
  source_run_id: string;
  pdf_url: null;
  pdf_source: null;
  due_on: null;
  status: 'held';
  source: AssignmentSource;
  skill_title: string | null;
  subject: string | null;
  sheet_job_id: string;
  sheet_index: number;
  question_text: string | null;
  answer_latex: string | null;
  marks: number | null;
};

/** "Using f(x) = divisor × quotient + remainder" — else "Practice 2 · Q1", else "Practice again · Q3". */
export function practiceAgainTitle(q: Pick<SheetQuestion, 'skillTitle' | 'section' | 'index' | 'position'>): string {
  if (q.skillTitle) return q.skillTitle.slice(0, 120);
  const n = q.index ?? q.position + 1;
  return `${q.section || 'Practice again'} · Q${n}`.slice(0, 120);
}

export type PracticeAgainSkip = { position: number; reason: 'not-in-bank' | 'no-answer' };

/**
 * Rows for the held items. A question the worker named by bank id becomes a
 * `question` row ONLY when `bankIds` (live, non-deleted bank rows — the store
 * checks) contains it; otherwise it falls back to `generated` when the worker
 * also sent the text and answer, and is skipped when it did not. `subject` is
 * the paper's (`paper_marking_runs.paper_subject`), so the subject gate can
 * filter these like any other row.
 */
export function practiceAgainRows(
  job: PracticeAgainJob,
  questions: SheetQuestion[],
  opts: { bankIds: ReadonlySet<string>; subject?: string | null },
): { rows: PracticeAgainInsert[]; skipped: PracticeAgainSkip[] } {
  const rows: PracticeAgainInsert[] = [];
  const skipped: PracticeAgainSkip[] = [];
  const subject = opts.subject && opts.subject.trim() ? opts.subject.trim().slice(0, 20) : null;
  for (const q of questions) {
    const inBank = !!q.questionId && opts.bankIds.has(q.questionId);
    const written = !!(q.textLatex && q.answerLatex);
    if (!inBank && !written) {
      skipped.push({ position: q.position, reason: q.questionId ? 'not-in-bank' : 'no-answer' });
      continue;
    }
    rows.push({
      airtable_student_id: job.airtable_student_id,
      kind: inBank ? 'question' : 'generated',
      question_id: inBank ? q.questionId : null,
      title: practiceAgainTitle(q),
      topic: q.topic,
      level: null,
      tier: null,
      note: null,
      reminder: null,
      // The paper this work was written FROM — never the run that marks the
      // reply (that is `run_id`, stamped when the student hands it in).
      source_run_id: job.run_id,
      pdf_url: null,
      pdf_source: null,
      due_on: null,
      status: 'held',
      source: 'practice-again',
      skill_title: q.skillTitle,
      subject,
      sheet_job_id: job.id,
      sheet_index: q.position,
      question_text: inBank ? null : q.textLatex,
      answer_latex: inBank ? null : q.answerLatex,
      marks: inBank ? null : q.marks,
    });
  }
  return { rows, skipped };
}

/** The bank ids a payload names, for the store's one existence query. */
export function bankIdsNamed(questions: SheetQuestion[]): string[] {
  return [...new Set(questions.map(q => q.questionId).filter((x): x is string => !!x))];
}

/** One line for the Telegram / the `done` response: "🔁 5 practice items held (3 from the bank, 2 written) · 1 skipped". */
export function heldItemsLine(summary: { created: number; bank: number; generated: number; skipped: number; already: number }): string | null {
  const total = summary.created + summary.already;
  if (!total && !summary.skipped) return null;
  const parts: string[] = [];
  if (total) {
    const mix = [summary.bank ? `${summary.bank} from the bank` : '', summary.generated ? `${summary.generated} written` : ''].filter(Boolean).join(', ');
    parts.push(`🔁 ${total} practice item${total === 1 ? '' : 's'} held for release${mix ? ` (${mix})` : ''}`);
    if (summary.already) parts.push(`${summary.already} already there`);
  }
  if (summary.skipped) parts.push(`${summary.skipped} skipped`);
  return parts.join(' · ');
}
