// ⏰ Study settings on /app/settings (5 Nov 2026, Adrian: "do it" — the practice reminder and hint
// first shown on the app's Settings page, the same saved settings as Telegram's /settings card).
// The bot owns both: table `practice_reminders` (one row per Telegram chat; the bot's 5-minute sender
// reads it, bot handlers/settings.js) and `answer_prefs.hint_first` (bot lib/hint-first.js). This page
// only reads and writes those rows, so a change here shows in Telegram and the other way round.
// The rules copy the bot's (bot lib/settings-words.js): quiet hours 22:30–07:00 SGT, days 0=Sun…6=Sat.
// Pure; tested.

export const QUIET_FROM = 22 * 60 + 30;
export const QUIET_TO = 7 * 60;
export const DEFAULT_TIME = '20:00';

export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
export function isQuiet(hhmm: string): boolean {
  const m = minutesOf(hhmm);
  return m !== null && (m >= QUIET_FROM || m < QUIET_TO);
}

/** Every half hour from 7 am to 10 pm — the choices in the time box. */
export const TIME_OPTIONS: string[] = Array.from({ length: 31 }, (_, i) => {
  const m = QUIET_TO + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

export function formatTime(hhmm: string): string {
  const m = minutesOf(hhmm);
  if (m === null) return hhmm;
  const h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? 'pm' : 'am', h12 = h % 12 || 12;
  return mi ? `${h12}:${String(mi).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday-first, the way a week reads. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function formatDays(days: number[]): string {
  const key = [...new Set(days)].sort((a, b) => a - b).join(',');
  if (key === '0,1,2,3,4,5,6') return 'every day';
  if (key === '1,2,3,4,5') return 'Monday–Friday';
  if (key === '0,6') return 'Saturday and Sunday';
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(', ');
}

export interface ReminderSetting { enabled: boolean; time: string; days: number[] }

/** A reminder sent by the page → clean, or an error in plain words. */
export function readReminder(v: unknown): { ok: ReminderSetting } | { error: string } {
  if (!v || typeof v !== 'object') return { error: 'reminder missing' };
  const r = v as Record<string, unknown>;
  if (typeof r.enabled !== 'boolean') return { error: 'enabled must be true or false' };
  const time = typeof r.time === 'string' ? r.time : '';
  if (minutesOf(time) === null) return { error: 'Pick a time.' };
  if (r.enabled && isQuiet(time)) return { error: 'No reminders between 10:30 pm and 7 am — pick an earlier time.' };
  const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b) : [];
  if (r.enabled && !days.length) return { error: 'Pick at least one day.' };
  return { ok: { enabled: r.enabled, time, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] } };
}

/** SGT date + minutes now; a time already past today starts tomorrow (the bot does the same). */
export function lastSentForNewTime(time: string, nowMs = Date.now()): string | null {
  const d = new Date(nowMs + 8 * 3600_000);
  const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const t = minutesOf(time) ?? 0;
  return nowMin >= t ? d.toISOString().slice(0, 10) : null;
}
