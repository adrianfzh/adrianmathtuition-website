// Student-facing view of their own marked scripts — the data behind /app/marking.
//
// Two rules shape everything here, and both are invariants, not preferences:
//
//   1. RELEASED ONLY. Adrian's review is the trust gate on AI marking
//      (HANDOFF-MARKING-LOOP.md, locked decision 2). The route filters on
//      `released_at`, and so does this file — a student must never read a mark
//      that Adrian hasn't signed off, and one forgotten `.not(...)` in a future
//      query should not be the only thing standing between them and one.
//   2. NO TRIAGE INTERNALS. `review_recommended`, `match_confidence`,
//      `marking_confidence` and the override note are Adrian's working notes
//      about how much he trusts the machine. A student reading "marking
//      confidence: low" learns nothing about their maths and everything about
//      our plumbing.
//
// Pure (repo testing policy: marks logic never inline in a route or component).
// Input is already-fetched rows; no I/O.

import { aggregateTopicBleed, type TopicBleed, type ReportPaper } from '@/lib/report-facts';
import { recomputeTotals } from '@/lib/mark-triage';

/** A `paper_marking_runs` row, reduced to the columns this view reads. */
export interface MarkingRunRow {
  id: string;
  created_at: string;
  paper_name: string | null;
  total_awarded: number | null;
  total_max: number | null;
  annotated_pdf_url: string | null;
  pdf_url: string | null;
  released_at: string | null;
  result_json: unknown;
}

export interface StudentQuestion {
  questionNumber: string;
  awarded: number;
  max: number;
  topic: string | null;
  /** The marker's sentence about the attempt as a whole. */
  comment: string;
  /** Per-part "what went wrong" lines, in paper order, blanks dropped. */
  slips: string[];
  /** Full marks — the page greys these down so the losses stand out. */
  full: boolean;
}

export interface StudentPaper {
  id: string;
  /** YYYY-MM-DD, from created_at. */
  date: string;
  name: string;
  awarded: number;
  max: number;
  /** Null when the paper carries no marks at all (nothing to be a percent of). */
  pct: number | null;
  /** Every marked question, paper order. */
  questions: StudentQuestion[];
  /** Questions that dropped marks, biggest loss first — the revision list. */
  dropped: StudentQuestion[];
  /** The annotated script if it was rendered, else the plain marked PDF. */
  pdfUrl: string | null;
}

export interface StudentMarking {
  /** Newest first — the paper they just sat is the one they came to look at. */
  papers: StudentPaper[];
  /** Mean of paper percentages, 0–100. Null with no scored paper. */
  averagePct: number | null;
  /** Oldest → newest change in points. Null with fewer than 2 scored papers. */
  trendPts: number | null;
  /** Topics to work on next, worst first. */
  focus: TopicBleed[];
}

// A topic needs this many marks behind it before its percentage means anything —
// below it, one 2-mark slip reads to a 16-year-old as "you are bad at vectors".
// Same thresholds as the parent report (`report-facts.ts`) on purpose: the
// student and their parent should never be shown two different focus lists.
const MIN_TOPIC_MARKS = 4;
const WEAK_PCT_CEILING = 75;
const MAX_FOCUS = 3;

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toQuestion(raw: unknown): StudentQuestion | null {
  const r = asRecord(raw);
  if (!r) return null;
  const marking = asRecord(r.marking);
  if (!marking) return null;

  const max = num(marking.total_max);
  const awarded = num(marking.total_awarded);
  const meta = asRecord(asRecord(r.marking_output)?.meta) ?? {};
  const parts = Array.isArray(marking.parts) ? marking.parts : [];

  const slips: string[] = [];
  for (const p of parts) {
    const part = asRecord(p);
    if (!part) continue;
    // A part that scored full marks has nothing to say; `error_summary` on a
    // correct part (some markers write "no errors") would read as a criticism.
    if (num(part.awarded) >= num(part.max)) continue;
    const why = str(part.error_summary);
    if (!why) continue;
    const label = str(part.label);
    slips.push(label ? `${label}: ${why}` : why);
  }

  return {
    questionNumber: str(r.question_number) || '?',
    awarded,
    max,
    topic: str(meta.topic_detected) || null,
    comment: str(marking.overall_comment),
    slips,
    full: max > 0 && awarded >= max,
  };
}

function toPaper(row: MarkingRunRow): StudentPaper | null {
  const results = asRecord(row.result_json)?.results;
  // No `results` means the run failed or is still queued. It has nothing to
  // show, and listing it as "0/0" reads as a paper they scored nothing on.
  if (!Array.isArray(results)) return null;

  const questions = results.map(toQuestion).filter((q): q is StudentQuestion => q !== null);

  // Prefer the stored totals — triage overrides write both — and recompute only
  // when they're absent, which older rows sometimes are.
  const totals =
    row.total_max == null || row.total_awarded == null
      ? recomputeTotals(row.result_json)
      : { awarded: num(row.total_awarded), max: num(row.total_max) };

  return {
    id: row.id,
    date: String(row.created_at).slice(0, 10),
    name: str(row.paper_name) || 'Marked paper',
    awarded: totals.awarded,
    max: totals.max,
    pct: totals.max > 0 ? Math.round((totals.awarded / totals.max) * 100) : null,
    questions,
    dropped: questions
      .filter(q => q.max > 0 && q.awarded < q.max)
      .sort((a, b) => (b.max - b.awarded) - (a.max - a.awarded) || a.questionNumber.localeCompare(b.questionNumber)),
    // The annotated script is the one with red pen on their own handwriting;
    // the plain PDF is the fallback when annotation never rendered.
    pdfUrl: row.annotated_pdf_url || row.pdf_url || null,
  };
}

/**
 * Build one student's marked-paper view from their `paper_marking_runs` rows.
 *
 * `rows` must already be scoped to this student — this function has no way to
 * check ownership and will happily render whatever it is handed.
 */
export function buildStudentMarking(rows: MarkingRunRow[]): StudentMarking {
  // Release gate, enforced again here — see the header.
  const released = rows.filter(r => !!r.released_at);

  const papers = released
    .map(toPaper)
    .filter((p): p is StudentPaper => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const scored = papers.filter(p => p.pct !== null).map(p => ({ date: p.date, pct: p.pct! }));
  const averagePct = scored.length
    ? Math.round(scored.reduce((s, p) => s + p.pct, 0) / scored.length)
    : null;

  // Oldest → newest, so a rising trend is a positive number regardless of the
  // display order above.
  const chronological = [...scored].sort((a, b) => a.date.localeCompare(b.date));
  const trendPts = chronological.length >= 2
    ? chronological[chronological.length - 1].pct - chronological[0].pct
    : null;

  const bleedInput: ReportPaper[] = released.map(r => ({
    id: r.id,
    date: String(r.created_at).slice(0, 10),
    name: str(r.paper_name) || 'Marked paper',
    totalAwarded: r.total_awarded,
    totalMax: r.total_max,
    resultJson: r.result_json,
  }));
  const focus = aggregateTopicBleed(bleedInput)
    .filter(t => t.max >= MIN_TOPIC_MARKS && t.pct < WEAK_PCT_CEILING)
    .slice(0, MAX_FOCUS);

  return { papers, averagePct, trendPts, focus };
}
