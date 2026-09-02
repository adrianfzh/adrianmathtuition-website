// Year-end billing rules (Adrian, 2026-09-02) — pure, unit-tested.
//
// Two kinds of student in the last quarter:
//
//   EXAM-YEAR (Sec 4 / Sec 5 sitting O-Levels, JC2 sitting A-Levels): billed in
//   ADVANCE as usual, but their lessons stop at an automatic per-level CUT-OFF —
//   the day of their last national Maths paper (EXAM_CUTOFFS, one row per year
//   from the SEAB timetables). The October invoice (generated 14 Sep) runs up to
//   the cut-off; a month that starts after it gets no invoice at all. An
//   enrollment End Date earlier than the cut-off still wins (effectiveEndISO).
//   IP students carry a Sec 4 label but sit no O-Level — they are NOT exam-year.
//
//   EVERYONE ELSE (Sec 1–3, JC1, IP Sec 4): October, November and December are
//   billed IN ARREARS from lessons actually attended — a run on the 1st of the
//   following month (1 Nov bills October, 1 Dec bills November). December is
//   combined with January in ONE invoice generated 1 Jan (December attended +
//   January projected), stored under the January label so the monthly generator
//   never double-bills; the 14 Dec advance run skips January for them.
//
// The 14th-of-month advance generator creates NOTHING for an arrears-billed
// (student, month) pair — not even an Additional-lessons-only invoice, which is
// the trap that made the old prorated branch skip the real arrears run later.
// Extras are swept by the arrears runs instead (sweepAdditionalFor).
//
// June is NOT on this machinery: it is billed in advance with the flexible-
// attendance credit note (the code's old PRORATION_MONTHS listed June, but that
// branch never produced an invoice — every June has gone out in advance).

import { addDaysISO, firstOfNextMonthISO, lastDayOfMonthISO, monthWindowClause } from './billing-math';
import { billableAdditionalFor, type AdditionalLessonRecord } from './additional-lessons';

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Levels whose students sit a national exam at year end (unless IP). */
export const EXAM_YEAR_LEVELS = ['Sec 4', 'Sec 5', 'JC2'];

/** Months (1–12) billed in arrears for non-exam-year students. */
export const ARREARS_MONTHS = [10, 11, 12];

/** Arrears invoices are due this many days after their issue (send) date. */
export const ARREARS_DUE_DAYS = 7;

export type BillingMode = 'advance' | 'arrears';

export interface ExamCutoffs {
  /** Last O-Level E Math paper (4052) — E-Math-only Sec 4/5 students. */
  eMath: string;
  /** Last O-Level A Math paper (4049) — anyone taking A Math. */
  aMath: string;
  /** Last A-Level H1 Math paper (8865). */
  h1Math: string;
  /** Last A-Level H2 Math paper (9758). */
  h2Math: string;
}

/**
 * Last national Maths paper per year, from the SEAB timetables. ADD A ROW EACH
 * YEAR once the timetable is published (usually February) — the generator
 * warns on Telegram when it bills an exam-year student in a year with no row.
 * 2026: O-Level E Math P2 Fri 23 Oct, A Math P2 Wed 28 Oct; A-Level H1 Math
 * Tue 3 Nov, H2 Math P2 Fri 6 Nov (timetable updated 13 Feb 2026).
 */
export const EXAM_CUTOFFS: Record<number, ExamCutoffs> = {
  2026: { eMath: '2026-10-23', aMath: '2026-10-28', h1Math: '2026-11-03', h2Math: '2026-11-06' },
};

export interface StudentBillingProfile {
  level?: string | null;
  subjects?: string[] | null;
  /** Airtable Students.Subject Level — 'IP' marks the through-train (no O-Level). */
  subjectLevel?: string | null;
}

function isIP(p: StudentBillingProfile): boolean {
  return (p.subjectLevel || '').trim() === 'IP' || (p.subjects || []).includes('IP Math');
}

