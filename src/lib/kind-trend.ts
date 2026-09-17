// "Did the sheet work?" measured on the NEXT paper (17 Sep 2026, Adrian: "how
// can we measure the effectiveness of all these changes?"). For each student,
// the share of marks lost to careless kinds and to method on their last two
// released papers at the same level: a student whose careless share fell after
// a careless-heavy sheet is the sheet working. Pure; the Monday report prints
// the counts. Kinds come from lib/error-kinds (the marker's part labels).
export type PaperKinds = { student_id: string; level: string; created_at: string; lost: number; careless: number; concept: number };

export type KindTrend = {
  students: number;          // with two comparable papers in the window
  carelessDown: number;      // careless share fell by ≥ 10 points
  carelessUp: number;
  conceptDown: number;
  conceptUp: number;
  scoreUp: number;           // percentage up by ≥ 5 points
  scoreDown: number;         // down by ≥ 15 (the drastic band)
};

export type PaperScore = PaperKinds & { pct: number };

/** Per student+level, the newest two papers, oldest first. */
export function pairs(rows: PaperScore[]): PaperScore[][] {
  const by = new Map<string, PaperScore[]>();
  for (const r of rows) {
    if (!r.student_id || !r.level) continue;
    const k = `${r.student_id}|${r.level}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out: PaperScore[][] = [];
  for (const list of by.values()) {
    const sorted = list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    if (sorted.length >= 2) out.push(sorted.slice(-2));
  }
  return out;
}

const share = (part: number, lost: number) => (lost > 0 ? (part / lost) * 100 : 0);

export function kindTrend(rows: PaperScore[]): KindTrend {
  const t: KindTrend = { students: 0, carelessDown: 0, carelessUp: 0, conceptDown: 0, conceptUp: 0, scoreUp: 0, scoreDown: 0 };
  for (const [a, b] of pairs(rows)) {
    t.students += 1;
    const dc = share(b.careless, b.lost) - share(a.careless, a.lost);
    const dk = share(b.concept, b.lost) - share(a.concept, a.lost);
    if (dc <= -10) t.carelessDown += 1; else if (dc >= 10) t.carelessUp += 1;
    if (dk <= -10) t.conceptDown += 1; else if (dk >= 10) t.conceptUp += 1;
    if (b.pct - a.pct >= 5) t.scoreUp += 1; else if (a.pct - b.pct >= 15) t.scoreDown += 1;
  }
  return t;
}

export function trendLine(t: KindTrend): string {
  if (!t.students) return '📈 Next-paper trend: no student has two comparable papers in the window yet.';
  return `📈 Next-paper trend (${t.students} student${t.students === 1 ? '' : 's'} with two papers at the same level): careless share down for ${t.carelessDown}, up for ${t.carelessUp}; method share down for ${t.conceptDown}, up for ${t.conceptUp}; score up 5+ for ${t.scoreUp}, drastic drop for ${t.scoreDown}.`;
}
