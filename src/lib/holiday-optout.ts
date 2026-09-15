// The one implementation of a holiday opt-out, shared by the two doors:
//   /api/admin/holiday-optout   — Adrian, per DATE, any month
//   /api/holiday-optout         — the parent's emailed button, per MONTH
// Extracted from the admin route 15 Sep 2026 when the parent's button was
// built. Two copies of this would be a real bug: a month a parent skipped
// would not be a month Adrian's page shows as skipped.
//
// Design (unchanged, from the admin route): an opt-out is MATERIALIZED as
// Cancelled lesson records, not stored as intent. Both generators dedup
// against existing records with NO status filter, so a pre-created Cancelled
// record durably blocks that date from ever being (re)generated.
//
//   skip an existing Scheduled lesson  → PATCH Status='Cancelled' + marker note
//   skip a date with no record yet     → CREATE the record as Cancelled + marker
//                                        ('(auto-created)' suffix)
//   restore an auto-created marker     → DELETE it (true no-op round-trip)
//   restore a patched lesson           → PATCH back to 'Scheduled', strip marker
//
// Completed/Absent/Rescheduled records and non-opt-out Cancelled records
// (public holidays, Revision Sprint) are LOCKED — never touched by either door.
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { NO_LESSON_DATES } from '@/lib/holidays';
import { billingMonthOf } from '@/lib/lesson-generation';
import { ARREARS_MONTHS } from '@/lib/year-end-billing';

export const OPTOUT_MARKER = 'Holiday opt-out';
export const AUTO_CREATED = '(auto-created)';
export const MONTHS_SHOWN = 3;          // upcoming optional months offered

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type DateEntry = {
  date: string;        // YYYY-MM-DD
  slotId: string;
  slotLabel: string;   // "Sun 9-11am"
  state: 'kept' | 'projected' | 'skipped' | 'locked';
  lessonId?: string;
  lockReason?: string;
};

export type MonthView = { label: string; year: number; month: number; dates: DateEntry[] };
export type OptoutChange = { date: string; slotId: string; skip: boolean };

// ————— pure —————

/** The arrears months still ahead in THIS year-end (never the current month —
 *  it is underway), at most MONTHS_SHOWN. Asked in September that is Nov and
 *  Dec; asked in December, nothing is left and next year's come up instead. A
 *  parent opening the October email must never be offered November 2027. */
