// Compulsory Practice Again sheets — the reminder rule (Adrian, 8 Sep 2026:
// "i can generate for them by clicking on desk, and vetting it and asking them
// to do -> that is compulsory, so we should build a mechanism that reminds
// them it is not done").
//
// A sheet Adrian released himself carries portal_assignments.required_at. While
// it sits 'assigned' (not handed in), the student is nudged on day 3, then
// weekly, four times at most — Telegram (portal chat, else the Airtable
// Telegram ID) + web push. Pure: the cron (/api/cron/practice-again-reminders)
// does the I/O and stamps reminded_at / reminder_count.

export const FIRST_NUDGE_AFTER_DAYS = 3;
export const NUDGE_EVERY_DAYS = 7;
export const MAX_NUDGES = 4;
export const PER_RUN_CAP = 5;

export interface RequiredSheetRow {
  id: string;
  airtable_student_id: string;
  title: string;
  source_run_id: string | null;
  status: string;
  required_at: string | null;
  reminded_at: string | null;
  reminder_count: number | null;
}

const DAY = 86400_000;

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(iso)) / DAY);
}

/** Day 3 after it became compulsory, then every 7 days after the last nudge, MAX_NUDGES at most; only while still to do. */
export function nudgeDue(row: RequiredSheetRow, now: Date): boolean {
  if (row.status !== 'assigned' || !row.required_at) return false;
  if ((row.reminder_count ?? 0) >= MAX_NUDGES) return false;
  if (daysSince(row.required_at, now) < FIRST_NUDGE_AFTER_DAYS) return false;
  if (row.reminded_at && daysSince(row.reminded_at, now) < NUDGE_EVERY_DAYS) return false;
  return true;
}

/** The rows to nudge this run — oldest obligation first, capped so one bad morning never floods. */
export function pickDue(rows: RequiredSheetRow[], now: Date, cap: number = PER_RUN_CAP): RequiredSheetRow[] {
  return rows
    .filter(r => nudgeDue(r, now))
    .sort((a, b) => Date.parse(a.required_at!) - Date.parse(b.required_at!))
    .slice(0, cap);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sheetPath(row: Pick<RequiredSheetRow, 'source_run_id'>): string {
  return row.source_run_id ? `/app/marking/${row.source_run_id}` : '/app/marking';
}

/** Telegram HTML for the student. Names the sheet, says who asked, says how long, links to the Hand in button. */
export function nudgeText(row: RequiredSheetRow, now: Date, site: string): string {
  const days = row.required_at ? daysSince(row.required_at, now) : 0;
  return `📘 Your Practice Again sheet is still waiting: <b>${esc(row.title)}</b>. Adrian asked you to do this one${days > 0 ? ` — it has been ${days} day${days === 1 ? '' : 's'}` : ''}. Work through the examples, then hand the practice in.\n\nOpen it: ${site}${sheetPath(row)}`;
}

export function nudgePush(row: RequiredSheetRow): { title: string; body: string; url: string } {
  return { title: '📘 Practice Again — still to do', body: `${row.title} — Adrian asked you to do this one`, url: sheetPath(row) };
}

export interface NudgeSent { who: string; title: string; nth: number; channel: 'telegram' | 'push' | 'both' | 'none' }

/** Adrian's one summary line — null when nobody was nudged. */
export function nudgeSummaryLine(sent: NudgeSent[]): string | null {
  if (!sent.length) return null;
  const parts = sent.map(s => `${s.who} (${s.title.replace(/^Practice Again — /, '')}, nudge ${s.nth}${s.channel === 'none' ? ', NO CHANNEL' : ''})`);
  return `📘 Practice Again reminders sent: ${parts.join(' · ')}`;
}