/** Sits a national exam this year — Sec 4/5 (non-IP) or JC2. */
export function isExamYearStudent(p: StudentBillingProfile): boolean {
  const level = (p.level || '').trim();
  if (!EXAM_YEAR_LEVELS.includes(level)) return false;
  if (level !== 'JC2' && isIP(p)) return false;
  return true;
}

/** How a student's given month (1–12) is billed. */
export function billingModeFor(p: StudentBillingProfile, month: number): BillingMode {
  return !isExamYearStudent(p) && ARREARS_MONTHS.includes(month) ? 'arrears' : 'advance';
}

/**
 * January is generated on 1 Jan together with December (one combined invoice)
 * for every student whose December is arrears-billed. The 14 Dec advance run
 * must skip those students; the 1 Jan arrears run projects January for them.
 */
export function isCombinedJanuary(p: StudentBillingProfile, month: number): boolean {
  return month === 1 && billingModeFor(p, 12) === 'arrears';
}

export interface ExamCutoff {
  iso: string;
  /** e.g. "O-Level A Math Paper 2" — for the invoice note. */
  paper: string;
}

/**
 * The exam-year student's last lesson date in `year`, or null when the student
 * is not exam-year or the year has no EXAM_CUTOFFS row (then only the
 * enrollment End Date applies — and the generator warns).
 * Subject rules: Sec 4/5 with A Math → A Math P2; E Math only → E Math P2;
 * unknown subjects → the later A Math date (over-billing one lesson is easier
 * to amend than a missing one). JC2 with only H1 Math → H1; otherwise H2.
 */
export function examCutoffFor(p: StudentBillingProfile, year: number): ExamCutoff | null {
  if (!isExamYearStudent(p)) return null;
  const row = EXAM_CUTOFFS[year];
  if (!row) return null;
  const subjects = p.subjects || [];
  if ((p.level || '').trim() === 'JC2') {
    const h1Only = subjects.includes('H1 Math') && !subjects.includes('H2 Math');
    return h1Only
      ? { iso: row.h1Math, paper: 'A-Level H1 Math paper' }
      : { iso: row.h2Math, paper: 'A-Level H2 Math Paper 2' };
  }
  const eMathOnly = subjects.length > 0 && !subjects.includes('A Math') && subjects.every((s) => s === 'E Math' || s === 'Math');
  return eMathOnly
    ? { iso: row.eMath, paper: 'O-Level E Math Paper 2' }
    : { iso: row.aMath, paper: 'O-Level A Math Paper 2' };
}

/** The earlier of the enrollment End Date and the exam cut-off (either may be absent). */
export function effectiveEndISO(enrollmentEndISO: string | null | undefined, cutoffISO: string | null | undefined): string | null {
  const a = enrollmentEndISO || null;
  const b = cutoffISO || null;
  if (a && b) return a < b ? a : b;
  return a || b;
}

/** "Wed 28 Oct 2026" from an ISO date — for notes and Telegram lines. */
export function humanDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-SG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** The parent-facing note on an exam-year invoice that was cut short by the exams. */
export function examCutoffNote(cutoff: ExamCutoff): string {
  return `Lessons run up to ${humanDate(cutoff.iso)}, the last ${cutoff.paper}. No lessons are scheduled after the exams.`;
}

/**
 * Parent-facing note on an exam-year student's invoice drafted by the ARREARS
 * run (attended lessons the advance lane never billed — no advance invoice for
 * the month, yet lessons were marked Completed). Non-empty Auto Notes make the
 * send cron hold the invoice for Adrian.
 */
export function attendedReviewNote(billLabel: string): string {
  return `Billed for the lessons attended in ${billLabel}.`;
}

/** The send cron's hold reason for the notes this module writes; null when the note is not ours. */
export function yearEndHoldReason(autoNotes: string): string | null {
  if (/after the exams/.test(autoNotes)) return 'exam cut-off';
  if (/lessons attended in/.test(autoNotes)) return 'attended lessons (exam-year student)';
  return null;
}

// ─── The arrears run ──────────────────────────────────────────────────────────

