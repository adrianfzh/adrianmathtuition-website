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

/**
 * Papers this student has handed in since SGT midnight, across BOTH surfaces.
 *
 * Adrian, 24 Aug 2026: "one paper per student per day." A student can reach the
 * marking queue two ways — here, and the Telegram bot's /handin — and until now
 * each side counted only its own, so one student could spend two slots in a day
 * (three, if a parent's Telegram was linked to the same record too). Both sides
 * now count the same thing, keyed on the STUDENT rather than on the browser
 * session or the Telegram chat. Papers Adrian uploads himself through
 * /admin/mark-paper carry neither marker and never spend a student's day.
 *
 * Two head-counts rather than one `.or()` over JSON paths: each filter shape is
 * already proven in this codebase, and a head count transfers no rows.
 */
type CountResult = { count: number | null; error: unknown };

interface CountQuery extends PromiseLike<CountResult> {
  gte(column: string, value: string): CountQuery;
  eq(column: string, value: string): CountQuery;
  not(column: string, operator: string, value: null): CountQuery;
}

export interface HandinCountingClient {
  from(table: string): {
    select(columns: string, options: { count: 'exact'; head: true }): CountQuery;
  };
}

export async function countHandinsToday(
  client: HandinCountingClient,
  studentId: string,
  now: Date = new Date(),
): Promise<number> {
  const since = sgtStartOfDayIso(now);
  const forStudent = () => client
    .from('paper_marking_runs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .eq('student_id', studentId);

  const [telegram, portal] = await Promise.all([
    forStudent().not('result_json->telegram_handin', 'is', null),
    forStudent().eq('result_json->>portal_submission', 'true'),
  ]);
  return (telegram.count ?? 0) + (portal.count ?? 0);
}
