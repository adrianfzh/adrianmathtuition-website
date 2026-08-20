// One paper hand-in per student per Singapore calendar day (Adrian, 21 Aug
// 2026, Phase G hardening — every hand-in is auto-queued into Opus marking and
// Telegrams a finished PDF, so the cap is a cost brake as much as a UX one).
// SGT is UTC+8 with no DST, so the day boundary needs no timezone library.
export const DAILY_SUBMIT_CAP = 1;

/** UTC ISO timestamp of the most recent midnight in Singapore (UTC+8). */
export function sgtStartOfDayIso(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 8 * 60 * 60 * 1000).toISOString();
}
