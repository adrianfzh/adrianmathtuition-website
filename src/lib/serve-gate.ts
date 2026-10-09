// Which bank rows a STUDENT may be shown by id (5 Oct 2026).
//
// The practice RPCs (practice_next / practice_pool) decide what a student is
// served; a few doors take a question id straight from the browser — 🪜 "Stuck?
// Next step" (the bank's own working, line by line) and the worked solution. They
// must not open what the RPCs would never serve. Above all, national rows
// (`national = true`, school 'GCE') are grounding-only under docs/CONTENT-POLICY.md.
// Mirrors practice_next's WHERE clause; pure, tested.
import { legacyServableTo, questionServableTo, type SubgroupAudienceRow } from './subgroup-visibility';

export interface GateRow {
  level?: string | null;
  school?: string | null;
  national?: boolean | null;
  deleted_at?: string | null;
  ai_generated?: boolean | null;
  verified?: boolean | null;
  flagged_count?: number | null;
  legacy_syllabus?: boolean | null;
}

/** Bank `questions.level` values a practice level key serves (public.practice_qlevels, kept in step). */
export function practiceQLevels(level: string): string[] {
  if (level === 'JC') return ['JC1', 'JC2'];
  if (level === 'AM') return ['AM', 'S3_AM'];
  if (level === 'EM') return ['EM', 'S3_EM'];
  return [level];
}

/** National / GCE rows: never shown to a student, whatever else holds. */
export function isNationalRow(q: GateRow): boolean {
  return q.national === true || (q.school || '').trim().toUpperCase() === 'GCE';
}

export interface GateContext {
  /** Bank levels this student may practise (null = Adrian's admin view: no level/quality rules). */
  allowedQLevels: string[] | null;
  isIp: boolean;
  /** The question is on the student's own list (Adrian sent it, or they were given it). */
  assigned: boolean;
}

export type Refusal = 'removed' | 'national' | 'unverified' | 'flagged' | 'legacy' | 'level';

/** Why a student may not see this row, or null when they may. 'level' is the one a caller may double-check against the pool. */
export function serveRefusal(q: GateRow, ctx: GateContext): Refusal | null {
  if (q.deleted_at) return 'removed';
  if (isNationalRow(q)) return 'national';
  if (ctx.allowedQLevels === null) return null;
  if (q.ai_generated === true && q.verified !== true) return 'unverified';
  if ((q.flagged_count ?? 0) >= 3) return 'flagged';
  if (ctx.assigned) return null;
  if (q.legacy_syllabus === true && !ctx.isIp) return 'legacy';
  if (!q.level || !ctx.allowedQLevels.includes(q.level)) return 'level';
  return null;
}

/**
 * A TOPIC-TAG draw (the Print-a-paper mock reads `questions` by tag, not through
 * practice_pool) — may this row go to this student? The by-id gate above, then
 * the two rules the RPCs apply through the question's filings:
 *   - an old-syllabus row serves only through an IP-only filing the student can see
 *     (9 Oct 2026: the mock drew flagged rows — ~1,000 JC questions had just been
 *     marked old syllabus and a paper could still print them);
 *   - a row filed only under sub-skills the student cannot see is not served.
 * `qLevels` = bank levels the draw may use; `treeLevels` = the sub-skill trees
 * the student browses (bankScope(...).level).
 */
export function tagDrawRefusal(
  q: GateRow,
  filings: SubgroupAudienceRow[],
  viewer: { qLevels: string[]; treeLevels: string[]; isIp: boolean },
): Refusal | 'audience' | null {
  const refusal = serveRefusal(q, { allowedQLevels: viewer.qLevels, isIp: viewer.isIp, assigned: false });
  if (refusal) return refusal;
  const audience = { levels: viewer.treeLevels, isIp: viewer.isIp };
  if (q.legacy_syllabus === true && !legacyServableTo(filings, audience)) return 'legacy';
  if (!questionServableTo(filings, audience)) return 'audience';
  return null;
}
