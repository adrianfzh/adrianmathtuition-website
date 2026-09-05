// The three tiles on /app/marking — latest %, average, trend — PER SUBJECT
// (SPEC-PORTAL-V2.md §1, Adrian 6 Sep 2026: an A Math average and an E Math
// average are two different facts; one blended number told a student nothing).
//
// Pure. Input is the student's already-built, already-gated paper list (newest
// first, as buildStudentMarking returns it); output is one stats block per
// subject the student actually has papers in, in the account's display order.
// "Other" papers (and legacy rows with no subject) are listed on the page but
// count in no tile — they are not maths of a kind the tiles can compare.
import { PAPER_SUBJECTS, type PaperSubject } from './portal-subjects';

export interface StatPaper {
  /** YYYY-MM-DD — the paper's marking date. */
  date: string;
  /** Null when the paper carries no marks (nothing to be a percent of). */
  pct: number | null;
  /** paper_marking_runs.paper_subject: 'A Math' | 'E Math' | 'H2 Math' | 'Other' | null (undefined = untagged too). */
  subject?: string | null;
}

export interface SubjectStats {
  subject: PaperSubject;
  /** Papers of this subject, scored or not — the "average of N" label. */
  papers: number;
  /** The newest scored paper's percentage. */
  latestPct: number | null;
  /** Mean of the scored papers' percentages, 0–100. Null with no scored paper. */
  averagePct: number | null;
  /** Newest scored minus oldest scored, in points. Null with fewer than 2 scored papers. */
  trendPts: number | null;
}

/** ±5 points is paper-to-paper noise; calling a 2-point move "improving" would be
 *  dishonest encouragement. Same band the page has always used. */
export const TREND_NOISE_PTS = 5;

export function isTileSubject(subject: string | null | undefined): subject is PaperSubject {
  return (PAPER_SUBJECTS as readonly string[]).includes(subject ?? '');
}

/** One subject's tiles over its own papers only. Order-independent: sorts by
 *  date (stable, so same-day papers keep the caller's newest-first order). */
export function subjectStats(papers: readonly StatPaper[], subject: PaperSubject): SubjectStats {
  const mine = papers.filter(p => p.subject === subject);
  const newestFirst = [...mine].sort((a, b) => b.date.localeCompare(a.date));
  const scored = newestFirst.filter(p => p.pct !== null) as (StatPaper & { pct: number })[];
  const latestPct = scored.length ? scored[0].pct : null;
  const averagePct = scored.length
    ? Math.round(scored.reduce((s, p) => s + p.pct, 0) / scored.length)
    : null;
  const trendPts = scored.length >= 2 ? scored[0].pct - scored[scored.length - 1].pct : null;
  return { subject, papers: mine.length, latestPct, averagePct, trendPts };
}

/**
 * Stats for every allowed subject the student has at least one paper in, in
 * `allowed` order (the account's display order — lib/portal-subjects). One
 * entry → the page shows plain tiles; two or more → tabs. Empty when every
 * paper is "Other"/untagged (then there are no tiles to show).
 */
export function statsBySubject(papers: readonly StatPaper[], allowed: readonly PaperSubject[]): SubjectStats[] {
  const out: SubjectStats[] = [];
  for (const subject of allowed) {
    const s = subjectStats(papers, subject);
    if (s.papers > 0) out.push(s);
  }
  return out;
}

export type TrendTone = 'up' | 'down' | 'steady';

/** The trend tile's text — null when there is no trend yet. */
export function trendLabel(trendPts: number | null): { text: string; tone: TrendTone } | null {
  if (trendPts === null) return null;
  if (trendPts >= TREND_NOISE_PTS) return { text: `↑ ${trendPts} pts`, tone: 'up' };
  if (trendPts <= -TREND_NOISE_PTS) return { text: `↓ ${Math.abs(trendPts)} pts`, tone: 'down' };
  return { text: 'steady', tone: 'steady' };
}
