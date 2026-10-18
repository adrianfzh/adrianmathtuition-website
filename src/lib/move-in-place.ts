// ✏️ Change a moved-in lesson's time in place (18 Oct 2026, Adrian: "i am rescheduling a
// reschedule > able to have the option of changing the rescheduled lesson timing > instead of
// leaving a trial of rescheduled lessons?" … "but have it as another option instead").
//
// A was rescheduled to B (B = Type Rescheduled or Makeup, Status Scheduled, A's
// `Rescheduled Lesson ID` → B). Moving B again the normal way marks B Rescheduled and creates
// C: a trail A → B → C. "Change this lesson's time" instead edits B's Date + Slot, so A's link
// still points at the one live lesson and nothing is crossed out. B keeps its Type, Billing
// Month and Is Makeup, so billing and capacity counting are unchanged. The route still runs the
// capacity, away-date and double-booking checks on the new time. Pure: the rules + the note.

/** Types that are a lesson moved IN from somewhere else. */
const MOVED_IN_TYPES = new Set(['Rescheduled', 'Makeup']);

/** May this lesson have its time changed in place? Only a still-booked moved-in lesson. */
export function canMoveInPlace(l: { type?: string | null; status?: string | null }): boolean {
  return MOVED_IN_TYPES.has(String(l.type ?? '')) && String(l.status ?? 'Scheduled') === 'Scheduled';
}

/** "Sun 18 Oct" from YYYY-MM-DD (UTC parts — a calendar date, no clock). */
export function shortDayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mon}`;
}

/**
 * The lesson's Notes after the move: the old text kept (it still says where the lesson first
 * came from), then one short history line. "was Sun 18 Oct 11am-1pm, moved to Tue 20 Oct 5-7pm".
 */
export function moveHistoryNote(existing: string | null | undefined, from: { date: string; time: string }, to: { date: string; time: string }): string {
  const line = `was ${shortDayDate(from.date)}${from.time ? ` ${from.time}` : ''}, moved to ${shortDayDate(to.date)}${to.time ? ` ${to.time}` : ''}`;
  const old = String(existing ?? '').trim();
  return old ? `${old} | ${line}` : line;
}
