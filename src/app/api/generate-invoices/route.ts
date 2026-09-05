import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { generateInvoicePDF, closeBrowser } from '@/lib/generate-pdf';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the money topic (6 Sept 2026; falls back to the DM when unbound).
const notify_money = (text: string) => sendTelegram(text, 'money');
import { buildRegisterUrl } from '@/lib/invoice-register-url';
import { displaySpanMonth, getInvoiceMonth, sgtTodayISO } from '@/lib/invoice-month';
import { applyPriorBalance } from '@/lib/invoice-consolidate';
import { parseReferrerMarker } from '@/lib/referral-link';
import { NO_LESSON_DATES } from '@/lib/holidays';
import { billableAdditionalFor, mapAdditionalRecord, type AdditionalLessonRecord } from '@/lib/additional-lessons';
import { firstOfNextMonthISO, invoiceMonthLessonDates, lastDayOfMonthISO, nextDayISO } from '@/lib/billing-math';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import {
  arrearsBillMonthEnded, arrearsRunTarget, arrearsTargetForMonth, attendedReviewNote, billingModeFor, effectiveEndISO,
  examCutoffFor, examCutoffNote, humanDate, invoiceDueDateISO, isCombinedJanuary, isExamYearStudent, parseMonthLabel,
  sweepAdditionalFor, unmarkedByStudent,
  type ArrearsLessonRecord, type ArrearsTarget, type BillingMode, type StudentBillingProfile,
} from '@/lib/year-end-billing';
import { additionalLessonLines, attendedLessonLines, descriptionBase, projectedLessonLines, sumLineRates, type SlotLine } from '@/lib/arrears-lines';
import { fetchArrearsPool, fetchInvoicedMonthsByStudent, fetchSweepAdditionalPool, fetchUnmarkedArrearsPool } from '@/lib/arrears-fetch';
import { jobNameFor, resolveRunMode } from '@/lib/invoice-run-mode';

