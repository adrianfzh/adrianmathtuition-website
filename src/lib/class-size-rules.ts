// 👥 Class sizes — the hard and soft caps (15 Oct 2026, Adrian: "we need to have a hard rule now -
// 4 students per class for Sec, and 3 students per class for JC. This is hard cap. Allow up to 6
// students per class for Sec (make up), and 4 students per class for JC (make up). this is soft cap.
// during EOY exam periods, hard cap must be enforced" … "make it from september holidays to 1st
// week of october").
//
//   • WEEKLY limit (a student joining a class for good — enrol, add a weekly slot, switch):
//     the slot's `Normal Capacity` (Sec 4, JC 3 in the data).
//   • MAKEUP limit (one lesson on one date — makeup, reschedule, additional, trial):
//     the slot's `Makeup Capacity` (Sec 6, JC 4), lowered by the "Sec cap" toggle as before.
//   • SMALL-CLASS PERIOD (September holidays → 7 October): a makeup may only fill a class up to
//     its WEEKLY limit, so the room never goes past 4 (Sec) / 3 (JC) in exam weeks.
//   • Adrian's own "Book anyway" (force) still goes through on the admin screens; parents and
//     students never get it.
//
// The bot mirrors this file in its lib/class-size-rules.js — change both together.
// Pure: no storage, no clock (callers pass the date).

import { effectiveCapacity } from './capacity-override';

/** The numbers Adrian set, used when a slot has no stored capacity. */
export const WEEKLY_LIMIT_DEFAULT: Record<string, number> = { Secondary: 4, JC: 3, Adhoc: 4 };

/** The last day (MM-DD) of the small-class period — "1st week of October". */
export const SMALL_CLASS_UNTIL_MMDD = '10-07';

/**
 * Start of the September school holidays: the Saturday after the first Friday of September
 * (Term 3 ends on that Friday — 5 Sep 2026, 6 Sep 2025, 4 Sep 2027).
 */
export function septemberHolidayStart(year: number): string {
  const sep1 = new Date(Date.UTC(year, 8, 1));
  const firstFriday = 1 + ((5 - sep1.getUTCDay() + 7) % 7);
  return `${year}-09-${String(firstFriday + 1).padStart(2, '0')}`;
}

/** The small-class period of a given year, both ends inclusive (YYYY-MM-DD). */
export function smallClassPeriod(year: number): { from: string; until: string } {
  return { from: septemberHolidayStart(year), until: `${year}-${SMALL_CLASS_UNTIL_MMDD}` };
}

/** Is this lesson date (YYYY-MM-DD) inside the September-holidays-to-early-October period? */
export function inSmallClassPeriod(date: string | null | undefined): boolean {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(String(date ?? ''));
  if (!m) return false;
  const { from, until } = smallClassPeriod(Number(m[1]));
  return date! >= from && date! <= until;
}

/** How many students may be ENROLLED in a slot for good. */
export function weeklyLimit(storedNormal: number | null | undefined, level: string | null | undefined): number | null {
  if (typeof storedNormal === 'number' && storedNormal > 0) return storedNormal;
  return WEEKLY_LIMIT_DEFAULT[String(level ?? '').trim()] ?? null;
}

export type MakeupLimit = { limit: number; reason: 'normal' | 'sec-cap' | 'small-class-period' };

/**
 * How many students may be in a slot on ONE date, for a makeup / reschedule / additional / trial.
 * null = the slot has no Makeup Capacity (callers keep their "no capacity set" error).
 */
export function makeupLimit(a: {
  storedMakeup: number | null | undefined; storedNormal: number | null | undefined;
  level: string | null | undefined; date: string | null | undefined; secCap: number | null;
}): MakeupLimit | null {
  if (a.storedMakeup == null) return null;
  const stored = a.storedMakeup;
  let limit = effectiveCapacity(stored, a.level, a.secCap)!;
  let reason: MakeupLimit['reason'] = limit < stored ? 'sec-cap' : 'normal';
  if (inSmallClassPeriod(a.date)) {
    const weekly = weeklyLimit(a.storedNormal, a.level);
    if (weekly != null && weekly < limit) { limit = weekly; reason = 'small-class-period'; }
  }
  return { limit, reason };
}

/** The words for a 409 when a slot is full. */
export function fullMessage(kind: 'weekly' | 'makeup', limit: number, reason?: MakeupLimit['reason'], secCap?: number | null): string {
  if (kind === 'weekly') return `Class full — ${limit} students is the most for a weekly class`;
  if (reason === 'small-class-period') return `Class full — exam period (September holidays to 7 Oct): at most ${limit} per class`;
  if (reason === 'sec-cap') return `Slot full (Sec cap ${secCap} active)`;
  return 'Slot full';
}

/**
 * The same limit for a screen that already holds the slot's EFFECTIVE makeup capacity (the
 * schedule payload's `makeupCapacity`, Sec cap applied) and its Normal Capacity (`capacity`).
 */
export function makeupLimitOnDate(effectiveMakeup: number | null | undefined, storedNormal: number | null | undefined,
  level: string | null | undefined, date: string | null | undefined): number {
  const base = effectiveMakeup ?? storedNormal ?? 0;
  if (!inSmallClassPeriod(date)) return base;
  const weekly = weeklyLimit(storedNormal, level);
  return weekly != null && base > 0 ? Math.min(base, weekly) : base;
}
