// Sub-group AUDIENCE — who may see a `subgroups` row (2026-09-02).
//
// Three columns decide it, all live in Supabase:
//   subgroups.visibility      'all' | 'ip' | 'hidden'   (default 'all')
//   subgroups.ip_extra_level  e.g. 'S1' — IP students of THAT level also see
//                             this sub-group even though it is filed at a
//                             different level (S1-461 "Special factorisation
//                             forms" lives at S2, lent to IP Sec 1)
//   portal_accounts.is_ip     boolean, derived from Airtable Students
//                             `Subject Level` = 'IP' (lib/portal-ip.ts)
//
// THE RULE (Adrian's decisions, applied as data — never special-case an id):
//   a student sees a sub-group iff
//     visibility='all'  and the sub-group's level is the tree they browse;  or
//     visibility='ip'   and the account is IP and the level matches;        or
//     ip_extra_level = the student's level and the account is IP
//                       (and the row is not 'hidden');
//   'hidden' → nobody except Adrian's admin cookie (admin sees everything,
//   with a small badge).
// Questions filed ONLY under sub-groups a student cannot see are not served
// to them either — that half lives in the RPCs (migrations/subgroup_audience.sql:
// practice_pool / practice_next / practice_subgroups / kiosk_pool) and in
// `questionServableTo` below for the ?qid= deep link and the mock draw.
//
// Pure and IO-free (testing policy in CLAUDE.md). The SQL twin is
// `public.subgroup_visible(...)` — keep the two in step.

export type SubgroupVisibility = 'all' | 'ip' | 'hidden';

/** The columns the rule reads — a superset of every reader's row shape. */
export interface SubgroupAudienceRow {
  level: string;
  visibility?: string | null;
  ip_extra_level?: string | null;
}

/** Who is looking: the sub-group tree being browsed (a `subgroups.level`
 *  key — AM / EM / JC / S1 / S2, i.e. `bankScope(level).level`), whether the
 *  account is IP, and whether this is Adrian's admin view. */
export interface AudienceViewer {
  level: string;
  isIp: boolean;
  admin?: boolean;
}

/** Unknown/unset values FAIL CLOSED: only the three known verdicts exist, and
 *  a typo in the column must never widen an audience. NULL/'' mean the column
 *  default, 'all'. */
export function normaliseVisibility(v: string | null | undefined): SubgroupVisibility {
  if (v == null || v === '' || v === 'all') return 'all';
  if (v === 'ip') return 'ip';
  return 'hidden';
}

const key = (s: string | null | undefined): string => (s ?? '').trim().toUpperCase();

/** Does this sub-group belong to the tree of `level` — filed there, or lent
 *  to it via ip_extra_level? (Membership only; says nothing about audience.) */
export function subgroupInTree(sg: SubgroupAudienceRow, level: string): boolean {
  const L = key(level);
  if (!L) return false;
  return key(sg.level) === L || key(sg.ip_extra_level) === L;
}

/** THE visibility predicate. */
export function subgroupVisibleTo(sg: SubgroupAudienceRow, viewer: AudienceViewer): boolean {
  const L = key(viewer.level);
  if (!L) return false;
  const home = key(sg.level) === L;
  const lent = key(sg.ip_extra_level) === L;
  if (!home && !lent) return false;
  if (viewer.admin) return true;
  const vis = normaliseVisibility(sg.visibility);
  if (vis === 'hidden') return false;
  if (home) return vis === 'all' || viewer.isIp;
  return viewer.isIp; // lent rows are, by definition, for IP students of that level
}

/** Filter + keep order. */
export function visibleSubgroups<T extends SubgroupAudienceRow>(rows: T[], viewer: AudienceViewer): T[] {
  return rows.filter(r => subgroupVisibleTo(r, viewer));
}

/**
 * Admin badge text for a row that is not plain 'all' — null when there is
 * nothing to say. `level` is the tree being browsed, so a lent row reads
 * "IP only here · filed at S2" from the S1 tree and "also IP S1" from its own.
 */
export function audienceBadge(sg: SubgroupAudienceRow, level?: string): string | null {
  const parts: string[] = [];
  const vis = normaliseVisibility(sg.visibility);
  if (vis === 'hidden') parts.push('hidden');
  else if (vis === 'ip') parts.push('IP only');
  const extra = key(sg.ip_extra_level);
  if (extra) {
    if (level && key(level) === extra && key(sg.level) !== extra) {
      parts.push(`IP only here · filed at ${key(sg.level)}`);
    } else {
      parts.push(`also IP ${extra}`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * May a question be SERVED to this viewer, given every sub-group it is filed
 * under? Mirrors the RPC rule for readers that resolve a question by id
 * (the /app/practice?qid= deep link, the mock-paper slot candidates):
 *   - admin → always;
 *   - not filed under any sub-group of the viewer's trees → yes (nothing to
 *     gate on; that is the topic-tag path, unchanged);
 *   - otherwise yes iff at least one of those filings is visible to them.
 * `levels` are the viewer's tree keys (bankScope(...).level per allowed QB
 * level). A question filed only under hidden/IP-only sub-groups therefore
 * says "not part of your syllabus" instead of opening.
 */
export function questionServableTo(
  filings: SubgroupAudienceRow[],
  viewer: { levels: string[]; isIp: boolean; admin?: boolean },
): boolean {
  if (viewer.admin) return true;
  const levels = viewer.levels.map(key).filter(Boolean);
  const inTrees = filings.filter(f => levels.some(L => subgroupInTree(f, L)));
  if (inTrees.length === 0) return true;
  return inTrees.some(f => levels.some(L => subgroupVisibleTo(f, { level: L, isIp: viewer.isIp })));
}

/** Audience flags from a portal account row (null = anonymous). */
export function accountAudience(
  account: { is_ip?: boolean | null } | null | undefined,
  admin = false,
): { isIp: boolean; admin: boolean } {
  return { isIp: admin || Boolean(account?.is_ip), admin };
}

/** PostgREST `.or()` filter for PUBLIC surfaces with no account (the /revise
 *  decks): only the 'all' audience, NULL meaning the column default. */
export const PUBLIC_VISIBILITY_FILTER = 'visibility.eq.all,visibility.is.null';

/** Values the admin control may write. */
export const SUBGROUP_VISIBILITIES: readonly SubgroupVisibility[] = ['all', 'ip', 'hidden'];
/** `subgroups.level` keys a sub-group may be lent to. */
export const SUBGROUP_TREE_LEVELS: readonly string[] = ['S1', 'S2', 'EM', 'AM', 'JC'];

export function isSubgroupVisibility(v: unknown): v is SubgroupVisibility {
  return typeof v === 'string' && (SUBGROUP_VISIBILITIES as readonly string[]).includes(v);
}
