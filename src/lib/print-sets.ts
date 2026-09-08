// lib/print-sets.ts — "Set papers" on /app/print (SPEC-PRINT-PAPER.md §Set papers).
//
// A Set is a complete, fixed paper of NEW SEAB-style questions written by the
// GCE generator (docs/GCE-PAPER.md; the gce-paper skill) and filed into the
// question bank by scripts/gce-paper/publish.mjs as ordinary `questions` rows:
//   school = 'AdrianMath', exam_type = 'Set <n>', paper = '1' | '2',
//   question_number = the slot, level = the blueprint family (AM/EM/JC).
// Nothing else marks them — so the bank's own consumers (topic sheets, mock
// draws, practice pools) may also serve a Set question on its own, and this
// module is only about re-assembling the rows into the printable paper.
//
// Pure: the route fetches SET_QUESTION_COLUMNS and hands the rows here.
import { shapeLabel, subjectShortName, type PrintQuestionRef } from './print-paper';

export const SET_SCHOOL = 'AdrianMath';
/** `exam_type` of a Set row — "Set 1", "Set 2", … (the LIKE pattern the route queries with). */
export const SET_EXAM_TYPE_LIKE = 'Set %';
const SET_EXAM_TYPE_RE = /^Set (\d+)$/;

/** The columns groupSetPapers needs — the route selects exactly these. */
export const SET_QUESTION_COLUMNS = 'id, level, exam_type, paper, question_number, total_marks';

export function setExamType(set: number): string {
  return `Set ${set}`;
}

/** "Set 3" → 3; anything else → null (a row filed under a typo is not a Set). */
export function setNumber(examType: string | null | undefined): number | null {
  const m = SET_EXAM_TYPE_RE.exec((examType ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The bank files real papers as paper '1' / '2'; the portal says P1 / P2. */
export function setPaperKey(paper: string | null | undefined): 'P1' | 'P2' | null {
  const p = String(paper ?? '').trim().toUpperCase();
  if (p === '1' || p === 'P1') return 'P1';
  if (p === '2' || p === 'P2') return 'P2';
  return null;
}

/** The stored title of a printed Set paper — "A Math · Set 1 · Paper 1 ·
 * O-Level format". It carries the shape marker so shapeFromTitle() renders
 * the exam-format cover (the same title-is-the-carrier rule as mockTitle). */
export function setPaperTitle(level: string, set: number, paper: 'P1' | 'P2'): string {
  return `${subjectShortName(level)} · Set ${set} · ${paper === 'P1' ? 'Paper 1' : 'Paper 2'} · ${shapeLabel(level, 'gce')}`;
}

/** The set number a stored Set paper's title carries ("A Math · Set 1 · …") —
 * portal_generated_papers has no column for it, so, like the shape, the title
 * is the carrier the PDF cover reads. */
export function setNumberFromTitle(title: string | null | undefined): number | null {
  const m = /\bSet (\d+)\b/.exec(title ?? '');
  return m ? Number(m[1]) : null;
}

export interface SetQuestionRow {
  id: string;
  level: string;
  exam_type: string | null;
  paper: string | null;
  question_number: string | null;
  total_marks: number | null;
}

export interface SetPaper {
  level: string;
  set: number;
  paper: 'P1' | 'P2';
  title: string;
  questionCount: number;
  totalMarks: number;
  /** Every question 1..n present once, each with marks, and (when the
   * blueprint total is known) the marks add up to it. Only a complete paper
   * is offered to a student — a half-published set would print short. */
  complete: boolean;
  /** Question numbers absent from 1..max (empty when complete). */
  missing: number[];
  refs: PrintQuestionRef[];
}

/** Group Set rows into printable papers. `expectedTotal` is the blueprint's
 * paper total for (level, paper) — null when unknown, which skips the marks
 * check but still requires 1..n contiguity. Output order: level, set, paper. */
export function groupSetPapers(
  rows: SetQuestionRow[],
  expectedTotal: (level: string, paper: 'P1' | 'P2') => number | null = () => null,
): SetPaper[] {
  const groups = new Map<string, { level: string; set: number; paper: 'P1' | 'P2'; rows: { n: number; id: string; marks: number }[] }>();
  for (const r of rows) {
    const set = setNumber(r.exam_type);
    const paper = setPaperKey(r.paper);
    const n = Number(r.question_number);
    if (set === null || !paper || !Number.isInteger(n) || n <= 0) continue;
    const key = `${r.level}|${set}|${paper}`;
    const g = groups.get(key) ?? { level: r.level, set, paper, rows: [] };
    g.rows.push({ n, id: r.id, marks: r.total_marks ?? 0 });
    groups.set(key, g);
  }
  const out: SetPaper[] = [];
  for (const g of groups.values()) {
    g.rows.sort((a, b) => a.n - b.n);
    const max = g.rows[g.rows.length - 1]?.n ?? 0;
    const seen = new Set<number>();
    let duplicate = false;
    for (const r of g.rows) { if (seen.has(r.n)) duplicate = true; seen.add(r.n); }
    const missing: number[] = [];
    for (let i = 1; i <= max; i++) if (!seen.has(i)) missing.push(i);
    const totalMarks = g.rows.reduce((s, r) => s + r.marks, 0);
    const expected = expectedTotal(g.level, g.paper);
    const complete = g.rows.length > 0 && !duplicate && missing.length === 0
      && g.rows.every(r => r.marks > 0)
      && (expected === null || expected === totalMarks);
    out.push({
      level: g.level, set: g.set, paper: g.paper,
      title: setPaperTitle(g.level, g.set, g.paper),
      questionCount: g.rows.length, totalMarks, complete, missing,
      refs: g.rows.map(r => ({ id: r.id, pos: r.n, marks: r.marks })),
    });
  }
  return out.sort((a, b) => a.level.localeCompare(b.level) || a.set - b.set || a.paper.localeCompare(b.paper));
}

/** The paper total a blueprint entry implies (sum of its slots' typical marks). */
export function blueprintTotal(def: { slots?: { typ?: number }[] } | null | undefined): number | null {
  const sum = (def?.slots ?? []).reduce((s, x) => s + (x.typ ?? 0), 0);
  return sum > 0 ? sum : null;
}
