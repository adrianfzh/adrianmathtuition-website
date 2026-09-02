// `portal_accounts.is_ip` — derived from the Airtable Students record
// (2026-09-02). Live-schema checked the same day: `Subject Level` is a
// singleSelect with options G1 / G2 / G3 / IP / H1 / H2. IP = Integrated
// Programme school stream — those students still sit material dropped from
// the O-Level syllabus (A-Math Modulus Functions) and meet Sec-2 material in
// Sec 1, which is what `subgroups.visibility='ip'` / `ip_extra_level` gate
// (lib/subgroup-visibility.ts).
//
// Pure: every writer (activation, the monthly offboarding sweep, the one-off
// backfill) derives the flag through THIS function so the rule has one home.

export const IP_SUBJECT_LEVEL = 'IP';

/** Airtable Students fields → is this an IP-stream student? Only the
 *  `Subject Level` verdict counts; a missing/blank field is not IP. */
export function deriveIsIp(fields: Record<string, unknown> | null | undefined): boolean {
  const raw = fields?.['Subject Level'];
  return typeof raw === 'string' && raw.trim().toUpperCase() === IP_SUBJECT_LEVEL;
}
