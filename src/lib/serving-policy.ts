// The flip (SPEC-TWINS.md §6, 30 Sep 2026): school rows leave serving one
// (tree level, topic) at a time, on Adrian's tick, never below the threshold.
// The DB side is `serving_policy` + `serving_school_rows()` inside the four
// serving RPCs (migrations/serving_policy.sql); this file is the pure rule the
// route, the ops board and `practiceEligibility` share.

/** Rows that are OURS — the only rows served once a topic is flipped. */
export const OUR_SCHOOLS = ['AdrianMath', 'AI Generated'] as const;

export function isOurRow(school: string | null | undefined): boolean {
  return (OUR_SCHOOLS as readonly string[]).includes(String(school ?? ''));
}

/** One row of the `twin_readiness` view. */
export type TopicReadiness = {
  level: string;
  topic: string;
  verified_twins: number;
  pending_twins: number;
  school_rows: number;
  drawn_90d: number;
  school_rows_served: boolean;
  flipped_at: string | null;
  flipped_by: string | null;
};

/**
 * The threshold (§6): verified twins ≥ school rows drawn in the last 90 days,
 * and at least one verified twin — a topic nobody drew from still needs
 * something of ours to serve.
 */
export function flipReady(r: Pick<TopicReadiness, 'verified_twins' | 'drawn_90d'>): boolean {
  return r.verified_twins > 0 && r.verified_twins >= r.drawn_90d;
}

export function isFlipped(r: Pick<TopicReadiness, 'school_rows_served'>): boolean {
  return r.school_rows_served === false;
}

/** Key for a Set of flipped topics, mirroring the RPCs' (level, topic) join. */
export function policyKey(level: string, topic: string): string {
  return `${level}\u0001${topic}`;
}

/** What the ops board lists: topics with any twin, or already flipped — ready first. */
export function orderReadiness(rows: TopicReadiness[]): TopicReadiness[] {
  const shown = rows.filter(r => r.verified_twins + r.pending_twins > 0 || isFlipped(r));
  const rank = (r: TopicReadiness) => (isFlipped(r) ? 0 : flipReady(r) ? 1 : 2);
  return shown.sort((a, b) =>
    rank(a) - rank(b)
    || b.verified_twins - a.verified_twins
    || b.pending_twins - a.pending_twins
    || a.level.localeCompare(b.level)
    || a.topic.localeCompare(b.topic));
}
