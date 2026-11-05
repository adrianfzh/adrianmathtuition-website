// The two number tiles at the top of /admin (9 Oct 2026, Adrian: "just admin dashboard
// put papers handed up (then the number), practice questions done (then a number)").
// Pure: rows in, today's count and a seven-day strip out. The reading is in
// lib/glance-store.ts; the tiles are built in lib/glance.ts.
//
// PAPERS HANDED IN — one per paper a real student handed in, on the Singapore day
// the row was created (paper_marking_runs.created_at). Left out:
//   · a row with no student (bench scripts, test uploads, a paper nobody is tagged on),
//   · the preview student,
//   · a row named "BENCH · …" (the bench names its scripts so),
//   · a row that REPLACES an earlier one — a re-mark or the same paper sent again
//     (the earlier row carries `superseded_by` = this row's id). The paper was counted
//     the day it first came in. A re-mark done in place keeps its row, so it never
//     counts twice either.
// A paper the tutor uploads for a named student counts: the student handed it in on paper.
//
// PRACTICE QUESTIONS DONE — one per question a real student answered, on the Singapore
// day of the answer. Left out: the preview student, the admin's own tries (identity
// 'admin'), and a row with nobody on it.
//
// BOT QUESTIONS ASKED (4 Nov 2026, Adrian: "I would also like the number of bot questions
// asked … and show the breakdown of subjects as well") — one per answer the bot gave, on
// the Singapore day it was asked: the Airtable `Questions` log, which every channel writes
// (Telegram, the website's chat, the app's chat). Left out: the admin's own chat (the
// Telegram alert chat he tests from) and the preview student.
//
// SUBJECTS — every count also carries how many of the window's rows were which subject
// (`bySubject`), so each tile can show one short line: "E Math 6 · A Math 4 · Chem 3".

import { sgtDateISO, sgtDaysAgoISO } from './sgt';
import { SCIENCE_PREVIEW_IDENTITIES } from './portal-beta';
import { subjectLabel } from './subject-labels';

export { subjectLabel, subjectLine } from './subject-labels';

/** The preview student (portal-teste@example.com) — never a real hand-in or answer. */
export const PREVIEW_STUDENT_IDS: readonly string[] = SCIENCE_PREVIEW_IDENTITIES;
/** Who is not a student: the preview student and the admin's own tries. */
const NOT_A_STUDENT = new Set<string>([...PREVIEW_STUDENT_IDS, 'admin']);

export interface DayCount {
  /** The count for today (Singapore). */
  today: number;
  /** One number per Singapore day, oldest first, today last. */
  perDay: number[];
  /** The sum of `perDay`. */
  total: number;
  /** How many different students are behind today's count. */
  studentsToday: number;
  /** The window's rows per subject label (lib/dash-counts subjectLabel), most first. */
  bySubject: Record<string, number>;
  /** The same split for EACH day, in `perDay` order — what a tap on one bar shows (5 Nov 2026). */
  perDaySubjects: Record<string, number>[];
}

export interface HandinRow {
  id: string;
  created_at: string;
  student_id: string | null;
  paper_name?: string | null;
  /** `paper_subject` on the run ("E Math", "Chemistry", …), when known. */
  subject?: string | null;
}

export interface PracticeRow {
  /** When the question was answered. */
  at: string;
  /** The student's id (Airtable record id / portal identity), or null. */
  who: string | null;
  /** The subject label (see subjectLabel), when known. */
  subject?: string | null;
}

export interface AskRow {
  /** When the bot was asked. */
  at: string;
  /** The chat the question came from (a Telegram chat id or a web chat key). */
  chatId: string | null;
  /** The linked student, when the bot knew one. */
  who?: string | null;
  /** The Questions log's Subject: Math · Chemistry · Physics · Biology. */
  subject?: string | null;
}

/** True for someone we count: a student id that is not the preview student or the admin. */
export function isRealStudent(who: string | null | undefined): who is string {
  return !!who && !NOT_A_STUDENT.has(who);
}

/** True when this row is a paper a real student handed in for the first time. */
export function isHandin(row: HandinRow, replacementIds: ReadonlySet<string>): boolean {
  if (!isRealStudent(row.student_id)) return false;
  if (/^\s*bench\b/i.test(row.paper_name ?? '')) return false;
  if (replacementIds.has(row.id)) return false;
  return true;
}

/** Bucket (instant, student, subject) rows into the last `days` Singapore days, today last. */
function bucket(items: { at: string; who: string; subject?: string | null }[], days: number, now: number): DayCount {
  const labels = Array.from({ length: days }, (_, i) => sgtDaysAgoISO(days - 1 - i, now));
  const index = new Map(labels.map((d, i) => [d, i]));
  const perDay = new Array<number>(days).fill(0);
  const perDaySubjects = Array.from({ length: days }, () => ({} as Record<string, number>));
  const todayWho = new Set<string>();
  const bySubject: Record<string, number> = {};
  for (const it of items) {
    const t = Date.parse(it.at);
    if (!Number.isFinite(t)) continue;
    const i = index.get(sgtDateISO(t));
    if (i == null) continue;
    perDay[i] += 1;
    if (i === days - 1) todayWho.add(it.who);
    const label = subjectLabel(it.subject);
    bySubject[label] = (bySubject[label] ?? 0) + 1;
    perDaySubjects[i][label] = (perDaySubjects[i][label] ?? 0) + 1;
  }
  return { today: perDay[days - 1] ?? 0, perDay, total: perDay.reduce((a, b) => a + b, 0), studentsToday: todayWho.size, bySubject, perDaySubjects };
}

/**
 * Papers handed in per Singapore day. `replacementIds` = every id some earlier row
 * points at with `superseded_by` (those rows re-mark or repeat a paper already counted).
 */
export function countHandins(rows: HandinRow[], replacementIds: Iterable<string>, days: number, now: number): DayCount {
  const repl = replacementIds instanceof Set ? (replacementIds as Set<string>) : new Set(replacementIds);
  const seen = new Set<string>();
  const items: { at: string; who: string; subject?: string | null }[] = [];
  for (const r of rows) {
    if (seen.has(r.id) || !isHandin(r, repl)) continue;
    seen.add(r.id);
    items.push({ at: r.created_at, who: r.student_id as string, subject: r.subject });
  }
  return bucket(items, days, now);
}

/** Practice questions answered per Singapore day, real students only. */
export function countPractice(rows: PracticeRow[], days: number, now: number): DayCount {
  return bucket(rows.filter((r) => isRealStudent(r.who)).map((r) => ({ at: r.at, who: r.who as string, subject: r.subject })), days, now);
}

/**
 * Questions the bot answered per Singapore day. `excludeChats` = the admin's own chats
 * (his Telegram alert chat); a row linked to the preview student is left out too. A web
 * visitor with no student still counts — the question was asked. `studentsToday` counts
 * distinct chats, since most web chats carry no student.
 */
export function countBotAsks(rows: AskRow[], excludeChats: Iterable<string>, days: number, now: number): DayCount {
  const skip = new Set([...excludeChats].map((c) => String(c).trim()).filter(Boolean));
  const items = rows
    .filter((r) => !(r.chatId && skip.has(String(r.chatId).trim())) && !(r.who && PREVIEW_STUDENT_IDS.includes(r.who)))
    .map((r) => ({ at: r.at, who: r.chatId || r.who || '?', subject: r.subject }));
  return bucket(items, days, now);
}
