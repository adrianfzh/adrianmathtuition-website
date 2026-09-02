// Line items for an arrears invoice (lib/year-end-billing.ts) — pure, tested.
// Shared by generate-invoices (mode=arrears) and regenerate-invoice so a rebuilt
// invoice can never disagree with the one the cron drafted.

import { invoiceMonthLessonDates } from './billing-math';
import type { AdditionalLessonRecord } from './additional-lessons';
import {
  arrearsRegularLessonsFor,
  labelOfDate,
  type ArrearsLessonRecord,
  type ArrearsStudentContext,
} from './year-end-billing';

export interface InvoiceLineItem {
  date: string;
  /** Slot label ("Tue 4pm") — the PDF's slot cell. */
  day: string;
  type: string;
  /** The PDF groups lines by description: "<Level> <subjects> — <Month YYYY>". */
  description: string;
  rate?: number;
}

/** One enrollment's slot, resolved: what the lines need to know about it. */
export interface SlotLine {
  slotId: string | null;
  dayLabel: string;
  /** 0=Sunday…6=Saturday; undefined when the slot's Day is blank/unknown. */
  weekday: number | undefined;
  rate: number;
  /** Enrollment End Date (or the exam cut-off) — projection stops here. */
  endISO: string | null;
}

/** "Sec 3 A Math & E Math" — the description base before " — <month>". */
export function descriptionBase(level: string | null | undefined, subjects: string[] | null | undefined): string {
  return `${level || ''} ${(subjects || []).join(' & ')}`.trim();
}

/**
 * The attended lessons of the bill month as invoice lines — one per lesson,
 * labelled with its own slot (a moved lesson keeps its slot link, so a
 * student with two slots sees the right one) and charged at that slot's
 * enrollment rate, falling back to the student's primary rate.
 */
export function attendedLessonLines(
  pool: ArrearsLessonRecord[],
  studentId: string,
  ctx: ArrearsStudentContext,
  opts: { descriptionBase: string; billLabel: string; slots: SlotLine[]; defaultRate: number },
): InvoiceLineItem[] {
  const description = `${opts.descriptionBase} — ${opts.billLabel}`;
  return arrearsRegularLessonsFor(pool, studentId, ctx).map((lesson) => {
    const slot = opts.slots.find((s) => s.slotId && s.slotId === lesson.slotId) ?? opts.slots[0];
    return {
      date: lesson.date,
      day: slot?.dayLabel ?? '',
      type: 'Regular',
      description,
      rate: slot?.rate || opts.defaultRate,
    };
  });
}

/**
 * The invoice month's regular lessons projected from the weekly slots — the
 * January half of the combined December+January invoice. Same walk as the
 * advance generator (invoiceMonthLessonDates: End Date clamp, holidays out).
 */
export function projectedLessonLines(
  monthFirstISO: string,
  opts: { descriptionBase: string; label: string; slots: SlotLine[]; defaultRate: number; excluded: readonly string[] },
): InvoiceLineItem[] {
  const description = `${opts.descriptionBase} — ${opts.label}`;
  const out: InvoiceLineItem[] = [];
  for (const slot of opts.slots) {
    if (slot.weekday === undefined) continue;
    for (const date of invoiceMonthLessonDates(monthFirstISO, slot.weekday, slot.endISO, opts.excluded)) {
      out.push({ date, day: slot.dayLabel, type: 'Regular', description, rate: slot.rate || opts.defaultRate });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Swept Additional lessons as lines, each labelled with ITS OWN month — an
 * older extra picked up by this run says "September 2026", not the bill month.
 */
export function additionalLessonLines(lessons: AdditionalLessonRecord[], rate: number): InvoiceLineItem[] {
  return lessons
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({ date: l.date, day: '', type: 'Additional', description: `Additional Lesson — ${labelOfDate(l.date)}`, rate }));
}

/** Sum of the lines' rates (a line without a rate counts `defaultRate`). */
export function sumLineRates(lines: InvoiceLineItem[], defaultRate: number): number {
  return lines.reduce((sum, l) => sum + (l.rate || defaultRate), 0);
}
