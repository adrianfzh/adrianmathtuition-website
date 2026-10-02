// The science hand-in waiting list, on the database (SPEC-PRACTICE-PHOTO §14,
// 24 Sep 2026). A science paper past the day's allowance is not refused: its
// run is created with `result_json.queued_for` = the first day with room
// (horizon three days), and the midnight cron `daily-queue` puts it in the
// 🌙 queue when that day comes. This helper counts what each day already
// holds — a direct hand-in on the day it was created, a queued one on its
// `queued_for` day, a removed one on no day at all — and asks the pure rule
// in `lib/daily-queue.ts` where the next paper lands.
import { placeInQueue, usedByDay, type QueuePlacement } from '@/lib/daily-queue';
import { sgtDateISO, sgtTodayISO } from '@/lib/sgt';
import { sgtStartOfDayIso } from '@/lib/portal-submit-limit';

type QueueRow = { created_at: string; result_json: Record<string, unknown> | null };

type QueueReadClient = {
  from(table: 'paper_marking_runs'): {
    select(cols: string): {
      eq(col: string, v: string): {
        not(col: string, op: string, v: string): {
          eq(col: string, v: string): {
            is(col: string, v: null): {
              or(filter: string): PromiseLike<{ data: QueueRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
};

/** Where the student's NEXT science paper lands: today, a queued day, or refused. */
export async function scienceQueuePlacement(
  client: unknown,
  studentId: string,
  allowance: number,
  now: Date = new Date(),
): Promise<QueuePlacement> {
  const today = sgtTodayISO(now.getTime());
  const { data, error } = await (client as QueueReadClient)
    .from('paper_marking_runs')
    .select('created_at, result_json')
    .eq('student_id', studentId)
    .not('subject', 'eq', 'math')
    .eq('result_json->>portal_submission', 'true')
    .is('result_json->>queue_removed_at', null)
    .or(`created_at.gte.${sgtStartOfDayIso(now)},result_json->>queued_for.gte.${today}`);
  if (error) throw new Error(error.message);
  const used = usedByDay((data ?? []).map(r => {
    const rj = (r.result_json && typeof r.result_json === 'object') ? r.result_json : {};
    const queuedFor = typeof rj.queued_for === 'string' ? rj.queued_for : null;
    return { createdDay: sgtDateISO(new Date(r.created_at).getTime()), queuedFor };
  }));
  return placeInQueue({ allowance, today, usedByDay: used, noun: 'paper' });
}
