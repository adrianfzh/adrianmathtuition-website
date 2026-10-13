// Pure helpers for the waiting list on /app/reschedule (13 Oct 2026, Adrian:
// "yes, the app too"). The law lives in the bot (lib/reschedule-queue.js); this
// file only words what the student reads. No I/O. Tests: waitlist-view.test.ts.

/** "11 h 40 min left — until 9:30pm Wed 14 Oct". Under an hour "45 min left";
 *  never below "1 min". `untilLabel` comes from the bot, already in Singapore time. */
export function countdownLine(expiresMs: number, nowMs: number, untilLabel: string | null): string {
  const mins = Math.max(1, Math.ceil(Math.max(0, expiresMs - nowMs) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  const left = h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  return `${left} left${untilLabel ? ` — until ${untilLabel}` : ''}`;
}

/** True once an offer's time is up (the page then reloads instead of offering Yes). */
export function offerEnded(expiresAt: string | null, nowMs: number): boolean {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(t) || t <= nowMs;
}

/** "You're #2 in line." */
export function placeLine(position: number | null): string {
  return position ? `You're #${position} in line.` : 'You’re in line.';
}

/** What the student reads after joining a line. */
export function joinedLine(position: number, already: boolean): string {
  return already ? `You're already #${position} on the waiting list.` : `You're #${position} on the waiting list.`;
}
