// Version tag stored in portal_accounts.consent_record.policy_version.
// Bump this when /privacy materially changes; existing consent records keep
// the version the parent actually saw.
// v3-2026-10 (7 Oct 2026): the purpose gained "and to improve our teaching and marking".
export const POLICY_VERSION = 'v3-2026-10';

// The quiet "this page changed" tag beside Settings › Privacy page (7 Oct 2026, Adrian: "do C").
// Shown until the date below (Singapore day), then gone by itself. Set both when /privacy changes.
export const PRIVACY_UPDATED = { label: 'Updated October 2026', until: '2026-11-07' } as const;
/** The tag to show today, or null once its month is over. Pure. */
export function privacyUpdatedTag(todayISO: string): string | null {
  return todayISO <= PRIVACY_UPDATED.until ? PRIVACY_UPDATED.label : null;
}