export function upcomingOptionalMonths(now: Date): { year: number; month: number; label: string }[] {
  const y0 = now.getFullYear();
  const m0 = now.getMonth() + 2; // 1-based next month
  const inYear = (y: number, from: number) => ARREARS_MONTHS
    .filter((m) => m >= from)
    .slice(0, MONTHS_SHOWN)
    .map((m) => ({ year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` }));
  const thisYear = m0 <= 12 ? inYear(y0, m0) : [];
  return thisYear.length ? thisYear : inYear(y0 + 1, 1);
}

/** All YYYY-MM-DD dates of `weekday` inside (year, month), excluding NO_LESSON_DATES. */
export function weekdayDatesInMonth(year: number, month: number, weekday: number): string[] {
  const dates: string[] = [];
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCMonth() === month - 1) {
    const iso = d.toISOString().slice(0, 10);
    if (!NO_LESSON_DATES.includes(iso)) dates.push(iso);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return dates;
}

export function slotDayIndex(slotFields: Record<string, unknown>): number {
  const raw = String(slotFields['Day'] || '').replace(/^\d+\s+/, '').trim();
  return DAY_NAMES.indexOf(raw);
}

export function slotLabel(slotFields: Record<string, unknown>): string {
  const day = String(slotFields['Day'] || '').replace(/^\d+\s+/, '').trim().slice(0, 3);
  return `${day} ${String(slotFields['Time'] || '').trim()}`.trim();
}

/**
 * What a PARENT sees for one month: a single yes/no, plus the lessons that are
 * beyond their reach. 'locked' dates are excluded from the decision entirely —
 * a lesson already taught, or already cancelled for a public holiday, is not
 * something a parent is choosing about.
 */
export type MonthChoice = {
  year: number; month: number; label: string;
  lessonCount: number;      // dates the parent's choice actually governs
  skipped: boolean;         // every governed date is skipped
  partial: boolean;         // some but not all — Adrian skipped dates by hand
  lockedCount: number;
};

export function monthChoices(months: readonly MonthView[]): MonthChoice[] {
  return months.map((m) => {
    const governed = m.dates.filter((d) => d.state !== 'locked');
    const skipped = governed.filter((d) => d.state === 'skipped').length;
    return {
      year: m.year, month: m.month, label: m.label,
      lessonCount: governed.length,
      skipped: governed.length > 0 && skipped === governed.length,
      partial: skipped > 0 && skipped < governed.length,
      lockedCount: m.dates.length - governed.length,
    };
  });
}

/**
 * Turn a parent's month-level answer into the per-date changes the writer takes.
 * Locked dates are dropped, and a date already in the wanted state is dropped too
 * — so a parent re-confirming a month they already skipped writes nothing.
 */
export function changesForMonths(
  months: readonly MonthView[],
  wanted: readonly { year: number; month: number; skip: boolean }[],
): OptoutChange[] {
  const out: OptoutChange[] = [];
  for (const w of wanted) {
    const view = months.find((m) => m.year === w.year && m.month === w.month);
    if (!view) continue;
    for (const d of view.dates) {
      if (d.state === 'locked') continue;
      const alreadySkipped = d.state === 'skipped';
      if (alreadySkipped === w.skip) continue;
      out.push({ date: d.date, slotId: d.slotId, skip: w.skip });
    }
  }
  return out;
}

/** Guard shared by both doors: a change must be a real date in an optional month. */
export function validateChanges(changes: unknown): string | null {
  if (!Array.isArray(changes) || changes.length === 0) return 'non-empty changes[] required';
  for (const c of changes as OptoutChange[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c?.date || '') || !c?.slotId || typeof c?.skip !== 'boolean') {
      return `Bad change entry: ${JSON.stringify(c)}`;
    }
    if (!ARREARS_MONTHS.includes(Number(c.date.slice(5, 7)))) {
      return `${c.date} is not in a year-end optional month (${ARREARS_MONTHS.map((m) => MONTH_NAMES[m - 1].slice(0, 3)).join('/')})`;
    }
  }
  return null;
}

// ————— Airtable —————

export async function studentSlots(studentId: string) {
  const enr = await airtableRequestAll(
    'Enrollments',
    `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Slot`
  );
  const slotIds = [...new Set(
    (enr.records || [])
      .filter((r: any) => r.fields['Student']?.[0] === studentId)
      .map((r: any) => r.fields['Slot']?.[0])
      .filter(Boolean)
  )] as string[];
  const slots: { id: string; weekday: number; label: string }[] = [];
  for (const id of slotIds) {
    const s = await airtableRequest('Slots', `/${id}`);
    const weekday = slotDayIndex(s.fields);
    if (weekday >= 0) slots.push({ id, weekday, label: slotLabel(s.fields) });
  }
  return slots;
}

/** Student's Regular lessons within [start, endExclusive). */
export async function regularLessonsInRange(studentId: string, start: string, endExclusive: string) {
  const formula = `AND({Type}='Regular',{Date}>='${start}',{Date}<'${endExclusive}')`;
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Status&fields[]=Notes`
  );
  return (data.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
}

/** The read both doors do: the next three optional months, date by date. */
export async function loadOptoutMonths(studentId: string, now = new Date()): Promise<MonthView[] | null> {
  const months = upcomingOptionalMonths(now);
  const slots = await studentSlots(studentId);
  if (!slots.length) return null;   // no active enrollment — nothing to offer

  const rangeStart = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`;
  const last = months[months.length - 1];
  const rangeEnd = last.month === 12
    ? `${last.year + 1}-01-01`
    : `${last.year}-${String(last.month + 1).padStart(2, '0')}-01`;

  const lessons = await regularLessonsInRange(studentId, rangeStart, rangeEnd);
  const byKey = new Map<string, any>();
  for (const r of lessons) byKey.set(`${r.fields['Date']}|${r.fields['Slot']?.[0] || ''}`, r);

  return months.map(({ year, month, label }) => {
    const entries: DateEntry[] = [];
    for (const slot of slots) {
      for (const date of weekdayDatesInMonth(year, month, slot.weekday)) {
        const rec = byKey.get(`${date}|${slot.id}`);
        if (!rec) {
          entries.push({ date, slotId: slot.id, slotLabel: slot.label, state: 'projected' });
          continue;
        }
        const status = rec.fields['Status'] || '';
        const notes = String(rec.fields['Notes'] || '');
        if (status === 'Scheduled') {
          entries.push({ date, slotId: slot.id, slotLabel: slot.label, state: 'kept', lessonId: rec.id });
        } else if (status === 'Cancelled' && notes.includes(OPTOUT_MARKER)) {
          entries.push({ date, slotId: slot.id, slotLabel: slot.label, state: 'skipped', lessonId: rec.id });
        } else {
          entries.push({
            date, slotId: slot.id, slotLabel: slot.label, state: 'locked', lessonId: rec.id,
            lockReason: status === 'Cancelled' ? (notes || 'Cancelled') : status,
          });
        }
      }
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return { label, year, month, dates: entries };
  });
}

export type ApplyResult = {
  cancelled: number; created: number; restored: number; removed: number; skippedLocked: string[];
};

/** The write both doors do. Locked records are counted and left alone, never forced. */
export async function applyOptoutChanges(studentId: string, changes: readonly OptoutChange[]): Promise<ApplyResult> {
  const dates = changes.map((c) => c.date).sort();
  const dayAfterEnd = (() => {
    const d = new Date(dates[dates.length - 1] + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const lessons = await regularLessonsInRange(studentId, dates[0], dayAfterEnd);
  const byKey = new Map<string, any>();
  for (const r of lessons) byKey.set(`${r.fields['Date']}|${r.fields['Slot']?.[0] || ''}`, r);

  const result: ApplyResult = { cancelled: 0, created: 0, restored: 0, removed: 0, skippedLocked: [] };

  for (const c of changes) {
    const rec = byKey.get(`${c.date}|${c.slotId}`);
    const monthLabel = billingMonthOf(c.date);
    const marker = `${OPTOUT_MARKER} — ${monthLabel}`;

    if (c.skip) {
      if (!rec) {
        await airtableRequest('Lessons', '', {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              Type: 'Regular', Student: [studentId], Slot: [c.slotId], Date: c.date,
              Status: 'Cancelled', Notes: `${marker} ${AUTO_CREATED}`,
              'Billing Month': monthLabel,
            },
          }),
        });
        result.created++;
      } else if (rec.fields['Status'] === 'Scheduled') {
        const existing = String(rec.fields['Notes'] || '').trim();
        await airtableRequest('Lessons', `/${rec.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { Status: 'Cancelled', Notes: existing ? `${existing} | ${marker}` : marker } }),
        });
        result.cancelled++;
      } else {
        result.skippedLocked.push(`${c.date} (${rec.fields['Status']})`);
      }
    } else {
      if (!rec) continue; // nothing to restore — already clean
      const notes = String(rec.fields['Notes'] || '');
      if (rec.fields['Status'] !== 'Cancelled' || !notes.includes(OPTOUT_MARKER)) {
        result.skippedLocked.push(`${c.date} (${rec.fields['Status']})`);
        continue;
      }
      if (notes.includes(AUTO_CREATED)) {
        await airtableRequest('Lessons', `/${rec.id}`, { method: 'DELETE' });
        result.removed++;
      } else {
        const cleaned = notes
          .replace(new RegExp(`\\s*\\|\\s*${OPTOUT_MARKER}[^|]*`), '')
          .replace(new RegExp(`^${OPTOUT_MARKER}[^|]*\\|?\\s*`), '')
          .trim();
        await airtableRequest('Lessons', `/${rec.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { Status: 'Scheduled', Notes: cleaned } }),
        });
        result.restored++;
      }
    }
  }

  return result;
}
