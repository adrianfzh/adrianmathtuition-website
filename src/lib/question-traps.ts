// 🪤 Common traps — a label separate from the difficulty level (4 Nov 2026, Adrian: "it should
// also be able to classify a question that most students make mistakes").
//
// The counts come from the maths project's `question_trap_stats()` (migrations/question_traps.sql):
// each student's FIRST go at a bank question — a marked paper (trusted paper match) or maths
// practice — whether they lost marks, and the marker's `error_kind` on the parts they lost. This
// module turns the counts into the label; the nightly /api/cron/math-practice-difficulty writes
// `question_traps`. Internal only: nothing a student sees says how it is worked out (Adrian).
//
// The rule:
//   • a TRAP needs at least TRAP_MIN_STUDENTS students, and MORE than half of them lost marks;
//   • it NAMES the mistake when one error kind is shared by at least half of those who lost
//     marks — never "incomplete" (stopping short is not a trap in the maths). Otherwise it is a
//     trap with no single mistake.
//   • A Core question can be a trap; the label never changes the level.

import { ERROR_KIND_LABEL, isErrorKind, type ErrorKind } from './error-kinds';

/** Fewest students before a question can be called a common trap (marked papers hold ≤ 10 a question today). */
export const TRAP_MIN_STUDENTS = 5;
/** More than this share must have lost marks. */
export const TRAP_MIN_LOST_SHARE = 0.5;
/** The named mistake must be shared by at least this share of those who lost marks. */
export const TRAP_KIND_MIN_SHARE = 0.5;
/** Kinds that are never named as "the" trap. */
export const TRAP_KINDS_NEVER_NAMED: readonly string[] = ['incomplete'];

export type TrapStat = {
  question_id: string;
  students: number;
  lost: number;
  kind: string | null;
  kind_students: number;
  part_label: string | null;
  from_papers: number;
  from_practice: number;
};

export type TrapRow = TrapStat & { is_trap: boolean; kind: ErrorKind | null };

/** The counts → the row to store: is it a common trap, and which mistake (or null). */
export function classifyTrap(s: TrapStat): TrapRow {
  const isTrap = s.students >= TRAP_MIN_STUDENTS && s.lost > s.students * TRAP_MIN_LOST_SHARE;
  const named = isTrap && isErrorKind(s.kind) && !TRAP_KINDS_NEVER_NAMED.includes(s.kind)
    && s.kind_students >= s.lost * TRAP_KIND_MIN_SHARE;
  return { ...s, is_trap: isTrap, kind: named ? (s.kind as ErrorKind) : null, kind_students: named ? s.kind_students : 0, part_label: named ? s.part_label : null };
}

/** One plain line for Adrian's admin list: "7 of 9 lost marks · 5 the same way: concept, in (b)". */
export function trapLine(r: Pick<TrapRow, 'students' | 'lost' | 'kind' | 'kind_students' | 'part_label'>): string {
  const head = `${r.lost} of ${r.students} lost marks`;
  if (!r.kind) return head;
  const part = r.part_label ? `, in (${String(r.part_label).replace(/^\(|\)$/g, '')})` : '';
  return `${head} · ${r.kind_students} the same way: ${ERROR_KIND_LABEL[r.kind]}${part}`;
}
