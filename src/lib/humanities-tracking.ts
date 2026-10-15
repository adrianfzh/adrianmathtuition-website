// How the Humanities marker is doing on real students' answers (15 Oct 2026, Adrian: "can we keep track of
// how the marker does on humanities?"). Two signals, both from humanities_runs:
//  1. Agreement — every answer is read twice; a third read when the two differ; "held" when three disagree.
//     How often the first two agree is the marker's consistency with itself.
//  2. The teacher's mark — a student who gets the answer back from school types in what the teacher gave
//     (the feedback page). Does it fall inside the range we said? That is the marker against the truth.
//     A disagreement is for Adrian to look at (CLAUDE.md doctrine: he adjudicates where the marker and an
//     examiner disagree). Pure; /admin/humanities-marker shows it.
import { markRange } from './humanities-marks';

export interface TrackRow {
  id: string;
  created_at: string;
  student_name: string | null;
  subject: string;
  skill: string;
  status: string;
  level_lo: number | null;
  level_hi: number | null;
  levels_max: number | null;
  reads: unknown;
  /** The question's marks when known (printed, or the bank's). */
  marks: number | null;
  /** Point-marked (Geography short questions): the level fields already hold marks. */
  points: boolean;
  teacher_mark: number | null;
  teacher_total: number | null;
}

/** Our mark range for a read answer: [from, to, total], or null. */
export function ourRange(r: TrackRow): [number, number, number] | null {
  if (r.level_lo == null || r.level_hi == null) return null;
  if (r.points) {
    const total = r.marks ?? r.levels_max;
    return total ? [Math.min(r.level_lo, r.level_hi), Math.max(r.level_lo, r.level_hi), total] : null;
  }
  return markRange(r.skill, r.marks, r.level_lo, r.level_hi);
}

export type TeacherVerdict = 'inside' | 'we-high' | 'we-low';

/** The teacher's mark against our range, on the same scale (a different total is scaled), half a mark of give. */
export function teacherVerdict(r: TrackRow): { verdict: TeacherVerdict; gap: number } | null {
  const ours = ourRange(r);
  if (!ours || r.teacher_mark == null) return null;
  const [from, to, total] = ours;
  const t = r.teacher_total && r.teacher_total !== total ? (r.teacher_mark / r.teacher_total) * total : r.teacher_mark;
  if (t < from - 0.5) return { verdict: 'we-high', gap: from - t };
  if (t > to + 0.5) return { verdict: 'we-low', gap: t - to };
  return { verdict: 'inside', gap: 0 };
}

const readCount = (reads: unknown): number => (Array.isArray(reads) ? reads.length : 0);

export interface MarkerStats {
  answers: number;
  read: number;
  /** Read and settled on the first two reads. */
  agreedFirst: number;
  held: number;
  failed: number;
  teacher: number;
  inside: number;
  weHigh: number;
  weLow: number;
}

export function markerStats(rows: TrackRow[]): MarkerStats {
  const s: MarkerStats = { answers: rows.length, read: 0, agreedFirst: 0, held: 0, failed: 0, teacher: 0, inside: 0, weHigh: 0, weLow: 0 };
  for (const r of rows) {
    if (r.status === 'failed') s.failed++;
    if (r.status === 'held') s.held++;
    if (r.status === 'marked' || r.status === 'held') {
      s.read++;
      if (r.status === 'marked' && readCount(r.reads) <= 2) s.agreedFirst++;
    }
    const v = teacherVerdict(r);
    if (v) {
      s.teacher++;
      if (v.verdict === 'inside') s.inside++; else if (v.verdict === 'we-high') s.weHigh++; else s.weLow++;
    }
  }
  return s;
}

/** "83%" or "—" when there is nothing to count. */
export const pct = (n: number, of: number): string => (of > 0 ? `${Math.round((100 * n) / of)}%` : '—');

/** The check on a typed teacher's mark. */
export function readTeacherMark(mark: unknown, total: unknown): { mark: number; total: number } | null {
  const m = Number(mark), t = Number(total);
  if (!Number.isFinite(m) || !Number.isInteger(t) || t < 1 || t > 30 || m < 0 || m > t) return null;
  return { mark: Math.round(m * 2) / 2, total: t };
}
