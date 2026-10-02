// The waiting list (SPEC-PRACTICE-PHOTO.md §14, 24 Sep 2026) — one pure rule
// used in two places: the Practice tab's photo sheets (one a day) and science
// hand-ins (two a day). A new item lands on the first Singapore day, counting
// from today, with room under the allowance. Beyond the horizon (today plus
// QUEUE_HORIZON_DAYS) it is refused with a plain line. A queued item starts at
// midnight SGT of its day — the sheet worker's date filter and the daily-queue
// cron both read the day, nothing flips a row at midnight.
//
// Adrian, 24 Sep 2026: "if students upload more than the required number of
// questions per day, they will be queued for the next day. But max queue is
// 3 days? … Allow them to remove the queued items too."
import { addDaysISO } from '@/lib/sgt';

export const QUEUE_HORIZON_DAYS = 3;

export type QueuePlacement =
  | { ok: true; day: string; waits: boolean }
  | { ok: false; message: string };

/** Count items per day. `null`/`undefined` days are skipped. */
export function countByDay(days: (string | null | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of days) {
    if (!d) continue;
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

/** The day an existing item occupies: the day it was queued for, else the day it was made. */
export function usedByDay(items: { createdDay: string; queuedFor: string | null | undefined }[]): Record<string, number> {
  return countByDay(items.map(i => i.queuedFor || i.createdDay));
}

export function placeInQueue(input: {
  allowance: number;
  today: string;
  usedByDay: Record<string, number>;
  horizonDays?: number;
  /** Singular noun for the refusal line: 'sheet', 'paper'. */
  noun?: string;
}): QueuePlacement {
  const horizon = Math.max(0, input.horizonDays ?? QUEUE_HORIZON_DAYS);
  const noun = input.noun ?? 'item';
  if (input.allowance <= 0) return { ok: false, message: `No ${noun}s can be queued right now.` };
  for (let d = 0; d <= horizon; d++) {
    const day = addDaysISO(input.today, d);
    if ((input.usedByDay[day] ?? 0) < input.allowance) return { ok: true, day, waits: d > 0 };
  }
  return {
    ok: false,
    message: `Today and the next ${horizon} days are full — remove a queued ${noun}, or send this one tomorrow.`,
  };
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'today' · 'tomorrow' · 'Thursday' (within the week) · '3 Oct' (further). */
export function dayWord(day: string, today: string): string {
  if (day === today) return 'today';
  if (day === addDaysISO(today, 1)) return 'tomorrow';
  const at = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return day;
  const gap = Math.round((at.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
  if (gap > 1 && gap < 7) return WEEKDAY[at.getUTCDay()];
  return `${at.getUTCDate()} ${MONTH[at.getUTCMonth()]}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The chip on a waiting row: 'Queued · Thursday'. */
export function queuedLabel(day: string, today: string): string {
  return `Queued · ${capitalise(dayWord(day, today))}`;
}
