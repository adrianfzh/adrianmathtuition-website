// Airtable fetches for the arrears invoice run (lib/year-end-billing.ts).
// Server-only, deliberately thin — every rule lives in the tested pure libs.
// Both fetches are ONE window query for ALL students, matched to a student in
// JS afterwards: a {Student}='recXXX' clause matches nothing on a linked field
// (CLAUDE.md Gotchas), and airtableRequestAll paginates past the 100-row cap.

import { airtableRequestAll } from './airtable';
import { mapAdditionalRecord, type AdditionalLessonRecord } from './additional-lessons';
import { firstOfNextMonthISO } from './billing-math';
import { arrearsMonthFormula, mapArrearsRecord, sweepWindowStartISO, unmarkedArrearsFormula, type ArrearsLessonRecord } from './year-end-billing';

/**
 * Every Completed Regular/Rescheduled lesson dated in the bill month. The
 * newer optional fields (Billing Month, Is Makeup) are requested first; an
 * unknown name in fields[] 422s the whole request, so fall back without them —
 * the mapper then treats the lesson as owned by its own date's month.
 */
export function fetchArrearsPool(billYear: number, billMonth: number): Promise<ArrearsLessonRecord[]> {
  return fetchLessonPool(arrearsMonthFormula(billYear, billMonth));
}

/** The bill month's regular lessons still 'Scheduled' (unmarked — unbillable until marked). */
export function fetchUnmarkedArrearsPool(billYear: number, billMonth: number): Promise<ArrearsLessonRecord[]> {
  return fetchLessonPool(unmarkedArrearsFormula(billYear, billMonth));
}

async function fetchLessonPool(formula: string): Promise<ArrearsLessonRecord[]> {
  const base = `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Date&fields[]=Student&fields[]=Type&fields[]=Slot`;
  const attempts = [
    base + '&fields[]=Billing Month&fields[]=Is Makeup',
    base + '&fields[]=Billing Month',
    base,
  ];
  let lastErr: unknown = null;
  for (const q of attempts) {
    try {
      const d = await airtableRequestAll('Lessons', q);
      return (d.records || []).map(mapArrearsRecord);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchLessonPool failed');
}

/**
 * Month labels each student already holds an invoice for — ANY type and ANY
 * status, Voided included. The generator's duplicate check counts Voided too
 * ("voided on purpose, never recreate"), so a lesson owned by a month Adrian
 * chose not to charge must not resurface in an arrears run either.
 */
export async function fetchInvoicedMonthsByStudent(): Promise<Map<string, Set<string>>> {
  const d = await airtableRequestAll('Invoices', '?fields[]=Student&fields[]=Month');
  const out = new Map<string, Set<string>>();
  for (const r of d.records || []) {
    const sid = (r.fields['Student'] as string[] | undefined)?.[0];
    const month = (r.fields['Month'] as string | undefined) || '';
    if (!sid || !month) continue;
    if (!out.has(sid)) out.set(sid, new Set());
    out.get(sid)!.add(month);
  }
  return out;
}

/**
 * Additional lessons for the extras sweep: Completed, from `monthsBack` months
 * before the bill month up to (not including) the first day after it. The
 * Billed checkbox is requested when it exists (unknown field → 422 → retry
 * without, and the caller warns on Telegram, exactly as the advance run does).
 */
export async function fetchSweepAdditionalPool(
  billYear: number,
  billMonth: number,
  monthsBack = 3,
): Promise<{ pool: AdditionalLessonRecord[]; beforeISO: string; billedFieldMissing: boolean }> {
  const startISO = sweepWindowStartISO(billYear, billMonth, monthsBack);
  const beforeISO = firstOfNextMonthISO(`${billYear}-${String(billMonth).padStart(2, '0')}-01`);
  const base = `?filterByFormula=${encodeURIComponent(`AND({Type}='Additional',{Status}='Completed',{Date}>='${startISO}',{Date}<'${beforeISO}')`)}&fields[]=Date&fields[]=Student&fields[]=Is Revision Makeup&fields[]=Notes`;
  let billedFieldMissing = false;
  const d = await airtableRequestAll('Lessons', base + '&fields[]=Billed').catch(async () => {
    billedFieldMissing = true;
    return airtableRequestAll('Lessons', base).catch(() => ({ records: [] as any[] }));
  });
  return { pool: (d.records || []).map(mapAdditionalRecord), beforeISO, billedFieldMissing };
}