/** "Tue 6 Oct" — for Telegram lines; UTC-pinned so an ISO date never skews a day. */
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const DAY_ABBREV: Record<string, string> = {
  Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

const DAY_INDICES: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

export const runtime = 'nodejs';
export const maxDuration = 300;

// Two runs share this route (lib/year-end-billing.ts has the rules + tests):
//
//   ADVANCE (cron 14th, no mode): next month's regular lessons projected from
//   the weekly slots. Exam-year students (Sec 4/5, JC2) are clamped to their
//   exam cut-off; students whose month is arrears-billed get NOTHING here —
//   not even an Additional-lessons-only invoice (that trap made the old
//   prorated branch pre-empt the real run).
//
//   ARREARS (cron 1st Nov/Dec/Jan, ?mode=arrears or body {mode:'arrears'}):
//   the month that just ended, from lessons actually attended, plus a sweep of
//   every unbilled Additional lesson for everyone; 1 Jan is the combined
//   December+January invoice. Body {month:'October 2026'} re-runs a month.
//
// June is billed in advance like any other month (the old PRORATION_MONTHS
// listed it, but that branch never produced an invoice — retired 2026-09-02).

// getInvoiceMonth imported from @/lib/invoice-month

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

interface InvoiceMonth {
  label: string;
  year: number;
  month: number;
  firstDay: Date;
  lastDay: Date;
}

// Regular-lesson dates come from lib/billing-math.ts (invoiceMonthLessonDates)
// — the canonical, tested weekday walk. The inline loop that lived here until
// 2026-09-02 formatted local-midnight Dates with toISOString(), which is only
// correct while the server timezone is UTC; parity with it is pinned in
// billing-math.test.ts.

function checkAuth(req: NextRequest): boolean {
  // Cron acceptance: Vercel cron header or CRON_SECRET Bearer. Otherwise
  // standard admin auth (signed session cookie or legacy ADMIN_PASSWORD Bearer).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && safeEqual(authHeader ?? '', `Bearer ${cronSecret}`)) return true;
  return verifyAdminAuth(req);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  let reqBody: any = {};
  try { reqBody = await req.json(); } catch { /* cron has no body */ }
  const requestedMonth = (reqBody.month as string) || '';
  const mode: BillingMode = resolveRunMode(req.nextUrl.searchParams, reqBody);
  const jobName = jobNameFor('generate-invoices', mode);
  const todayISO = sgtTodayISO();

  try {
    // Determine invoice month — use requested month if provided, else default to next month
    let invoiceMonth: InvoiceMonth;
    // Arrears: the month whose ATTENDED lessons are billed. Equals the invoice
    // month except on 1 Jan (bill December, store under January + project it).
    let target: ArrearsTarget | null = null;
    if (mode === 'arrears') {
      const parsed = requestedMonth ? parseMonthLabel(requestedMonth) : null;
      target = parsed ? arrearsTargetForMonth(parsed.year, parsed.month) : arrearsRunTarget(todayISO);
      invoiceMonth = {
        label: target.invoiceLabel, year: target.invoiceYear, month: target.invoiceMonth,
        firstDay: new Date(target.invoiceYear, target.invoiceMonth - 1, 1),
        lastDay: new Date(target.invoiceYear, target.invoiceMonth, 0),
      };
      // Attended lessons only: a run before the bill month is over would
      // draft a partial month, and the real run on the 1st would then skip
      // these students (an invoice for the label exists). The cron always
      // passes; a manual `{month}` needs `{force:true}` to run early.
      if (!arrearsBillMonthEnded(target, todayISO) && reqBody.force !== true) {
        return NextResponse.json({
          error: `${target.billLabel} has not ended yet (today ${todayISO}) — an arrears run bills attended lessons, so this would draft a partial month. Pass {"force":true} to run anyway.`,
        }, { status: 400 });
      }
    } else if (requestedMonth) {
      const FULL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const parts = requestedMonth.trim().split(' ');
      const mIdx = FULL_MONTH_NAMES.indexOf(parts[0]);
      const yr = parseInt(parts[1] || '', 10);
      if (mIdx >= 0 && !isNaN(yr)) {
        const firstDay = new Date(yr, mIdx, 1);
        const lastDay = new Date(yr, mIdx + 1, 0);
        invoiceMonth = { label: requestedMonth.trim(), year: yr, month: mIdx + 1, firstDay, lastDay };
      } else {
        invoiceMonth = getInvoiceMonth();
      }
    } else {
      invoiceMonth = getInvoiceMonth();
    }

    // Month start as a plain ISO string — lesson-date math runs on this, never
    // on Date→toISOString() (which reads out UTC and skews a day in any
    // non-UTC environment). The arrears Lessons window is built the same way
    // from year+month ints (lib/year-end-billing.ts arrearsMonthFormula).
    const monthFirstISO = `${invoiceMonth.year}-${String(invoiceMonth.month).padStart(2, '0')}-01`;
    const monthLastISO = lastDayOfMonthISO(monthFirstISO);
    const billMonthFirstISO = target
      ? `${target.billYear}-${String(target.billMonth).padStart(2, '0')}-01`
      : monthFirstISO;
    const billMonthLastISO = lastDayOfMonthISO(billMonthFirstISO);
    const runLabel = target && target.projectInvoiceMonth
      ? `${target.billLabel} + ${target.invoiceLabel}`
      : invoiceMonth.label;

    // IMPORTANT: paginate! A plain airtableRequest() silently caps at 100
    // rows, which previously hid enrollments (and therefore students) past
    // the first page. See src/lib/airtable.ts > airtableRequestAll.
    // Arrears runs also take enrollments that ENDED during the bill month —
    // a student who left mid-October still attended October lessons — and
    // Ended ones with no End Date at all (clamped to the bill month below;
    // safe, because an arrears run only ever bills Completed lessons).
    const enrollmentFormula = mode === 'arrears'
      ? `OR({Status}='Active',AND({Status}='Ended',OR({End Date}=BLANK(),{End Date}>='${billMonthFirstISO}')))`
      : `{Status}='Active'`;
    const enrollmentsData = await airtableRequestAll(
      'Enrollments',
      `?filterByFormula=${encodeURIComponent(enrollmentFormula)}`
    );
    console.log(`[generate-invoices] ${mode} run for ${runLabel}: enrollments fetched: ${enrollmentsData.records.length}`);
    if (!enrollmentsData.records?.length) {
      await logJobRun(jobName, true, 'nothing to generate (no active enrollments)');
      return NextResponse.json({ generated: 0, skipped: 0, errors: [] });
    }

    const studentIds = [...new Set(
      enrollmentsData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    )] as string[];
    const slotIds = [...new Set(
      enrollmentsData.records.map((r: any) => r.fields['Slot']?.[0]).filter(Boolean)
    )] as string[];

    // Previous month label (used to fetch carry-over invoices)
    const prevMonthDate = new Date(invoiceMonth.firstDay);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthNamesArr = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const prevMonthLabel = `${prevMonthNamesArr[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()}`;

    const [studentsData, slotsData, existingInvoicesData, prevMonthInvoicesData] = await Promise.all([
      studentIds.length
        ? airtableRequestAll('Students', `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Level&fields[]=Status&fields[]=Parent Email&fields[]=Parent Name&fields[]=Subject Level&fields[]=Subjects&fields[]=June Revision ${invoiceMonth.year}`)
        : Promise.resolve({ records: [] }),
      slotIds.length
        ? airtableRequestAll('Slots', `?filterByFormula=OR(${slotIds.map((id) => `RECORD_ID()='${id}'`).join(',')})`)
        : Promise.resolve({ records: [] }),
      airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${invoiceMonth.label}'`)}`),
      airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(`{Month}='${prevMonthLabel}'`)}&fields[]=Student&fields[]=Final Amount&fields[]=Amount Paid&fields[]=Is Paid&fields[]=Status&fields[]=Invoice Type&fields[]=Lessons Count&fields[]=Rate Per Lesson&fields[]=Adjustment Amount&fields[]=Adjustment Notes&fields[]=Line Items Extra`),
    ]);
    console.log(`[generate-invoices] Students: ${studentsData.records.length}, Slots: ${slotsData.records.length}, Existing ${invoiceMonth.label}: ${existingInvoicesData.records.length}, Previous ${prevMonthLabel}: ${prevMonthInvoicesData.records.length}`);

    const studentsById: Record<string, any> = Object.fromEntries(studentsData.records.map((r: any) => [r.id, r]));
    const slotsById: Record<string, any> = Object.fromEntries(slotsData.records.map((r: any) => [r.id, r]));
    const existingStudentIds = new Set(
      existingInvoicesData.records.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)
    );
    // Arrears runs look at WHICH invoice types a student already holds for the
    // label: a Regular/Enrollment one means the lessons are billed (an
    // exam-year student's advance invoice, or a previous run) and only extras
    // may remain; an Adjustment one is a previous run's extras-only invoice.
    // Any status counts — a Voided invoice was voided on purpose, never recreate.
    const existingTypesByStudent = new Map<string, Set<string>>();
    for (const r of existingInvoicesData.records) {
      const sid = r.fields['Student']?.[0];
      if (!sid) continue;
      if (!existingTypesByStudent.has(sid)) existingTypesByStudent.set(sid, new Set());
      existingTypesByStudent.get(sid)!.add((r.fields['Invoice Type'] as string) || 'Regular');
    }
    // Index previous-month invoices by student record ID (filter in JS — Airtable can't filter linked records by ID in formulas).
    // Collect ALL non-Voided prior invoices per student (a revision student can have a voided regular + a sent revision invoice;
    // skipping Voided stops us carrying a cancelled amount, and summing handles multiple live invoices).
    const prevInvoicesByStudent: Record<string, any[]> = {};
    for (const r of prevMonthInvoicesData.records || []) {
      const sid = r.fields['Student']?.[0];
      if (!sid || r.fields['Status'] === 'Voided') continue;
      (prevInvoicesByStudent[sid] = prevInvoicesByStudent[sid] || []).push(r);
    }

    // Group enrollments by student
    const enrollmentsByStudent: Record<string, any[]> = {};
    for (const enrollment of enrollmentsData.records) {
      const sid = enrollment.fields['Student']?.[0];
      if (!sid) continue;
      if (!enrollmentsByStudent[sid]) enrollmentsByStudent[sid] = [];
      enrollmentsByStudent[sid].push(enrollment);
    }

    let generated = 0;
    let skipped = 0;
    const errors: any[] = [];
    const generatedList: { name: string; amount: number; count: number; extrasOnly?: boolean; cutoffNote?: string }[] = [];
    const generatedInvoices: { id: string; studentId: string; lineItemsExtra: any[]; finalAmount: number }[] = [];
    // Year-end bookkeeping for the Telegram summary (names, grouped — one line
    // each instead of a per-student skip flag).
    const arrearsDeferred: string[] = [];     // advance run: month is arrears-billed for them
    const combinedDeferred: string[] = [];    // advance run: January rides on the 1 Jan combined invoice
    const examEnded: string[] = [];           // advance run: cut-off before the month started
    const missingCutoffYears = new Set<number>();
    let arrearsNothingToBill = 0;             // arrears run: 0 attended, 0 extras (silent)
    // Structured skip log: shows up in Fly/Vercel logs AND in the Telegram
    // summary so missing students can be triaged without opening the DB.
    const skipReasons: { name: string; reason: string }[] = [];
    const recordSkip = (id: string, reason: string) => {
      const name = studentsById[id]?.fields?.['Student Name'] || id;
      skipReasons.push({ name, reason });
      console.warn(`[generate-invoices] SKIP ${name}: ${reason}`);
    };

    // June Revision Mode (toggle in Settings): when ON, students who signed up for the
    // June revision sprint are billed via their revision invoice (created by the sign-up
    // flow), so we SKIP their regular June invoice here. Per-year field: "June Revision <year>".
    const isJune = invoiceMonth.month === 6;
    let juneRevisionMode = false;
    if (isJune) {
      const rs = await airtableRequestAll('Settings',
        `?filterByFormula=${encodeURIComponent(`{Setting Name}='june_revision_mode'`)}`
      ).catch(() => ({ records: [] }));
      juneRevisionMode = rs.records?.[0]?.fields?.['Value'] === 'true';
      console.log(`[generate-invoices] June Revision Mode: ${juneRevisionMode ? 'ON' : 'off'}`);
    }

    // ── Billable Additional lessons — ONE window fetch for ALL students ─────
    // Fetched by Type/Status/Date only and matched to students in JS
    // (lib/additional-lessons.ts). The old per-student formula filtered on
    // {Student}='recXXX', which matches NOTHING on a linked field — every
    // Additional lesson since launch went unbilled (0 of 315 invoices ever
    // carried one; found 2026-07-26). Date upper bound is half-open (the <=
    // form silently drops the boundary day on date-typed fields).
    // The Billed checkbox is the PRIMARY double-billing guard (a lesson billed
    // on a manual adjustment invoice must never be auto-billed again; windows
    // alone can't know that). The field may not exist yet — an unknown name in
    // fields[] 422s the request, so fall back without it and WARN in the
    // Telegram summary rather than fail the run.
    let additionalPool: AdditionalLessonRecord[] = [];
    let billedFieldMissing = false;
    // Arrears sweep cut (exclusive): the first day after the bill month.
    let addBeforeISO = '';
    if (mode === 'arrears') {
      // Three months back, so an extra that fell between two runs is never
      // stranded; the Billed checkbox stops any of it billing twice.
      const sweep = await fetchSweepAdditionalPool(target!.billYear, target!.billMonth);
      additionalPool = sweep.pool;
      billedFieldMissing = sweep.billedFieldMissing;
      addBeforeISO = sweep.beforeISO;
    } else {
      const addToday = new Date();
      const addWindowEnd = formatDate(addToday);
      const addWindowStart = formatDate(new Date(addToday.getFullYear(), addToday.getMonth() - 1, 15));
      const additionalBaseQ = `?filterByFormula=${encodeURIComponent(`AND({Type}='Additional',{Status}='Completed',{Date}>='${addWindowStart}',{Date}<'${nextDayISO(addWindowEnd)}')`)}&fields[]=Date&fields[]=Student&fields[]=Is Revision Makeup&fields[]=Notes`;
      additionalPool = await airtableRequestAll('Lessons', additionalBaseQ + `&fields[]=Billed`)
        .catch(async () => {
          billedFieldMissing = true;
          return airtableRequestAll('Lessons', additionalBaseQ).catch(() => ({ records: [] as any[] }));
        })
        .then((d: any) => (d.records || []).map(mapAdditionalRecord));
    }
    const billedLessonPatches: string[] = [];

    // ── Arrears run inputs — ONE window fetch for ALL students ──────────────
    // The bill month's attended (Completed Regular/Rescheduled) lessons, and
    // the months each student already holds an invoice for (a lesson moved in
    // from an advance-billed month was paid inside that month's invoice —
    // lib/year-end-billing.ts paidInAdvance). Never a {Student} clause: on a
    // linked field it matches nothing (the bug that left the old prorated
    // branch finding 0 lessons for every student until 2026-09-02).
    const arrearsPool: ArrearsLessonRecord[] = mode === 'arrears'
      ? await fetchArrearsPool(target!.billYear, target!.billMonth)
      : [];
    const invoicedMonthsByStudent: Map<string, Set<string>> = mode === 'arrears'
      ? await fetchInvoicedMonthsByStudent()
      : new Map();
    if (mode === 'arrears') {
      console.log(`[generate-invoices] arrears pool: ${arrearsPool.length} attended lessons in ${target!.billLabel}; ${additionalPool.length} additional candidates`);
    }
    // The bill month's regular lessons still 'Scheduled' — attendance never
    // marked, so the run cannot bill them. Listed in the summary: mark them
    // Completed, then Regenerate the invoice. (Fail-soft: a fetch error just
    // leaves the list empty.)
    const unmarked: Map<string, string[]> = mode === 'arrears'
      ? unmarkedByStudent(await fetchUnmarkedArrearsPool(target!.billYear, target!.billMonth).catch(() => []))
      : new Map();
    const unmarkedList: { name: string; dates: string[] }[] = [];
    // Exam-year students the arrears run met (they are advance-billed; the
    // run only drafts what the advance lane never covered — held for review).
    const examYearAttended: string[] = [];   // "Name (3)" — attended lessons drafted, no advance invoice
    const examYearActive: string[] = [];     // combined run: still Active, deliberately NOT projected into January

    for (const studentId in enrollmentsByStudent) {
      const studentEnrollments = enrollmentsByStudent[studentId];
      const student = studentsById[studentId];
      if (!student) {
        skipped += studentEnrollments.length;
        recordSkip(studentId, 'student record not found (broken linked record)');
        continue;
      }
      const studentName: string = student.fields['Student Name'] || studentId;
      const profile: StudentBillingProfile = {
        level: student.fields['Level'] || '',
        subjects: Array.isArray(student.fields['Subjects']) ? student.fields['Subjects'] : [],
        subjectLevel: student.fields['Subject Level'] || '',
      };

      try {
        // Which invoices this student already holds for the label.
        const heldTypes = existingTypesByStudent.get(studentId) ?? new Set<string>();

        if (mode === 'advance') {
          if (existingStudentIds.has(studentId)) {
            skipped += studentEnrollments.length;
            // Not surfaced in skipReasons — this is the normal "already has
            // an invoice for this month" case and is expected.
            continue;
          }

          // June Revision Mode: signed-up students get a revision invoice instead of a regular one.
          if (isJune && juneRevisionMode && student.fields[`June Revision ${invoiceMonth.year}`] === 'Signed Up') {
            skipped += studentEnrollments.length;
            recordSkip(studentId, 'June revision sprint — billed via revision invoice (regular skipped)');
            continue;
          }

          // Year-end: an arrears-billed month gets NOTHING from the advance
          // run — not even an extras-only invoice (that would pre-empt the
          // real run: one invoice per student per month). January for these
          // students rides on the combined 1 Jan invoice.
          if (billingModeFor(profile, invoiceMonth.month) === 'arrears') {
            skipped += studentEnrollments.length;
            arrearsDeferred.push(studentName);
            continue;
          }
          if (isCombinedJanuary(profile, invoiceMonth.month)) {
            skipped += studentEnrollments.length;
            combinedDeferred.push(studentName);
            continue;
          }
        } else if (heldTypes.has('Adjustment')) {
          // A previous arrears run already swept this student's extras for
          // the label; the Billed checkbox would stop a double anyway.
          skipped += studentEnrollments.length;
          continue;
        }

        // Use each enrollment's own rate; fall back across enrollments for skip check
        const anyRate = studentEnrollments.some((e: any) => e.fields['Rate Per Lesson'] > 0);
        if (!anyRate) {
          skipped++;
          recordSkip(studentId, 'Rate Per Lesson is 0 or blank on all enrollments');
          continue;
        }
        // Primary rate (first enrollment with a non-zero rate) — used for Additional lessons & invoice header
        const ratePerLesson = studentEnrollments.find((e: any) => e.fields['Rate Per Lesson'] > 0)?.fields['Rate Per Lesson'] || 0;

        // Exam-year cut-off (lib/year-end-billing.ts EXAM_CUTOFFS): the last
        // national Maths paper ends the lessons; End Date still wins if earlier.
        const cutoff = examCutoffFor(profile, invoiceMonth.year);
        if (isExamYearStudent(profile) && !cutoff && invoiceMonth.month >= 10) missingCutoffYears.add(invoiceMonth.year);

        // Each enrollment's slot, resolved once: label, weekday, rate, end.
        const slots: SlotLine[] = [];
        for (const enrollment of studentEnrollments) {
          const slotId: string | null = enrollment.fields['Slot']?.[0] ?? null;
          const slot = slotId ? slotsById[slotId] : null;
          const dayRaw = slot?.fields['Day'] || '';
          const dayName = dayRaw.replace(/^\d+\s+/, '').trim();
          const dayAbbrev = DAY_ABBREV[dayName] || dayName;
          const slotTime = (slot?.fields['Time'] || '').trim();
          const dayLabel = slotTime ? `${dayAbbrev} ${slotTime}` : dayAbbrev;
          // An Ended enrollment with no End Date must not project into the
          // future — clamp it to the bill month.
          const enrollEnd = (enrollment.fields['End Date'] as string | undefined)
            || (enrollment.fields['Status'] === 'Ended' ? billMonthLastISO : null);
          slots.push({
            slotId,
            dayLabel,
            weekday: slot ? DAY_INDICES[dayName] : undefined,
            rate: enrollment.fields['Rate Per Lesson'] || ratePerLesson,
            endISO: effectiveEndISO(enrollEnd, cutoff?.iso),
          });
        }

        const descBase = descriptionBase(profile.level, profile.subjects);
        const lineItemsForInvoice: any[] = [];
        let lessonCount = 0;
        let baseAmount = 0;
        let additionalLessons: AdditionalLessonRecord[] = [];
        let extrasOnly = false;
        let cutoffNote = '';
        let reviewNote = '';

        if (mode === 'advance') {
          if (cutoff && cutoff.iso < monthFirstISO) {
            // Exams finished before this month started — no invoice at all.
            skipped += studentEnrollments.length;
            examEnded.push(`${studentName} (${humanDate(cutoff.iso)})`);
            continue;
          }

          let hasLessons = false;
          const description = `${descBase} — ${invoiceMonth.label}`;
          for (const s of slots) {
            if (s.weekday === undefined) continue;
            const dates = invoiceMonthLessonDates(monthFirstISO, s.weekday, s.endISO, NO_LESSON_DATES);
            if (dates.length > 0) hasLessons = true;
            for (const date of dates) {
              lineItemsForInvoice.push({ date, day: s.dayLabel, type: 'Regular', description, rate: s.rate || ratePerLesson });
            }
          }

          if (!hasLessons) {
            skipped += studentEnrollments.length;
            // Enumerate why: usually a stale Slot link or blank Slot.Day.
            const slotDiagnostics = studentEnrollments.map((enr) => {
              const slotId = enr.fields['Slot']?.[0];
              const slot = slotId ? slotsById[slotId] : null;
              if (!slotId) return 'no Slot link on enrollment';
              if (!slot) return `Slot ${slotId} not in fetched Slots set (deleted or past pagination)`;
              const day = (slot.fields['Day'] || '').toString().replace(/^\d+\s+/, '').trim();
              if (!day) return `Slot ${slotId} has blank Day`;
              const endDate = enr.fields['End Date'];
              if (endDate && new Date(endDate) < invoiceMonth.firstDay) {
                return `enrollment End Date ${endDate} is before ${invoiceMonth.label}`;
              }
              return `Slot ${slotId} Day='${day}' yielded 0 occurrences`;
            });
            recordSkip(studentId, `no lessons in ${invoiceMonth.label} — ${slotDiagnostics.join('; ')}`);
            continue;
          }
          lineItemsForInvoice.sort((a, b) => a.date.localeCompare(b.date));
          lessonCount = lineItemsForInvoice.length;
          // Per-enrollment rates (handles multi-rate students).
          baseAmount = sumLineRates(lineItemsForInvoice, ratePerLesson);

          // Revision makeups excluded inside the lib (already-paid sprint sessions).
          additionalLessons = billableAdditionalFor(additionalPool, studentId);
          additionalLessons.forEach((r) => {
            lineItemsForInvoice.push({
              date: r.date, day: '', type: 'Additional',
              description: `Additional Lesson — ${invoiceMonth.label}`,
            });
          });

          // The cut-off shortened this month (and no End Date cut it shorter):
          // tell the parent on the invoice. Auto Notes also makes the send
          // cron HOLD it for Adrian's review — deliberate in the first year.
          const cutoffBinding = !!cutoff && cutoff.iso >= monthFirstISO && cutoff.iso <= monthLastISO
            && slots.every((s) => !s.endISO || s.endISO >= cutoff.iso);
          if (cutoffBinding && cutoff) cutoffNote = examCutoffNote(cutoff);
        } else {
          // ── Arrears: what was actually attended ─────────────────────────
          const regularBilled = heldTypes.has('Regular') || heldTypes.has('Enrollment');
          const ctx = { ...profile, invoicedMonths: invoicedMonthsByStudent.get(studentId) ?? new Set<string>() };
          const attended = regularBilled
            ? []
            : attendedLessonLines(arrearsPool, studentId, ctx, { descriptionBase: descBase, billLabel: target!.billLabel, slots, defaultRate: ratePerLesson });
          // Combined January: December attended above, January projected here
          // — for the arrears lane only. An exam-year student (exams over, so
          // no advance January invoice) is never projected into January: if
          // they carry on, Adrian bumps the Level / ends the enrollment and
          // regenerates. Still-Active ones are listed in the summary.
          const examYear = isExamYearStudent(profile);
          const projected = !regularBilled && !examYear && target!.projectInvoiceMonth
            ? projectedLessonLines(monthFirstISO, { descriptionBase: descBase, label: invoiceMonth.label, slots, defaultRate: ratePerLesson, excluded: NO_LESSON_DATES })
            : [];
          if (examYear && !regularBilled && target!.projectInvoiceMonth
              && slots.some((s) => s.weekday !== undefined && (!s.endISO || s.endISO >= monthFirstISO))) {
            examYearActive.push(studentName);
          }
          additionalLessons = sweepAdditionalFor(additionalPool, studentId, addBeforeISO);
          if (!regularBilled && unmarked.has(studentId)) unmarkedList.push({ name: studentName, dates: unmarked.get(studentId)! });

          const regularLines = [...attended, ...projected];
          if (!regularLines.length && !additionalLessons.length) {
            // Nothing attended, nothing extra — silent (one summary count).
            skipped += studentEnrollments.length;
            arrearsNothingToBill++;
            continue;
          }
          extrasOnly = regularLines.length === 0;
          // An exam-year student is billed in advance; attended lessons the
          // advance lane never covered (no advance invoice for the month, yet
          // lessons were marked Completed) are still drafted — with a note, so
          // the send cron HOLDS the invoice for Adrian instead of auto-sending.
          if (examYear && attended.length) {
            reviewNote = attendedReviewNote(target!.billLabel);
            examYearAttended.push(`${studentName} (${attended.length})`);
          }
          lineItemsForInvoice.push(...regularLines, ...additionalLessonLines(additionalLessons, ratePerLesson));
          lessonCount = regularLines.length;
          baseAmount = sumLineRates(regularLines, ratePerLesson);
        }

        const additionalCount = additionalLessons.length;
        const additionalAmount = additionalCount * ratePerLesson;
        const finalAmount = baseAmount + additionalAmount;

        // ── Per-month model (was: carry-forward) ────────────────────────
        // Each invoice carries ONLY its own month. Prior unpaid months stay open as
        // their own invoices and are shown together at render time (consolidated PDF
        // + admin view) — NOT rolled into this invoice. No lump line, no settling
        // of prior invoices, no carry note. carryOverLineItems stays [] so the
        // downstream PDF/tracking code needs no change.
        const carryOverLineItems: any[] = [];
        const totalFinalAmount = finalAmount;
        // Additional lessons render as ONE grouped line item; the individual
        // dates go in Auto Notes, which prints on the PDF (Adrian 2026-07-26).
        const extrasNote = additionalLessons.length
          ? `Additional lessons: ${additionalLessons.map(l =>
              new Date(l.date + 'T00:00:00Z').toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
            ).join(', ')}`
          : '';
        const autoNotes = [extrasNote, cutoffNote, reviewNote].filter(Boolean).join('\n\n');

        // Dates: an advance invoice is issued on the 15th (its send day) and
        // due on the 15th of the month it covers; an arrears invoice is issued
        // on the 2nd (its send day — or today, for a late manual run) and due
        // 7 days later (lib/year-end-billing.ts invoiceDueDateISO).
        const issueISO = mode === 'arrears'
          ? (() => { const sendDay = `${firstOfNextMonthISO(billMonthFirstISO).slice(0, 8)}02`; return todayISO > sendDay ? todayISO : sendDay; })()
          : (() => { const d = new Date(); d.setDate(15); return formatDate(d); })();
        const dueISO = invoiceDueDateISO(mode, invoiceMonth.year, invoiceMonth.month, issueISO);

        const invoiceFields: Record<string, any> = {
          'Student': [studentId],
          'Month': invoiceMonth.label,
          'Lessons Count': lessonCount,
          'Rate Per Lesson': ratePerLesson,
          'Adjustment Amount': additionalAmount,
          ...(additionalAmount > 0 ? { 'Adjustment Notes': `Additional lessons: ${additionalCount} \u00d7 ${ratePerLesson}` } : {}),
          'Final Amount': totalFinalAmount,
          // Nothing owed (e.g. fully offset by a credit) → mark paid, not "Unpaid".
          'Is Paid': totalFinalAmount <= 0.005,
          'Line Items': JSON.stringify(lineItemsForInvoice),
          'Line Items Extra': carryOverLineItems.length > 0 ? JSON.stringify(carryOverLineItems) : '',
          // Extras-only (the student's lessons for the label are already on
          // another invoice) → Adjustment, which the send cron holds for review.
          'Invoice Type': extrasOnly ? 'Adjustment' : 'Regular',
          'Status': 'Draft',
          'Issue Date': issueISO,
          'Due Date': dueISO,
          'Auto Notes': autoNotes,
        };

        const createdRecord = await at('Invoices', '', {
          method: 'POST',
          body: JSON.stringify({ fields: invoiceFields }),
        });

        // Mark the invoiced Additional lessons Billed so no future run can
        // bill them again (skipped gracefully while the field doesn't exist).
        if (!billedFieldMissing && additionalLessons.length) {
          await Promise.all(additionalLessons.map(l =>
            at('Lessons', `/${l.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Billed: true } }) })
              .then(() => { billedLessonPatches.push(l.date); })
              .catch(() => { /* metadata write must never fail the invoice */ })
          ));
        }


        // Generate and upload PDF in production only
        if (process.env.VERCEL === '1') {
          try {
            const invoiceData = {
              studentName: student.fields['Student Name'],
              // "December–January 2027" on the combined invoice; the stored
              // Month stays canonical (consolidation fails closed on spans).
              month: displaySpanMonth(invoiceMonth.label, JSON.stringify(lineItemsForInvoice)),
              invoiceId: createdRecord.id,
              issueDate: issueISO,
              dueDate: dueISO,
              lessonsCount: lessonCount,
              ratePerLesson,
              baseAmount,
              finalAmount: totalFinalAmount,
              status: 'Pending',
              makeupCredits: 0,
              // Carry-over breakdown is stored in Airtable Auto Notes for admin reference,
              // but suppressed from the parent-facing PDF — they can view the prior invoice if needed.
              notes: '',
              lineItems: lineItemsForInvoice,
              lineItemsExtra: carryOverLineItems,
              registerUrl: buildRegisterUrl(studentId),
            };
            await applyPriorBalance(invoiceData, studentId, invoiceMonth.label);
            const pdfBuffer = await generateInvoicePDF(invoiceData);
            const uploadRes = await fetch(
              `https://content.airtableapi.com/v0/${AIRTABLE_BASE_ID}/Invoices/${createdRecord.id}/uploadAttachment`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
                  'Content-Type': 'application/octet-stream',
                  'X-Airtable-Attachment-Filename': `Invoice-${student.fields['Student Name']}-${invoiceMonth.label}.pdf`,
                  'X-Airtable-Field-Name': 'Invoice PDF',
                },
                body: pdfBuffer as unknown as BodyInit,
              }
            );
            if (!uploadRes.ok) throw new Error('Airtable upload failed: ' + await uploadRes.text());
          } catch (pdfError: any) {
            console.error('[generate-invoices] PDF error:', pdfError.message);
          }
        }

        generatedList.push({ name: student.fields['Student Name'], amount: finalAmount, count: lessonCount, extrasOnly, cutoffNote });
        generatedInvoices.push({ id: createdRecord.id, studentId, lineItemsExtra: carryOverLineItems, finalAmount: totalFinalAmount });
        generated++;
      } catch (err: any) {
        const studentName = student?.fields?.['Student Name'] || 'Unknown';
        errors.push({ student: studentName, error: err.message });
      }
    }

    await closeBrowser();

    // ── Referral reward check ──────────────────────────────────────────────
    const referralRewards: any[] = [];
    try {
      const referralFormula = encodeURIComponent(
        `AND({How Heard}='Referral', NOT({Referral Reward Applied}), {Status}='Active')`
      );
      const referralStudents = await airtableRequestAll('Students',
        `?filterByFormula=${referralFormula}&fields[]=Student Name&fields[]=Referral Type&fields[]=Referred By Name&fields[]=Referral Reward Applied`
      );

      if (referralStudents.records.length > 0) {
        // Fetch all active students once for fuzzy matching
        const allActiveStudents = await airtableRequestAll('Students',
          `?filterByFormula=${encodeURIComponent("{Status}='Active'")}&fields[]=Student Name`
        );

        for (const student of referralStudents.records) {
          const newStudentName = student.fields['Student Name'] || '';
          const referrerName = (student.fields['Referred By Name'] || '') as string;
          const referralType = (student.fields['Referral Type'] || '') as string;

          // Count completed lessons for this referred student.
          // NOTE: Cannot use {Student}='recXXX' on linked record fields — filter in JS instead.
          const lessonsData = await airtableRequestAll('Lessons',
            `?filterByFormula=${encodeURIComponent(`AND({Status}='Completed',{Type}!='Trial')`)}&fields[]=Student&fields[]=Type`
          );
          const completedCount = lessonsData.records.filter(
            (r: any) => r.fields['Student']?.[0] === student.id
          ).length;

          if (completedCount < 12) continue; // Not yet eligible

          if (referralType === 'Current Student') {
            // Referral-LINK first (lib/referral-link.ts): signups via /r/<recId>
            // carry the referrer's record id as a "[recXXX]" marker inside
            // Referred By Name — an exact link, no guessing. Fuzzy name-matching
            // stays as the fallback for plainly typed names (pre-link rows).
            const { name: referrerPlainName, recId: referrerRecId } = parseReferrerMarker(referrerName);
            let matchedReferrer: any = null;
            let matchConfidence = 'none';
            if (referrerRecId) {
              matchedReferrer = allActiveStudents.records.find((s: any) => s.id === referrerRecId) || null;
              if (matchedReferrer) matchConfidence = 'exact';
              // Marker present but referrer no longer active → fall through to
              // fuzzy on the plain name, which will surface for manual review.
            }

            if (!matchedReferrer) {
            // Fuzzy match referrer name against active students
            const referrerNameLower = referrerPlainName.toLowerCase().trim();

            // Score every candidate by shared name-words and pick the UNIQUE best match.
            // (The old first-shared-word-wins logic mis-resolved partial names on common
            // surnames — e.g. "Abel Tan" → "Kiara Tan" instead of "Abel Tan Zhi Yi".)
            const referrerWords = referrerNameLower.split(/\s+/).filter((w: string) => w.length > 1);
            let bestScore = 0, runnerUp = 0;
            for (const s of allActiveStudents.records) {
              const name = ((s.fields['Student Name'] || '') as string).toLowerCase();
              if (name === referrerNameLower) {
                matchedReferrer = s; matchConfidence = 'exact'; bestScore = 99; break;
              }
              const nameWords = name.split(/\s+/);
              const shared = referrerWords.filter((w: string) => nameWords.includes(w)).length;
              if (shared > bestScore) { runnerUp = bestScore; bestScore = shared; matchedReferrer = s; }
              else if (shared > runnerUp) { runnerUp = shared; }
            }
            // Confidence gate: accept only a clear winner — exact, or every given-name word matched,
            // or >=2 shared words — that strictly beats the runner-up. Otherwise leave unmatched so it
            // surfaces for manual review rather than crediting the wrong person on a shared surname.
            if (matchConfidence !== 'exact') {
              const allWordsMatched = bestScore >= 1 && bestScore === referrerWords.length;
              if (matchedReferrer && bestScore > runnerUp && (allWordsMatched || bestScore >= 2)) {
                matchConfidence = 'fuzzy';
              } else {
                matchedReferrer = null; matchConfidence = 'none';
              }
            }
            } // end fuzzy fallback

            if (matchedReferrer) {
              // Find referrer's enrollment to get rate
              // Fetch active enrollments and match by student in JS (linked record filter workaround)
              const enrollData = await airtableRequestAll('Enrollments',
                `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Rate Per Lesson`
              );
              const referrerEnrollment = enrollData.records.find(
                (r: any) => r.fields['Student']?.[0] === matchedReferrer.id
              );
              const ratePerLesson = (referrerEnrollment?.fields['Rate Per Lesson'] as number) || 0;
              const rewardAmount = ratePerLesson * 4;

              // Find the referrer's invoice (from this batch or existing for the month)
              const referrerInvoice = generatedInvoices.find((inv) => inv.studentId === matchedReferrer.id);
              if (referrerInvoice) {
                const existingExtra = Array.isArray(referrerInvoice.lineItemsExtra)
                  ? [...referrerInvoice.lineItemsExtra]
                  : [];
                existingExtra.push({
                  description: `Referral reward${matchConfidence === 'fuzzy' ? ' \u26a0 fuzzy match' : ''} \u2014 referred ${newStudentName}`,
                  amount: -rewardAmount,
                  matchConfidence,
                  referrerNameGiven: referrerName,
                });
                const newFinalAmount = Math.max(0, referrerInvoice.finalAmount - rewardAmount);
                const referralNote = `Thank you so much for referring ${newStudentName} to us! 🎉 As a token of our appreciation, we've applied a complimentary month of lessons to this invoice.`;

                await airtableRequest('Invoices', `/${referrerInvoice.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ fields: {
                    'Line Items Extra': JSON.stringify(existingExtra),
                    'Final Amount': newFinalAmount,
                    // Credit fully offsets the invoice → nothing owed → mark paid.
                    ...(newFinalAmount <= 0.005 ? { 'Is Paid': true } : {}),
                    'Auto Notes': referralNote,
                  }}),
                });

                // Update local tracking to prevent double-applying if another referred student points to same referrer
                referrerInvoice.lineItemsExtra = existingExtra;
                referrerInvoice.finalAmount = newFinalAmount;
              }

              // Mark referral as applied (even if invoice not in this batch — avoids re-triggering next month)
              await airtableRequest('Students', `/${student.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ fields: { 'Referral Reward Applied': true } }),
              });

              referralRewards.push({
                newStudent: newStudentName,
                referrer: matchedReferrer.fields['Student Name'],
                reward: rewardAmount,
                type: 'invoice_credit',
                confidence: matchConfidence,
                invoiceFound: !!referrerInvoice,
              });
            } else {
              // Could not match referrer — flag for admin (do NOT mark as applied)
              referralRewards.push({
                newStudent: newStudentName,
                referrerName,
                type: 'unmatched',
                confidence: 'none',
              });
            }
          } else {
            // Past student / parent / other — cash reminder
            referralRewards.push({
              newStudent: newStudentName,
              referrerName,
              referralType,
              reward: 150,
              type: 'cash_reminder',
            });

            await airtableRequest('Students', `/${student.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ fields: { 'Referral Reward Applied': true } }),
            });
          }
        }
      }
    } catch (referralErr: any) {
      console.error('[generate-invoices] Referral reward check error:', referralErr.message);
    }

    // ── Deferred adjustments ───────────────────────────────────────────────
    // Admin (or the invoice AI assistant) can park a credit/charge on a
    // student's current invoice with a target month. When that month is
    // generated, apply it to the new invoice and tick Deferred Applied so it
    // only ever lands once. See CLAUDE.md > Deferred Adjustments.
    const deferredResults: { name: string; amount: number; applied: boolean; note: string }[] = [];
    try {
      const deferredFormula = encodeURIComponent(
        `AND({Deferred To Month}='${invoiceMonth.label}', NOT({Deferred Applied}), {Deferred Amount})`
      );
      const carriers = await airtableRequestAll('Invoices',
        `?filterByFormula=${deferredFormula}&fields[]=Student&fields[]=Deferred Amount&fields[]=Deferred Note&fields[]=Deferred To Month`
      );

      for (const carrier of carriers.records || []) {
       try {
        const sid = carrier.fields['Student']?.[0];
        const amount: number = carrier.fields['Deferred Amount'] || 0;
        const note: string = (carrier.fields['Deferred Note'] || '').toString();
        const name = sid ? (studentsById[sid]?.fields?.['Student Name'] || sid) : '(unknown)';
        if (!sid || amount === 0) continue;

        // Find this student's invoice for the month being generated:
        // prefer one created in this batch, else an existing one for the month.
        let targetId = generatedInvoices.find((inv) => inv.studentId === sid)?.id || null;
        if (!targetId) {
          const existing = existingInvoicesData.records.find((r: any) => r.fields['Student']?.[0] === sid);
          targetId = existing?.id || null;
        }
        if (!targetId) {
          // No invoice this month to attach to — leave unapplied so it surfaces again next run.
          deferredResults.push({ name, amount, applied: false, note });
          continue;
        }

        // Fresh read so we stack on top of (not clobber) referral credits / other extras.
        const inv = await at('Invoices', `/${targetId}`);
        const existingExtra = inv.fields['Line Items Extra']
          ? JSON.parse(inv.fields['Line Items Extra'])
          : [];
        existingExtra.push({
          description: note || `Adjustment carried forward from ${carrier.fields['Deferred To Month'] || ''}`.trim(),
          amount: parseFloat(amount.toFixed(2)),
        });
        const newFinal = Math.max(0, (inv.fields['Final Amount'] || 0) + amount);
        const prevNotes = (inv.fields['Auto Notes'] || '').toString();
        const sign = amount >= 0 ? '+' : '−';
        const noteLine = `${note || 'Deferred adjustment'} (${sign}$${Math.abs(amount).toFixed(2)})`;
        const newNotes = prevNotes ? `${prevNotes}\n\n${noteLine}` : noteLine;

        await at('Invoices', `/${targetId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: {
            'Line Items Extra': JSON.stringify(existingExtra),
            'Final Amount': newFinal,
            'Auto Notes': newNotes,
          }}),
        });
        // Tick the carrier so it never applies twice.
        await at('Invoices', `/${carrier.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { 'Deferred Applied': true } }),
        });

        // Keep in-memory batch state consistent for any later steps.
        const gen = generatedInvoices.find((g) => g.id === targetId);
        if (gen) { gen.finalAmount = newFinal; gen.lineItemsExtra = existingExtra; }

        deferredResults.push({ name, amount, applied: true, note });
       } catch (oneErr: any) {
        console.error('[generate-invoices] Deferred adjustment (single record) error:', oneErr.message);
       }
      }
    } catch (deferredErr: any) {
      console.error('[generate-invoices] Deferred adjustment error:', deferredErr.message);
    }

    const summaryLines = generatedList
      .map((g) => g.extrasOnly
        ? `${g.name} \u2014 ${g.amount.toFixed(2)} (extras only \u2014 held for review)`
        : `${g.name} \u2014 ${g.amount.toFixed(2)} (${g.count} lesson${g.count !== 1 ? 's' : ''})${g.cutoffNote ? ' \u{1F393}' : ''}`)
      .join('\n');
    const totalAmount = generatedList.reduce((sum, g) => sum + g.amount, 0);

    // Year-end lines \u2014 grouped, one per reason (lib/year-end-billing.ts).
    const listNames = (names: string[]) => names.join(', ');
    let yearEndSection = '';
    if (arrearsDeferred.length) {
      yearEndSection += `\n\n\u23f3 <b>Billed in arrears on the 1st (${arrearsDeferred.length})</b> \u2014 attended lessons only, nothing drafted now:\n${listNames(arrearsDeferred)}`;
    }
    if (combinedDeferred.length) {
      yearEndSection += `\n\n\u23f3 <b>December + January combined on 1 Jan (${combinedDeferred.length})</b> \u2014 nothing drafted now:\n${listNames(combinedDeferred)}`;
    }
    if (examEnded.length) {
      yearEndSection += `\n\n\u{1F393} <b>Exams over \u2014 no ${invoiceMonth.label} invoice (${examEnded.length})</b>:\n${listNames(examEnded)}`;
    }
    const cutShort = generatedList.filter((g) => g.cutoffNote);
    if (cutShort.length) {
      yearEndSection += `\n\n\u{1F393} <b>Cut short at the exams (${cutShort.length})</b> \u2014 the invoice says so; HELD for your review:\n${cutShort.map((g) => `\u2022 ${g.name}: ${g.cutoffNote}`).join('\n')}`;
    }
    if (missingCutoffYears.size) {
      yearEndSection += `\n\n\u26a0\ufe0f <b>No exam cut-off table for ${[...missingCutoffYears].join(', ')}</b> in lib/year-end-billing.ts \u2014 exam-year invoices ran to month end / End Date. Add the SEAB dates.`;
    }
    if (mode === 'arrears' && arrearsNothingToBill) {
      yearEndSection += `\n\n${arrearsNothingToBill} student${arrearsNothingToBill === 1 ? '' : 's'} had nothing to bill (0 attended, 0 extras).`;
    }
    if (examYearAttended.length) {
      yearEndSection += `\n\n\u{1F393} <b>Exam-year students with attended ${target!.billLabel} lessons and no advance invoice (${examYearAttended.length})</b> — drafted from attendance; HELD for your review:\n${listNames(examYearAttended)}`;
    }
    if (examYearActive.length) {
      yearEndSection += `\n\n\u{1F393} <b>Exam-year students still Active — no ${invoiceMonth.label} lines drafted (${examYearActive.length})</b>:\n${listNames(examYearActive)}\nEnd the enrollment, or bump the Level and Regenerate.`;
    }
    if (unmarkedList.length) {
      const n = unmarkedList.reduce((s, u) => s + u.dates.length, 0);
      yearEndSection += `\n\n❓ <b>${n} ${target!.billLabel} lesson${n === 1 ? '' : 's'} still Scheduled (${unmarkedList.length} student${unmarkedList.length === 1 ? '' : 's'})</b> — NOT billed until marked Completed; then Regenerate:\n${unmarkedList.map((u) => `• ${u.name}: ${u.dates.map(shortDate).join(', ')}`).join('\n')}`;
    }

    // Surface skip reasons so Zane/Xavier-style "missing invoice" issues are
    // visible in the Telegram summary, not just the server logs.
    const skipSection = skipReasons.length
      ? `\n\n\u26A0\uFE0F <b>Skipped with a flag (${skipReasons.length}):</b>\n` +
          skipReasons.map((s) => `\u2022 ${s.name} \u2014 ${s.reason}`).join('\n')
      : '';

    let referralSection = '';
    if (referralRewards.length > 0) {
      referralSection = '\n\n\uD83C\uDF81 <b>Referral Rewards</b>\n';
      for (const r of referralRewards) {
        if (r.type === 'invoice_credit') {
          const badge = r.confidence === 'exact' ? '\u2705' : '\u26A0\uFE0F fuzzy match';
          const invoiceNote = r.invoiceFound ? '' : ' (invoice not in this batch \u2014 check manually)';
          referralSection += `${badge} ${r.referrer} gets -$${(r.reward as number).toFixed(2)} (referred ${r.newStudent})${invoiceNote}\n`;
        } else if (r.type === 'cash_reminder') {
          referralSection += `\uD83D\uDCB5 Transfer $${r.reward} to ${r.referrerName} (${r.referralType}) \u2014 referred ${r.newStudent}\n`;
        } else if (r.type === 'unmatched') {
          referralSection += `\u274C Could not match referrer "${r.referrerName}" for ${r.newStudent} \u2014 please check manually\n`;
        }
      }
    }

    let deferredSection = '';
    if (deferredResults.length > 0) {
      deferredSection = '\n\n\u23f0 <b>Deferred adjustments</b>\n';
      for (const d of deferredResults) {
        const sign = d.amount >= 0 ? '+' : '\u2212';
        const amt = `${sign}$${Math.abs(d.amount).toFixed(2)}`;
        deferredSection += d.applied
          ? `\u2705 ${d.name}: ${amt} applied${d.note ? ` \u2014 ${d.note}` : ''}\n`
          : `\u26a0\ufe0f ${d.name}: ${amt} pending \u2014 no ${invoiceMonth.label} invoice to attach to, apply manually\n`;
      }
    }

    // Billed-marker status: warn loudly if the guard is off, note write-backs.
    const billedSection = billedFieldMissing && additionalPool.length
      ? `\n\n\u26a0\ufe0f <b>Billed checkbox missing on Lessons</b> \u2014 additional lessons were billed by date-window only; create the field so nothing can double-bill.`
      : billedLessonPatches.length
        ? `\n\n\u2705 Marked ${billedLessonPatches.length} additional lesson${billedLessonPatches.length === 1 ? '' : 's'} as Billed.`
        : '';

    const header = mode === 'arrears'
      ? (target!.projectInvoiceMonth
          ? `\ud83d\udccb <b>Arrears invoices ready \u2014 ${target!.billLabel} attended + ${target!.invoiceLabel} ahead</b>`
          : `\ud83d\udccb <b>Arrears invoices ready \u2014 ${target!.billLabel} (lessons attended)</b>`)
      : `\ud83d\udccb <b>Draft invoices ready \u2014 ${invoiceMonth.label}</b>`;
    const footer = mode === 'arrears'
      ? `\n\nReview and hold any via /amend [name].\nInvoices send automatically at 10am on the 2nd.`
      : `\n\nReview and hold any before 15th via /amend [name].\nInvoices send automatically at 10am tomorrow.`;
    await notify_money(
      `${header}\n\n` +
        `${summaryLines || '(none)'}\n\n` +
        `Total: ${generated} invoices \u00b7 ${totalAmount.toFixed(2)}` +
        yearEndSection +
        skipSection +
        referralSection +
        deferredSection +
        billedSection +
        footer
    );

    await logJobRun(jobName, errors.length === 0, `${runLabel}: generated ${generated}, skipped ${skipped}${errors.length ? `, ${errors.length} errors` : ''}`);
    return NextResponse.json({ mode, month: invoiceMonth.label, generated, skipped, errors, skipReasons, unmarked: unmarkedList });
  } catch (err: any) {
    console.error('[generate-invoices] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
