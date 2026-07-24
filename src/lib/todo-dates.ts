// Pure due-date helpers for the personal to-do list (/admin/my-todos).
// All inputs are date-only ISO strings (YYYY-MM-DD), which compare
// lexicographically — no timezone involved.

export type DueBucket = 'none' | 'overdue' | 'today' | 'tomorrow' | 'upcoming';

function parseISO(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

/** Whole days from fromISO to toISO (positive when toISO is later). */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = parseISO(fromISO);
  const [ty, tm, td] = parseISO(toISO);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5);
}

export function classifyDue(dueDate: string | null | undefined, todayISO: string): DueBucket {
  if (!dueDate) return 'none';
  if (dueDate < todayISO) return 'overdue';
  if (dueDate === todayISO) return 'today';
  return daysBetweenISO(todayISO, dueDate) === 1 ? 'tomorrow' : 'upcoming';
}

/** Short human label for a due date: "3d overdue" / "Today" / "Tomorrow" / "Fri" / "31 Jul" / "3 Jan 2027". */
export function dueLabel(dueDate: string, todayISO: string): string {
  const bucket = classifyDue(dueDate, todayISO);
  const diff = daysBetweenISO(todayISO, dueDate);
  if (bucket === 'overdue') return diff === -1 ? 'Yesterday' : `${-diff}d overdue`;
  if (bucket === 'today') return 'Today';
  if (bucket === 'tomorrow') return 'Tomorrow';
  const [y, m, d] = parseISO(dueDate);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (diff <= 6) {
    return date.toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'UTC' });
  }
  const sameYear = y === parseISO(todayISO)[0];
  return date.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}
