// GET /api/cron/end-enrollments — close out an enrollment once its End Date has passed (daily 08:15 SGT).
//
// Adrian, 15 Sep 2026: "put an end enrollment date and automatically disenroll
// the student when time comes". The End Date already stops lessons and money on
// its own — invoiceMonthLessonDates clamps the billing month to it, and the
// bot's weekly generator skips dates past it (handlers/flows.js). What it never
// did was close the RECORD: the row stayed Status='Active' for ever, so every
// active-enrollment count, the portal's offboarding clock and Adrian's own
// reading of the table stayed wrong long after the student had left.
//
// This job is the record keeping, and nothing more:
//   Enrollments  Active + End Date strictly before today (SGT) → Ended
//   Students     no Active enrollment left + still Active      → Inactive
// Strictly before, because End Date is INCLUSIVE everywhere else (a lesson ON
// the end date is generated and billed) — the rules and their tests live in
// lib/enrollment-end.ts. An enrollment with NO End Date is never touched.
//
// It only ever demotes. A student who comes back gets a NEW enrollment, which
// the existing flows already create — this job has no path that reactivates
// anything, so a bad End Date costs a re-enrollment, never a silent re-start.
//
// Deliberately downstream of /api/cron/deactivate-inactive, which READS
// enrollment status to offboard portal accounts 30 days after the last Active
// one. This job WRITES that status, so the two must not fight: it runs daily at
// 08:15 SGT, that one monthly on the 2nd at 03:30 SGT, and its 30-day grace
// means an enrollment ended this morning cannot offboard an account today.
//
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer. ?dry=1 lists without writing.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { sgtTodayISO } from '@/lib/sgt';
import {
  enrollmentsDueToEnd,
  studentsLeftWithoutEnrollment,
  endSummaryLine,
  ENROLLMENT_ENDED,
  type EnrollmentRow,
  type StudentRow,
} from '@/lib/enrollment-end';
import { leavingStatus } from '@/lib/graduation';
import { draftFinalExtrasInvoice, fetchExtrasPool, setLeavingStatus } from '@/lib/final-extras-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  if (req.headers.get('x-vercel-cron')) return true;
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return true;
  if (admin && safeEqual(auth, `Bearer ${admin}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const today = sgtTodayISO();

  // One whole-table scan, matched in JS. A linked {Student} field cannot be
  // filtered by record id (CLAUDE.md Gotchas), and the table is a few hundred
  // rows — the same shape cron/deactivate-inactive uses.
  const { records: enrollRecs } = await airtableRequestAll('Enrollments');
  const all: EnrollmentRow[] = enrollRecs.map((r: any) => ({
    id: r.id,
    studentId: (r.fields['Student'] as string[] | undefined)?.[0] ?? null,
    status: (r.fields['Status'] as string | undefined) ?? null,
    endDate: (r.fields['End Date'] as string | undefined) ?? null,
  }));

  const due = enrollmentsDueToEnd(all, today);
  if (!due.length) {
    await logJobRun('end-enrollments', true, `nothing due (today ${today})`).catch(() => {});
    return NextResponse.json({ ok: true, today, ended: 0, deactivated: 0 });
  }

  const { records: studentRecs } = await airtableRequestAll('Students');
  const students: StudentRow[] = studentRecs.map((r: any) => ({
    id: r.id,
    name: (r.fields['Student Name'] as string | undefined) ?? r.id,
    status: (r.fields['Status'] as string | undefined) ?? null,
  }));
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const levelOf = new Map(studentRecs.map((r: any) => [r.id, (r.fields['Level'] as string | undefined) ?? null]));
  // A leaver's last end date and rate — for 'Graduated' vs 'Inactive' and the final bill.
  const rateOf = new Map(enrollRecs.map((r: any) => [r.id, Number(r.fields['Rate Per Lesson']) || 0]));
  const lastEndOf = (studentId: string) => due.filter((d) => d.studentId === studentId).map((d) => d.endDate || '').sort().pop() || '';
  const lastRateOf = (studentId: string) => {
    const mine = due.filter((d) => d.studentId === studentId).sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));
    return mine.map((d) => rateOf.get(d.id) || 0).filter((x) => x > 0).pop() || 0;
  };

  const toDeactivate = studentsLeftWithoutEnrollment(all, due.map((d) => d.id), students);

  if (dry) {
    return NextResponse.json({
      ok: true, dry: true, today,
      ending: due.map((d) => ({ id: d.id, who: d.studentId ? nameOf.get(d.studentId) ?? d.studentId : '(no student)', endDate: d.endDate })),
      deactivating: toDeactivate.map((s) => ({ id: s.id, name: s.name, becomes: leavingStatus(levelOf.get(s.id), lastEndOf(s.id)) })),
    });
  }

  // Fail-soft per record: one bad row must not strand the rest. Enrollments
  // first, so a student is only ever deactivated after their last enrollment
  // actually closed.
  const failures: string[] = [];
  const ended: { name: string; endDate: string }[] = [];
  const endedIds = new Set<string>();
  for (const d of due) {
    const who = d.studentId ? nameOf.get(d.studentId) ?? d.studentId : '(no student)';
    try {
      await airtableRequest('Enrollments', `/${d.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { Status: ENROLLMENT_ENDED } }),
      });
      endedIds.add(d.id);
      ended.push({ name: who, endDate: d.endDate || '' });
    } catch (e) {
      failures.push(`enrollment ${d.id} (${who}): ${(e as Error).message}`);
    }
  }

  const deactivated: { name: string }[] = [];
  const billLines: string[] = [];
  let pool: Awaited<ReturnType<typeof fetchExtrasPool>> | null = null;
  for (const s of toDeactivate) {
    // Only if EVERY one of this student's due enrollments actually ended —
    // a failed PATCH above leaves them enrolled, so they stay Active.
    const theirs = due.filter((d) => d.studentId === s.id);
    if (!theirs.every((d) => endedIds.has(d.id))) continue;
    const endISO = lastEndOf(s.id);
    try {
      // 'Graduated' for a final-year student leaving in the exam season, else 'Inactive' (lib/graduation.ts).
      const { status, fellBack } = await setLeavingStatus(s.id, levelOf.get(s.id) ?? null, endISO);
      deactivated.push({ name: `${s.name}${status === 'Graduated' ? ' 🎓' : ''}${fellBack ? ' (add a "Graduated" option to Students.Status)' : ''}` });
    } catch (e) {
      failures.push(`student ${s.id} (${s.name}): ${(e as Error).message}`);
      continue;
    }
    // The last extra lessons ride no next invoice — bill them now; the 15th's send cron sends it.
    try {
      pool ??= await fetchExtrasPool(today);
      const bill = await draftFinalExtrasInvoice(s.id, endISO, lastRateOf(s.id), pool);
      if (bill.invoiceId) billLines.push(`• ${s.name}: ${bill.dates.length} additional lesson(s), $${bill.amount} — ${bill.month}, drafted; goes out with the 15th's send`);
      if (bill.unmarked.length) billLines.push(`• ${s.name}: extra lesson(s) still unmarked on ${bill.unmarked.join(', ')} — mark attendance, then they need billing by hand`);
    } catch (e) {
      failures.push(`final bill ${s.id} (${s.name}): ${(e as Error).message}`);
    }
  }

  const line = endSummaryLine(ended, deactivated) + (billLines.length ? `\n\n🧾 Final bills\n${billLines.join('\n')}` : '');
  if (line) await sendTelegram(line).catch(() => {});
  const summary = `ended ${ended.length}, deactivated ${deactivated.length}${failures.length ? `; ${failures.length} failure(s)` : ''}`;
  await logJobRun('end-enrollments', failures.length === 0, summary).catch(() => {});
  return NextResponse.json({ ok: true, today, ended: ended.length, deactivated: deactivated.length, detail: { ended, deactivated }, failures });
}