export interface ArrearsTarget {
  /** The month whose ATTENDED lessons are billed. */
  billYear: number;
  billMonth: number;
  billLabel: string;
  /** The label the invoice is stored under (differs from billLabel only in the combined January case). */
  invoiceYear: number;
  invoiceMonth: number;
  invoiceLabel: string;
  /** Combined case: also project the invoice month's regular lessons (January). */
  projectInvoiceMonth: boolean;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** "October 2026" → { year, month } or null. */
export function parseMonthLabel(label: string | null | undefined): { year: number; month: number } | null {
  const parts = String(label || '').trim().split(/\s+/);
  if (parts.length !== 2 || !/^\d{4}$/.test(parts[1])) return null;
  const idx = MONTH_LABELS.indexOf(parts[0]);
  return idx < 0 ? null : { year: parseInt(parts[1], 10), month: idx + 1 };
}

/**
 * The arrears run for the invoice labelled (year, month): a January label means
 * the combined invoice (bill December of the year before + project January);
 * any other label bills exactly that month.
 */
export function arrearsTargetForMonth(year: number, month: number): ArrearsTarget {
  if (month === 1) {
    return {
      billYear: year - 1, billMonth: 12, billLabel: monthLabel(year - 1, 12),
      invoiceYear: year, invoiceMonth: 1, invoiceLabel: monthLabel(year, 1),
      projectInvoiceMonth: true,
    };
  }
  return {
    billYear: year, billMonth: month, billLabel: monthLabel(year, month),
    invoiceYear: year, invoiceMonth: month, invoiceLabel: monthLabel(year, month),
    projectInvoiceMonth: false,
  };
}

/**
 * What the cron run on `todayISO` (SGT) bills: the month that just ended —
 * except in January, when it is the combined December+January invoice.
 * 1 Nov → October; 1 Dec → November; 1 Jan → "January" (Dec attended + Jan projected).
 */
export function arrearsRunTarget(todayISO: string): ArrearsTarget {
  const [y, m] = todayISO.split('-').map(Number);
  if (m === 1) return arrearsTargetForMonth(y, 1);
  return arrearsTargetForMonth(y, m - 1);
}

/**
 * An arrears run bills ATTENDED lessons, so it must not run before the bill
 * month is over — a manual `{month:"October 2026"}` typed on 20 Oct would
 * draft a partial month, and the next run would then skip the student (an
 * invoice for the label exists). The route refuses unless `{force:true}`.
 */
export function arrearsBillMonthEnded(target: ArrearsTarget, todayISO: string): boolean {
  return todayISO >= firstOfNextMonthISO(`${target.billYear}-${String(target.billMonth).padStart(2, '0')}-01`);
}

/** Arrears invoices are issued on the send day and due ARREARS_DUE_DAYS later. */
export function arrearsDueDateISO(issueISO: string): string {
  return addDaysISO(issueISO, ARREARS_DUE_DAYS);
}

/**
 * ONE due-date rule for both modes: an advance invoice is due on the 15th of
 * the month it covers (the old inline rule); an arrears invoice is due
 * ARREARS_DUE_DAYS after issue — the old rule would put it in the past.
 */
export function invoiceDueDateISO(mode: BillingMode, invoiceYear: number, invoiceMonth: number, issueISO: string): string {
  if (mode === 'arrears') return arrearsDueDateISO(issueISO);
  return `${invoiceYear}-${String(invoiceMonth).padStart(2, '0')}-15`;
}

// ─── Lesson selection for the arrears run ─────────────────────────────────────

export interface ArrearsLessonRecord {
  id: string;
  date: string;
  studentId: string | null;
  type: string;
  /** Lessons.Billing Month ("October 2026") — a moved lesson keeps the month it was originally scheduled in. */
  billingMonth: string;
  isMakeup: boolean;
  slotId: string | null;
}

export function mapArrearsRecord(r: { id: string; fields: Record<string, unknown> }): ArrearsLessonRecord {
  return {
    id: r.id,
    date: (r.fields['Date'] as string) || '',
    studentId: (r.fields['Student'] as string[] | undefined)?.[0] ?? null,
    type: (r.fields['Type'] as string) || '',
    billingMonth: (r.fields['Billing Month'] as string) || '',
    isMakeup: r.fields['Is Makeup'] === true,
    slotId: (r.fields['Slot'] as string[] | undefined)?.[0] ?? null,
  };
}

/** The lesson types an arrears run bills as regular lessons (a moved lesson is still a lesson). */
export const ARREARS_REGULAR_TYPES = ['Regular', 'Rescheduled'];

/**
 * Formula for the ONE window fetch of a bill month's attended lessons — all
 * students at once (never a {Student} clause: linked fields compare by display
 * name and match nothing — CLAUDE.md Gotchas), half-open at the next month.
 * Only Completed lessons: the terms promise Oct–Dec are charged on attendance.
 */
export function arrearsMonthFormula(year: number, month: number): string {
  const types = ARREARS_REGULAR_TYPES.map((t) => `{Type}='${t}'`).join(',');
  return `AND(OR(${types}),{Status}='Completed',${monthWindowClause(year, month)})`;
}

/**
 * The bill month's regular lessons still 'Scheduled' — attendance never
 * marked. The arrears run cannot bill them (only Completed counts), so it
 * lists them in its summary: mark them Completed, then Regenerate the
 * invoice, or they stay unbilled.
 */
export function unmarkedArrearsFormula(year: number, month: number): string {
  const types = ARREARS_REGULAR_TYPES.map((t) => `{Type}='${t}'`).join(',');
  return `AND(OR(${types}),{Status}='Scheduled',${monthWindowClause(year, month)})`;
}

/** Unmarked regular lessons per student: record id → sorted ISO dates. */
export function unmarkedByStudent(pool: ArrearsLessonRecord[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of pool) {
    if (!l.studentId || !ARREARS_REGULAR_TYPES.includes(l.type)) continue;
    if (!out.has(l.studentId)) out.set(l.studentId, []);
    out.get(l.studentId)!.push(l.date);
  }
  for (const dates of out.values()) dates.sort();
  return out;
}

/** The "Month YYYY" label of an ISO date. */
export function labelOfDate(iso: string): string {
  const p = (iso || '').split('-');
  return p.length === 3 ? monthLabel(parseInt(p[0], 10), parseInt(p[1], 10)) : '';
}

export interface ArrearsStudentContext extends StudentBillingProfile {
  /**
   * Labels of the months this student already holds an invoice for — any
   * type, any status, Voided included (same rule as the generator's own
   * duplicate check: a voided month was handled on purpose).
   */
  invoicedMonths: Set<string>;
}

/**
 * Was a lesson owned by `billingMonth` already covered by an ADVANCE invoice?
 * True when that month is advance-billed for this student AND an invoice for
 * it exists. A September lesson moved into October (or a makeup for a
 * September absence) was inside the September invoice — billing it again in
 * October's arrears run would charge the parent twice. A lesson owned by an
 * arrears month is never pre-paid (its invoice only carried lessons dated
 * inside that month), and a month with no invoice at all was never charged.
 */
export function paidInAdvance(ctx: ArrearsStudentContext, billingMonth: string): boolean {
  const parsed = parseMonthLabel(billingMonth);
  if (!parsed) return false;
  if (billingModeFor(ctx, parsed.month) !== 'advance') return false;
  return ctx.invoicedMonths.has(billingMonth);
}

/**
 * The student's billable attended lessons from the bill month's pool, sorted
 * by date: every Completed Regular/Rescheduled lesson dated in the month whose
 * owning month (Billing Month, else the date's month) was not already paid in
 * advance.
 */
export function arrearsRegularLessonsFor(pool: ArrearsLessonRecord[], studentId: string, ctx: ArrearsStudentContext): ArrearsLessonRecord[] {
  return pool
    .filter((l) => l.studentId === studentId && ARREARS_REGULAR_TYPES.includes(l.type))
    .filter((l) => !paidInAdvance(ctx, l.billingMonth || labelOfDate(l.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Extras sweep: every billable Additional lesson dated BEFORE `beforeISO`
 * (the first day after the bill month) — older unbilled ones included, so an
 * extra that fell between two runs is never stranded. The Billed checkbox
 * (inside billableAdditionalFor) is the double-billing guard.
 */
export function sweepAdditionalFor(pool: AdditionalLessonRecord[], studentId: string, beforeISO: string): AdditionalLessonRecord[] {
  return billableAdditionalFor(pool, studentId).filter((l) => l.date && l.date < beforeISO);
}

/** Additional-lessons window for the sweep: from `monthsBack` months before the bill month's first day. */
export function sweepWindowStartISO(billYear: number, billMonth: number, monthsBack = 3): string {
  const total = billYear * 12 + (billMonth - 1) - monthsBack;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

// ─── The 12th/13th reminders ─────────────────────────────────────────────────

const CUTOFF_LABELS: { key: keyof ExamCutoffs; label: string; group: 'Sec 4/5' | 'JC2' }[] = [
  { key: 'eMath', label: 'E Math', group: 'Sec 4/5' },
  { key: 'aMath', label: 'A Math', group: 'Sec 4/5' },
  { key: 'h1Math', label: 'H1', group: 'JC2' },
  { key: 'h2Math', label: 'H2', group: 'JC2' },
];

/**
 * What the ADVANCE run on the 14th will and won't draft for the invoice
 * month, for the reminders that precede it (12th, 13th). Null outside the
 * year-end months, so the ordinary reminder text stands.
 */
export function advanceRunNote(invoiceYear: number, invoiceMonth: number): string | null {
  const others = 'Sec 1–3 / JC1 (and IP Sec 4)';
  if (invoiceMonth === 1) {
    return `Year-end billing: ${others} get NO January draft on the 14th — December + January go out as ONE invoice on 1 Jan (December attended + January projected). Sec 4/5 and JC2 are past their exams: no invoice.`;
  }
  if (!ARREARS_MONTHS.includes(invoiceMonth)) return null;
  const monthName = MONTH_LABELS[invoiceMonth - 1];
  const nextName = MONTH_LABELS[invoiceMonth % 12];
  const first = `${invoiceYear}-${String(invoiceMonth).padStart(2, '0')}-01`;
  const last = lastDayOfMonthISO(first);
  const row = EXAM_CUTOFFS[invoiceYear];
  let examYear: string;
  if (!row) {
    examYear = `Sec 4/5 and JC2 are drafted as usual — ⚠ no EXAM_CUTOFFS row for ${invoiceYear} in lib/year-end-billing.ts, so nothing stops at the exams`;
  } else {
    examYear = (['Sec 4/5', 'JC2'] as const).map((g) => {
      const cs = CUTOFF_LABELS.filter((c) => c.group === g).map((c) => ({ label: c.label, iso: row[c.key] }));
      if (cs.every((c) => c.iso < first)) return `${g}: exams over, no invoice`;
      if (cs.every((c) => c.iso > last)) return `${g}: as usual`;
      return `${g}: ${cs.map((c) =>
        c.iso < first ? `${c.label} exams over` : c.iso > last ? `${c.label} as usual` : `${c.label} up to ${humanDate(c.iso)}`
      ).join(', ')}`;
    }).join('; ');
  }
  return `Year-end billing: ${others} get NO ${monthName} draft on the 14th — their ${monthName} lessons are billed in arrears on 1 ${nextName} (attended lessons only). ${examYear}.`;
}

// ── Where the machinery starts ───────────────────────────────────────────────
// October 2026 is the first arrears-billed month. Anything earlier (a June
// 2026 rebuild, a 2025 invoice) was advance-billed under the old rules and a
// rebuild must keep reproducing it that way — the rules above are only
// consulted for months the machinery actually covers.
export const ARREARS_BILLING_FROM = { year: 2026, month: 10 };

/** True when (year, month) is a month the year-end machinery bills — Oct 2026 onwards. */
export function arrearsMachineryCovers(year: number, month: number): boolean {
  return year * 12 + month >= ARREARS_BILLING_FROM.year * 12 + ARREARS_BILLING_FROM.month;
}
