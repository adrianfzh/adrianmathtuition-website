// GET/POST /api/admin/holiday-optout — per-student holiday opt-out for the
// optional (prorated) months: June, Oct, Nov, Dec.
//
// Design: an opt-out is MATERIALIZED as Cancelled lesson records, not stored as
// intent. Both lesson generators (website generateRegularLessonsForSlot and the
// bot's Monday generateUpcomingLessons cron) dedup against existing records with
// NO status filter, so a pre-created Cancelled record durably blocks that date
// from ever being (re)generated — no bot change, no schema change. Billing needs
// nothing: prorated months bill Completed lessons only, in arrears.
//
//   skip an existing Scheduled lesson  → PATCH Status='Cancelled' + marker note
//   skip a date with no record yet     → CREATE the record as Cancelled + marker
//                                        ('(auto-created)' suffix)
//   restore an auto-created marker     → DELETE it (true no-op round-trip; no
//                                        phantom Scheduled lessons ahead of the
//                                        generation horizon)
//   restore a patched lesson           → PATCH back to 'Scheduled', strip marker
//
// Completed/Absent/Rescheduled records and non-opt-out Cancelled records
// (public holidays, Revision Sprint) are locked — never touched.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { NO_LESSON_DATES } from '@/lib/holidays';
import { billingMonthOf } from '@/lib/lesson-generation';

export const runtime = 'nodejs';

const PRORATION_MONTHS = [6, 10, 11, 12]; // must match generate-invoices
const MONTHS_SHOWN = 3;                    // upcoming optional months offered
const OPTOUT_MARKER = 'Holiday opt-out'; // route files may only export handlers/config
const AUTO_CREATED = '(auto-created)';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type DateEntry = {
  date: string;        // YYYY-MM-DD
  slotId: string;
  slotLabel: string;   // "Sun 9-11am"
  state: 'kept' | 'projected' | 'skipped' | 'locked';
  lessonId?: string;
  lockReason?: string;
};

/** Next N proration months from today (never the current month — it's underway). */
function upcomingOptionalMonths(now: Date): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 2; // 1-based next month
  while (out.length < MONTHS_SHOWN) {
    if (m > 12) { m -= 12; y++; }
    if (PRORATION_MONTHS.includes(m)) out.push({ year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` });
    m++;
  }
  return out;
}

/** All YYYY-MM-DD dates of `weekday` inside (year, month), excluding NO_LESSON_DATES. */
function weekdayDatesInMonth(year: number, month: number, weekday: number): string[] {
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

function slotDayIndex(slotFields: Record<string, unknown>): number {
  const raw = String(slotFields['Day'] || '').replace(/^\d+\s+/, '').trim();
  return DAY_NAMES.indexOf(raw);
}

function slotLabel(slotFields: Record<string, unknown>): string {
  const day = String(slotFields['Day'] || '').replace(/^\d+\s+/, '').trim().slice(0, 3);
  return `${day} ${String(slotFields['Time'] || '').trim()}`.trim();
}

async function studentSlots(studentId: string) {
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
async function regularLessonsInRange(studentId: string, start: string, endExclusive: string) {
  const formula = `AND({Type}='Regular',{Date}>='${start}',{Date}<'${endExclusive}')`;
  const data = await airtableRequestAll(
    'Lessons',
    `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Student&fields[]=Slot&fields[]=Date&fields[]=Status&fields[]=Notes`
  );
  return (data.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  try {
    const months = upcomingOptionalMonths(new Date());
    const slots = await studentSlots(studentId);
    if (!slots.length) return NextResponse.json({ months: [], noSlots: true });

    const rangeStart = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`;
    const last = months[months.length - 1];
    const rangeEnd = last.month === 12 ? `${last.year + 1}-01-01` : `${last.year}-${String(last.month + 1).padStart(2, '0')}-01`;
    const lessons = await regularLessonsInRange(studentId, rangeStart, rangeEnd);
    const byKey = new Map<string, any>();
    for (const r of lessons) byKey.set(`${r.fields['Date']}|${r.fields['Slot']?.[0] || ''}`, r);

    const result = months.map(({ year, month, label }) => {
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

    return NextResponse.json({ months: result });
  } catch (e: unknown) {
    console.error('[holiday-optout] GET failed:', e);
    return NextResponse.json({ error: 'Failed to load opt-out data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { studentId?: string; changes?: { date: string; slotId: string; skip: boolean }[] } | null;
  const { studentId, changes } = body || {};
  if (!studentId || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'studentId and non-empty changes[] required' }, { status: 400 });
  }
  for (const c of changes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '') || !c.slotId || typeof c.skip !== 'boolean') {
      return NextResponse.json({ error: `Bad change entry: ${JSON.stringify(c)}` }, { status: 400 });
    }
    const m = Number(c.date.slice(5, 7));
    if (!PRORATION_MONTHS.includes(m)) {
      return NextResponse.json({ error: `${c.date} is not in an optional (prorated) month` }, { status: 400 });
    }
  }

  try {
    const dates = changes.map((c) => c.date).sort();
    const dayAfterEnd = (() => { const d = new Date(dates[dates.length - 1] + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
    const lessons = await regularLessonsInRange(studentId, dates[0], dayAfterEnd);
    const byKey = new Map<string, any>();
    for (const r of lessons) byKey.set(`${r.fields['Date']}|${r.fields['Slot']?.[0] || ''}`, r);

    const result = { cancelled: 0, created: 0, restored: 0, removed: 0, skippedLocked: [] as string[] };

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
        // restore
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

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    console.error('[holiday-optout] POST failed:', e);
    return NextResponse.json({ error: 'Failed to apply opt-out changes' }, { status: 500 });
  }
}
