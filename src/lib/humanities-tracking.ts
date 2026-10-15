// How the Humanities marker is doing on real students' answers (15 Oct 2026, Adrian: "can we keep track of
// how the marker does on humanities?"). Agreement: every answer is read twice, a third read when the two
// differ, "held" when three disagree — how often the first two agree is the marker's consistency with itself.
// The independent checker and the rules it teaches are lib/humanities-selfcheck.ts. Pure;
// /admin/humanities-marker shows both.
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

const readCount = (reads: unknown): number => (Array.isArray(reads) ? reads.length : 0);

export interface MarkerStats {
  answers: number;
  read: number;
  /** Read and settled on the first two reads. */
  agreedFirst: number;
  held: number;
  failed: number;
}

export function markerStats(rows: TrackRow[]): MarkerStats {
  const s: MarkerStats = { answers: rows.length, read: 0, agreedFirst: 0, held: 0, failed: 0 };
  for (const r of rows) {
    if (r.status === 'failed') s.failed++;
    if (r.status === 'held') s.held++;
    if (r.status === 'marked' || r.status === 'held') {
      s.read++;
      if (r.status === 'marked' && readCount(r.reads) <= 2) s.agreedFirst++;
    }
  }
  return s;
}

/** "83%" or "—" when there is nothing to count. */
export const pct = (n: number, of: number): string => (of > 0 ? `${Math.round((100 * n) / of)}%` : '—');

