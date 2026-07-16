// Pure billing/date math — the single source of truth for "which lesson dates
// fall in a period". String/UTC-based on purpose: no Date time-of-day or server
// timezone can skew results (the bot's registration invoice dropped the last
// Friday of July 2026 because a midnight month-end was compared against a
// date carrying the registration's time-of-day — this module makes that class
// of bug impossible). Covered by billing-math.test.ts; pre-push runs the suite.

/** YYYY-MM-DD for a UTC date. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD as UTC midnight (no timezone drift). */
function parse(isoStr: string): Date {
  return new Date(isoStr + 'T00:00:00Z');
}

/** Last day of the month containing `isoStr`, as YYYY-MM-DD. */
export function lastDayOfMonthISO(isoStr: string): string {
  const d = parse(isoStr);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** First day of the month AFTER the one containing `isoStr`, as YYYY-MM-DD. */
export function firstOfNextMonthISO(isoStr: string): string {
  const d = parse(isoStr);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

/**
 * Every date of `weekday` (0=Sunday…6=Saturday) from startISO to endISO,
 * BOTH INCLUSIVE, excluding any dates in `excluded` (e.g. NO_LESSON_DATES).
 * A lesson on the period's last day is included — regression: Kieran Lai,
 * Jul 2026 (31 Jul Friday must count).
 */
export function weekdayLessonDates(
  startISO: string,
  endISO: string,
  weekday: number,
  excluded: readonly string[] = [],
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO) || !/^\d{4}-\d{2}-\d{2}$/.test(endISO)) return [];
  if (weekday < 0 || weekday > 6) return [];
  const out: string[] = [];
  const cur = parse(startISO);
  while (cur.getUTCDay() !== weekday) cur.setUTCDate(cur.getUTCDate() + 1);
  const end = endISO; // string compare works for ISO dates
  for (let s = iso(cur); s <= end; cur.setUTCDate(cur.getUTCDate() + 7), s = iso(cur)) {
    if (!excluded.includes(s)) out.push(s);
  }
  return out;
}

/**
 * First-invoice lesson dates for a signup: the start month (from startISO to
 * month end) plus — when the monthly batch has already run for the next month —
 * the whole next month. Mirrors the signup flow's combined-invoice logic.
 */
export function firstInvoiceLessonDates(
  startISO: string,
  weekday: number,
  includeNextMonth: boolean,
  excluded: readonly string[] = [],
): { startMonth: string[]; nextMonth: string[] } {
  const startMonth = weekdayLessonDates(startISO, lastDayOfMonthISO(startISO), weekday, excluded);
  const nextMonth = includeNextMonth
    ? weekdayLessonDates(firstOfNextMonthISO(startISO), lastDayOfMonthISO(firstOfNextMonthISO(startISO)), weekday, excluded)
    : [];
  return { startMonth, nextMonth };
}
