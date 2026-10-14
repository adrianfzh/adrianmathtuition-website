// IP-ONLY CONTENT for IP students (Adrian, 15 Oct 2026: "yes").
//
// Two flags on a maths bank row:
//   legacy_syllabus = true → the serving gate: not on the current O-Level syllabus.
//   ip_syllabus     = true → provenance: the row came from an IP school's paper.
// BOTH = IP-only content (Progressions, Permutations and Combinations, Vectors,
// Matrices, Functions …). It serves to an IP student; a mainstream student never
// sees it. Legacy WITHOUT ip_syllabus is old O-Level syllabus — blocked for
// everyone (the A Math Modulus rows filed under 'ip' sub-groups are the one
// older exception, lib/subgroup-visibility.ts legacyServableTo).
//
// SQL twin: migrations/ip_content.sql (`p_ip_content` on practice_pool /
// practice_next / practice_subgroups / practice_topics / practice_overview).
// Release switch: IP_TOPICS_OPEN_TO_STUDENTS in lib/portal-beta.ts.
// Pure and IO-free.

export interface IpContentRow {
  legacy_syllabus?: boolean | null;
  ip_syllabus?: boolean | null;
}

/** An IP-only row: off the O-Level syllabus, from an IP school's paper. */
export function isIpOnlyRow(q: IpContentRow): boolean {
  return q.legacy_syllabus === true && q.ip_syllabus === true;
}

/** Does the syllabus gate let this row through for a caller with this verdict?
 *  (Says nothing about the other gates — national, flagged, answers, level.) */
export function syllabusAllows(q: IpContentRow, ipContent: boolean): boolean {
  if (q.legacy_syllabus !== true) return true;
  return ipContent && q.ip_syllabus === true;
}

/**
 * May this caller be served IP-only content?
 *   - Adrian's admin view → yes;
 *   - the preview student → yes, so he can try it before it opens;
 *   - an IP student → only once the release switch is on;
 *   - everyone else → no.
 */
export function ipContentAllowed(v: {
  admin: boolean;
  isIp: boolean;
  switchOpen: boolean;
  identity?: string | null;
  previewIdentities: readonly string[];
}): boolean {
  if (v.admin) return true;
  if (v.identity && v.previewIdentities.includes(v.identity)) return true;
  return v.switchOpen && v.isIp;
}
