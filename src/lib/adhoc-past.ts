// ⚡ Which ad-hoc sessions are over (8 Oct 2026, Adrian: "hide past ad-hoc").
//
// The ⚡ panel on /admin/schedule listed every ad-hoc slot row ever made; by October it
// opened on a screen and a half of sessions from 19–20 August. A session whose dates
// have ALL passed is tucked behind "Show past". Pure.
//   • dated, every date before today (Singapore) → past
//   • dated, any date today or later             → upcoming, soonest first
//   • no dates at all                            → NOT past: an undated slot shows every
//     week until it is removed, which is the one row he most needs to see.

export interface AdhocDated { dates: string[] }

export function adhocIsPast(dates: string[], todayIso: string): boolean {
  return dates.length > 0 && dates.every(d => d < todayIso);
}

/** The next date a session runs (today counts), or null. */
function nextDate(dates: string[], todayIso: string): string | null {
  return dates.filter(d => d >= todayIso).sort()[0] ?? null;
}

/** Upcoming first (undated at the very top, then soonest), past last (most recent first). */
export function splitAdhoc<T extends AdhocDated>(sessions: T[], todayIso: string): { upcoming: T[]; past: T[] } {
  const upcoming = sessions.filter(s => !adhocIsPast(s.dates, todayIso));
  const past = sessions.filter(s => adhocIsPast(s.dates, todayIso));
  upcoming.sort((a, b) => (nextDate(a.dates, todayIso) ?? '').localeCompare(nextDate(b.dates, todayIso) ?? ''));
  past.sort((a, b) => ([...b.dates].sort().pop() ?? '').localeCompare([...a.dates].sort().pop() ?? ''));
  return { upcoming, past };
}
