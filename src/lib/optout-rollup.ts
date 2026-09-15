// Reading the holiday opt-outs back out of Airtable — who is skipping what.
//
// An opt-out is not stored as a flag anywhere. applyOptoutChanges materialises
// it as Cancelled Lessons rows whose Notes carry `Holiday opt-out — <Month>`,
// so "who has opted out" is a question about lesson rows, and this module is
// the only place that asks it. lib/optout-notice.ts turns the answer into the
// two Telegram messages; nothing here writes.
//
// Two callers, two budgets:
//   • roster(fromISO) — the parent-facing POST, so ONE list query and one name
//     lookup, no rates, no denominator. A press must not wait on arithmetic.
//   • buildRollup(now) — the 7:30am cron, which may take its time and fetches
//     rates and the denominator too.

import { airtableRequestAll } from './airtable';
import { sgtTodayISO } from './sgt';
import { OPTOUT_MARKER } from './holiday-optout';
import { wantsHolidayNote, HOLIDAY_MONTHS } from './holiday-message';
import type { RollupStudent, RosterEntry } from './optout-notice';
import { shortMonth } from './optout-notice';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ————— pure —————

/** "2026-11-08" → "November 2026". The label applyOptoutChanges writes into
 *  Notes says the same thing, but a date cannot drift and a note can. */
export function monthLabelFor(iso: string): string {
  const m = /^(\d{4})-(\d{2})-/.exec(String(iso || ''));
  if (!m) return '';
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${MONTHS[mo - 1]} ${m[1]}` : '';
}

/** The 1st of the current Singapore month — the roll-up's floor. A month being
 *  billed right now still counts; one already invoiced and gone does not. */
export function monthFloorISO(now: Date | number = Date.now()): string {
  return `${sgtTodayISO(now instanceof Date ? now.getTime() : now).slice(0, 7)}-01`;
}

export type SkipRow = { studentId: string; slotId: string; date: string; label: string };

/** The opt-out rows out of a Lessons page, ignoring anything malformed. */
export function skipRowsFrom(records: readonly { fields: Record<string, unknown> }[]): SkipRow[] {
  const out: SkipRow[] = [];
  for (const r of records) {
    const f = r.fields || {};
    if (!String(f['Notes'] || '').includes(OPTOUT_MARKER)) continue;
    const studentId = (f['Student'] as string[] | undefined)?.[0];
    const date = String(f['Date'] || '');
    const label = monthLabelFor(date);
    if (!studentId || !label) continue;
    out.push({ studentId, slotId: (f['Slot'] as string[] | undefined)?.[0] || '', date, label });
  }
  return out;
}

/** studentId → month label → how many lessons, months in calendar order. */
export function groupByStudent(rows: readonly SkipRow[]): Map<string, { label: string; lessons: number; slotIds: string[] }[]> {
  const byStudent = new Map<string, Map<string, { lessons: number; slotIds: string[] }>>();
  for (const r of rows) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, new Map());
    const months = byStudent.get(r.studentId)!;
    if (!months.has(r.label)) months.set(r.label, { lessons: 0, slotIds: [] });
    const entry = months.get(r.label)!;
    entry.lessons += 1;
    entry.slotIds.push(r.slotId);
  }
  const out = new Map<string, { label: string; lessons: number; slotIds: string[] }[]>();
  for (const [studentId, months] of byStudent) {
    out.set(studentId, sortLabels([...months.keys()]).map((label) => ({ label, ...months.get(label)! })));
  }
  return out;
}

/** Month labels in calendar order — "November 2026" before "January 2027". */
export function sortLabels(labels: readonly string[]): string[] {
  const key = (l: string) => {
    const m = /^([A-Z][a-z]+) (\d{4})$/.exec(l);
    return m ? Number(m[2]) * 100 + (MONTHS.indexOf(m[1]) + 1) : 0;
  };
  return [...labels].sort((a, b) => key(a) - key(b));
}

/** The money for one student's skipped lessons, or null when any of those
 *  lessons sits in a slot whose rate we could not read — a student with two
 *  slots at two rates must not be averaged into a figure Adrian would quote. */
export function rateFor(months: readonly { slotIds: string[] }[], rates: ReadonlyMap<string, number>): number | null {
  const seen = new Set<number>();
  for (const m of months) {
    for (const slotId of m.slotIds) {
      const rate = rates.get(slotId);
      if (!rate) return null;
      seen.add(rate);
    }
  }
  return seen.size === 1 ? [...seen][0] : null;
}

// ————— Airtable —————

/** Every opt-out lesson from `fromISO` onward. One list query. */
export async function loadSkipRows(fromISO: string): Promise<SkipRow[]> {
  // FIND inside filterByFormula keeps this to the ~dozen rows that are actually
  // opt-outs rather than pulling four months of every student's lessons.
  const formula = `AND({Date}>='${fromISO}',FIND('${OPTOUT_MARKER}',{Notes})>0)`;
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Notes`,
  );
  return skipRowsFrom(data.records || []);
}

export type StudentFacts = { name: string; level: string; ip: boolean };

