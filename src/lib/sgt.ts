/**
 * Singapore time (SGT = UTC+8, no daylight saving) — the ONE place the codebase
 * answers "what day / what time is it in Singapore".
 *
 * Vercel functions run in UTC and the project sets no TZ env var, so anything
 * built from `new Date().getDate()` (server-local components) is a day behind
 * between 00:00 and 08:00 SGT. Because SGT never shifts, adding a fixed 8 h to
 * an instant and reading the UTC components is exact — no Intl, no ICU data,
 * no locale surprises. Every helper takes an optional instant so tests pin a
 * moment instead of faking timers.
 *
 * Display formatting (weekday names, "2 Sep") keeps using
 * `toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })`; that is not
 * this module's job.
 */
export const SGT_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

type Instant = number | Date;
const ms = (at: Instant): number => (at instanceof Date ? at.getTime() : at);

/** YYYY-MM-DD of the Singapore calendar day containing `at` (default: now). */
export function sgtDateISO(at: Instant = Date.now()): string {
  return new Date(ms(at) + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's date in Singapore as YYYY-MM-DD. */
export function sgtTodayISO(now: Instant = Date.now()): string {
  return sgtDateISO(now);
}

/** The Singapore calendar day `n` days before today; negative `n` looks ahead. */
export function sgtDaysAgoISO(n: number, now: Instant = Date.now()): string {
  return sgtDateISO(ms(now) - n * DAY_MS);
}

/** Pure calendar arithmetic on a YYYY-MM-DD string — no timezone involved. */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The instant at which a Singapore day begins (16:00Z the evening before).
 * Pass a YYYY-MM-DD label, or an instant whose Singapore day you mean;
 * default: the start of today in Singapore — the lower bound for "how many
 * times today" caps and "since midnight" queries.
 */
export function sgtDayStart(at: Instant | string = Date.now()): Date {
  const iso = typeof at === 'string' ? at : sgtDateISO(at);
  return new Date(Date.parse(`${iso}T00:00:00Z`) - SGT_OFFSET_MS);
}

/** `sgtDayStart` as an ISO-8601 instant string, for SQL/PostgREST bounds. */
export function sgtDayStartISO(at?: Instant | string): string {
  return sgtDayStart(at).toISOString();
}

/** Wall-clock components in Singapore. `weekday`: 0 = Sun … 6 = Sat. */
export function sgtClock(at: Instant = Date.now()): {
  dateISO: string; year: number; month: number; day: number;
  weekday: number; hour: number; minute: number; minutesOfDay: number;
} {
  const d = new Date(ms(at) + SGT_OFFSET_MS);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  return {
    dateISO: d.toISOString().slice(0, 10),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

/** MM-DD in Singapore — the exam-season calendar windows compare on this. */
export function sgtMMDD(at: Instant = Date.now()): string {
  return sgtDateISO(at).slice(5);
}
