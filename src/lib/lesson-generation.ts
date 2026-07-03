// Shared recurring-lesson generator used by the slot-switch and add-weekly-slot
// flows. Creates weekly Regular lessons for a student in a slot, deduping
// against existing records and marking public holidays as Cancelled.
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { NO_LESSON_DATES } from '@/lib/holidays';

// Re-exported so existing importers (slot-switch, add-weekly-slot) keep working.
// Canonical list lives in @/lib/holidays.
export { NO_LESSON_DATES };

// Default horizon for one-shot generation (matches signup's 9 weeks). The bot's
// weekly cron keeps extending lessons beyond this for all active enrollments.
export const DEFAULT_WEEKS_AHEAD = 9;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; }
function isoDate(d: Date): string { return d.toISOString().split('T')[0]; }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "June 2026" from a YYYY-MM-DD string — the month a freshly-generated lesson belongs to.
export function billingMonthOf(dateStr: string): string {
  const p = (dateStr || '').split('-');
  return p.length === 3 ? `${MONTH_NAMES[+p[1] - 1]} ${p[0]}` : '';
}

export interface GenerateOpts {
  studentId: string;
  slotId: string;
  startDate: string;            // ISO (YYYY-MM-DD), inclusive
  weeksAhead?: number;          // default DEFAULT_WEEKS_AHEAD
  noteFirstLesson?: boolean;    // tag the first real lesson with firstNote (switch flow) — stays Type 'Regular'
  firstNote?: string;           // Notes on that first lesson
}

/**
 * Generate weekly Regular lessons for `studentId` in `slotId`, from `startDate`
 * for `weeksAhead` weeks. Skips dates that already have a record for this
 * student+slot (dedup) and writes public holidays as Cancelled. Returns the
 * created dates.
 */
export async function generateRegularLessonsForSlot(opts: GenerateOpts): Promise<{ created: number; dates: string[] }> {
  const { studentId, slotId, startDate, weeksAhead = DEFAULT_WEEKS_AHEAD, noteFirstLesson = false, firstNote } = opts;

  const slot = await airtableRequest('Slots', `/${slotId}`);
  const dayRaw = (slot.fields['Day'] || '').replace(/^\d+\s+/, '').trim();
  const targetDay = DAY_NAMES.indexOf(dayRaw);
  if (targetDay === -1) throw new Error(`Slot has unrecognised Day: '${dayRaw}'`);

  const start = new Date(startDate + 'T00:00:00Z');
  const end = addDays(start, weeksAhead * 7);
  const dayAfterEnd = addDays(end, 1);

  // Dedup: existing lessons for this student in the window (keyed by date+slot)
  const existing = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(`AND({Date}>='${isoDate(start)}',{Date}<'${isoDate(dayAfterEnd)}')`)}&fields[]=Student&fields[]=Date&fields[]=Slot`
  );
  const existingKeys = new Set(
    existing.records
      .filter((r: any) => r.fields['Student']?.[0] === studentId)
      .map((r: any) => `${r.fields['Date']}|${r.fields['Slot']?.[0] || ''}`)
  );

  // Advance to the first occurrence of the slot's weekday on/after start
  let d = new Date(start);
  while (d.getUTCDay() !== targetDay) d = addDays(d, 1);

  const dates: string[] = [];
  let firstRealMarked = false;
  while (d <= end) {
    const dateStr = isoDate(d);
    if (!existingKeys.has(`${dateStr}|${slotId}`)) {
      const isHoliday = NO_LESSON_DATES.includes(dateStr);
      const isFirst = noteFirstLesson && !firstRealMarked && !isHoliday;
      if (isFirst) firstRealMarked = true;
      const fields: Record<string, any> = {
        // First lesson after a switch stays Regular; the note (below) marks it.
        Type: 'Regular',
        Student: [studentId],
        Slot: [slotId],
        Date: dateStr,
        Status: isHoliday ? 'Cancelled' : 'Scheduled',
        'Billing Month': billingMonthOf(dateStr),   // new lessons belong to their own month
      };
      if (isHoliday) fields['Notes'] = 'Public Holiday';
      else if (isFirst && firstNote) fields['Notes'] = firstNote;
      await airtableRequest('Lessons', '', { method: 'POST', body: JSON.stringify({ fields }) });
      dates.push(dateStr);
    }
    d = addDays(d, 7);
  }
  return { created: dates.length, dates };
}
