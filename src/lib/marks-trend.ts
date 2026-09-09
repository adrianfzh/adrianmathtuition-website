// The trend of a student's marks, per subject (9 Sep 2026 — Adrian, on
// /admin/students/[id]: "can I see their marked copies in reverse chronological
// order, so I can see the trend of their marks, if they are improving?").
//
// One series per subject (an A Math score says nothing about an E Math one),
// oldest → newest, percentages only, re-marked papers counted once (a run with
// `superseded_by` is the marking that was replaced). The verdict is the slope of
// a least-squares line through the percentages, in points per paper: better than
// "last minus first", which one bad day flips. Fewer than three papers is "too
// few to say". Pure — no dates are compared to now.

export type TrendRun = {
  id?: string;
  created_at: string;
  paper_name?: string | null;
  subject?: string | null;
  total_awarded?: number | null;
  total_max?: number | null;
  superseded_by?: string | null;
};

export type TrendPoint = { id?: string; date: string; pct: number; paper: string };
export type TrendVerdict = 'improving' | 'steady' | 'slipping' | 'too few';
export type SubjectTrend = {
  subject: string;
  points: TrendPoint[];
  latest: number;
  /** Latest minus the paper before it, in percentage points; null with one paper. */
  delta: number | null;
  /** Least-squares slope, points per paper; null with fewer than three papers. */
  slope: number | null;
  verdict: TrendVerdict;
};

export const SLOPE_STEP = 1.5;   // points per paper — under this, "steady"

function pctOf(r: TrendRun): number | null {
  const max = Number(r.total_max), got = Number(r.total_awarded);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(got)) return null;
  return Math.round((100 * got) / max);
}

/** Least-squares slope of y over 0..n-1. */
export function slopeOf(ys: number[]): number | null {
  const n = ys.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - mx) * (ys[i] - my); den += (i - mx) ** 2; }
  return den ? num / den : 0;
}

export function verdictOf(slope: number | null): TrendVerdict {
  if (slope == null) return 'too few';
  if (slope >= SLOPE_STEP) return 'improving';
  if (slope <= -SLOPE_STEP) return 'slipping';
  return 'steady';
}

export function marksTrend(runs: TrendRun[], keyOf?: (r: TrendRun) => string | null | undefined): SubjectTrend[] {
  const bySubject = new Map<string, TrendPoint[]>();
  const usable = (runs || [])
    .filter(r => r && r.created_at && !r.superseded_by && pctOf(r) != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of usable) {
    // The caller may name the series (the profile keys A Math / E Math off the
    // paper's name, since the `subject` column is 'math' for both).
    const subject = (keyOf && keyOf(r)) || (r.subject || 'math').toLowerCase();
    const list = bySubject.get(subject) ?? [];
    list.push({ ...(r.id ? { id: r.id } : {}), date: r.created_at.slice(0, 10), pct: pctOf(r)!, paper: r.paper_name || 'Paper' });
    bySubject.set(subject, list);
  }
  return [...bySubject.entries()].map(([subject, points]) => {
    const ys = points.map(p => p.pct);
    const slope = slopeOf(ys);
    return {
      subject, points, latest: ys[ys.length - 1],
      delta: ys.length >= 2 ? ys[ys.length - 1] - ys[ys.length - 2] : null,
      slope: slope == null ? null : Number(slope.toFixed(2)),
      verdict: verdictOf(slope),
    };
  }).sort((a, b) => b.points.length - a.points.length || a.subject.localeCompare(b.subject));
}

/** "62% → 68% → 74%" for the header line, capped to the last `n` papers. */
export function trendLine(t: SubjectTrend, n = 6): string {
  return t.points.slice(-n).map(p => `${p.pct}%`).join(' → ');
}