/** Names and levels for a handful of student ids. */
export async function loadStudentFacts(ids: readonly string[]): Promise<Map<string, StudentFacts>> {
  const out = new Map<string, StudentFacts>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return out;
  const formula = `OR(${unique.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
  const data = await airtableRequestAll(
    'Students',
    `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student Name&fields[]=Level&fields[]=Subject Level&fields[]=Subjects`,
  );
  for (const r of data.records || []) out.set(r.id, factsFrom(r.fields));
  return out;
}

function factsFrom(f: Record<string, unknown>): StudentFacts {
  const subjects = (f['Subjects'] as string[] | undefined) || [];
  return {
    name: String(f['Student Name'] || '').trim() || 'A student',
    level: String(f['Level'] || '').trim(),
    ip: String(f['Subject Level'] || '').trim() === 'IP' || subjects.includes('IP Math'),
  };
}

/** slotId → rate per lesson, over the active enrollments. */
export async function loadSlotRates(): Promise<Map<string, number>> {
  const data = await airtableRequestAll(
    'Enrollments',
    `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Slot&fields[]=Rate Per Lesson`,
  );
  const out = new Map<string, number>();
  for (const r of data.records || []) {
    const slotId = (r.fields['Slot'] as string[] | undefined)?.[0];
    const rate = Number(r.fields['Rate Per Lesson']);
    if (slotId && Number.isFinite(rate) && rate > 0) out.set(slotId, rate);
  }
  return out;
}

/**
 * How many families were offered the button at all — the roll-up's denominator.
 *
 * Reproduced from wantsHolidayNote rather than re-derived by eye: on the first
 * pass this was counted as Sec 1–3 only, which quietly left out Beryl Chen
 * Guoer (Sec 4 IP) — who had pressed the button. An eligibility rule that
 * already ships has exactly one correct implementation, and it is that one.
 */
export async function loadOfferedCount(): Promise<number | null> {
  try {
    const [students, enrollments] = await Promise.all([
      airtableRequestAll(
        'Students',
        `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Level&fields[]=Subject Level&fields[]=Subjects`,
      ),
      airtableRequestAll(
        'Enrollments',
        `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student`,
      ),
    ]);
    const enrolled = new Set<string>();
    for (const r of enrollments.records || []) {
      const id = (r.fields['Student'] as string[] | undefined)?.[0];
      if (id) enrolled.add(id);
    }
    const month = HOLIDAY_MONTHS[HOLIDAY_MONTHS.length - 1];
    let n = 0;
    for (const r of students.records || []) {
      if (!enrolled.has(r.id)) continue;
      const f = r.fields;
      if (wantsHolidayNote({
        level: String(f['Level'] || ''),
        subjectLevel: String(f['Subject Level'] || ''),
        subjects: (f['Subjects'] as string[] | undefined) || [],
      }, month)) n += 1;
    }
    return n || null;
  } catch {
    // A missing denominator costs the message one clause; a thrown one costs
    // the whole notice. The sentence is written to work without it.
    return null;
  }
}

/** "Beryl Chen Guoer (Nov, Dec) · Jeanette Tan (Dec)" — the press notice's foot. */
export async function roster(now: Date | number = Date.now()): Promise<RosterEntry[]> {
  const rows = await loadSkipRows(monthFloorISO(now));
  const grouped = groupByStudent(rows);
  const facts = await loadStudentFacts([...grouped.keys()]);
  return [...grouped.entries()]
    .map(([studentId, months]) => ({
      name: facts.get(studentId)?.name || 'A student',
      months: months.map((m) => shortMonth(m.label)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RollupData {
  students: RollupStudent[];
  /** The months that actually have skips, calendar order. */
  window: string[];
  offered: number | null;
}

/** Everything the 1st-of-the-month message needs. */
export async function buildRollup(now: Date | number = Date.now()): Promise<RollupData> {
  const rows = await loadSkipRows(monthFloorISO(now));
  const grouped = groupByStudent(rows);
  const [facts, rates, offered] = await Promise.all([
    loadStudentFacts([...grouped.keys()]),
    loadSlotRates().catch(() => new Map<string, number>()),
    loadOfferedCount(),
  ]);

  const students: RollupStudent[] = [...grouped.entries()]
    .map(([studentId, months]) => {
      const f = facts.get(studentId);
      return {
        name: f?.name || 'A student',
        level: f?.level || null,
        ip: f?.ip || false,
        ratePerLesson: rateFor(months, rates),
        months: months.map((m) => ({ label: m.label, lessons: m.lessons })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { students, window: sortLabels([...new Set(rows.map((r) => r.label))]), offered };
}

/** One student's rate per lesson, or null when their active slots disagree —
 *  same refusal as rateFor, for the single-student press notice. */
export async function studentRate(studentId: string): Promise<number | null> {
  try {
    const data = await airtableRequestAll(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Rate Per Lesson`,
    );
    // Linked-record fields can't be filtered in the formula (ARRAYJOIN returns
    // display names, not ids) — match in JS, the house pattern.
    const rates = new Set<number>();
    for (const r of data.records || []) {
      if ((r.fields['Student'] as string[] | undefined)?.[0] !== studentId) continue;
      const rate = Number(r.fields['Rate Per Lesson']);
      if (Number.isFinite(rate) && rate > 0) rates.add(rate);
    }
    return rates.size === 1 ? [...rates][0] : null;
  } catch {
    return null;
  }
}
