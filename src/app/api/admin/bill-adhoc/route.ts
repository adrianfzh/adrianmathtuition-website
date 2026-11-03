import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { billingMonthOf } from '@/lib/lesson-generation';
import { billableAdhocLessons, bookedAdhocLessons, type BillableAdhoc } from '@/lib/adhoc-billing';
import { fetchAdhocRows, draftAdhocInvoice } from '@/lib/adhoc-store';
import { lastDayOfMonthISO } from '@/lib/billing-math';
import { sgtTodayISO, addDaysISO } from '@/lib/sgt';

export const runtime = 'nodejs';

function fmtDate(iso: string): string {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// GET /api/admin/bill-adhoc?studentId=recXXX
//   → { lessons, total }   un-billed COMPLETED ad-hoc lessons (bill after)
//     { booked: { month, monthISO, lessons, total } }   this month's BOOKED ones (bill ahead)
// POST /api/admin/bill-adhoc  { studentId }            bills the completed ones
// POST /api/admin/bill-adhoc  { studentId, month }     bills the lessons booked in
//   month 'YYYY-MM' ahead (Scheduled or Completed) — 3 Nov 2026, Chantal: "issue
//   invoice for november" now, then the 14th's run bills each next month.
// Either way: ONE Draft 'Adhoc' invoice (a line per lesson at its Charge
// Override), each lesson stamped Source Invoice + Billing Month so it can't be
// billed twice. Then the normal Draft -> PDF -> send flow applies.
//
// A moved ad-hoc lesson (Type 'Rescheduled', 'Makeup For' → the ad-hoc row) is
// billed on the row that happened, at the original's charge — the rules live in
// lib/adhoc-billing.ts (Kevin Seng's 26 → 27 Jul lesson, 22 Sep 2026).

const monthWindow = (monthISO: string) => {
  const first = `${monthISO}-01`;
  return { first, last: lastDayOfMonthISO(first) };
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = new URL(req.url).searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const rows = await fetchAdhocRows();
  const items = billableAdhocLessons(rows, studentId);
  const monthISO = sgtTodayISO().slice(0, 7);
  const { first, last } = monthWindow(monthISO);
  const booked = bookedAdhocLessons(rows, studentId, first, last);
  const sum = (ls: BillableAdhoc[]) => ls.reduce((s, l) => s + l.charge, 0);
  return NextResponse.json({
    lessons: items, total: sum(items),
    booked: { month: billingMonthOf(first), monthISO, lessons: booked, total: sum(booked) },
  });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId, month } = await req.json().catch(() => ({}));
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  if (month && !/^\d{4}-\d{2}$/.test(String(month))) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });

  const rows = await fetchAdhocRows();
  const lessons = month
    ? (({ first, last }) => bookedAdhocLessons(rows, studentId, first, last))(monthWindow(String(month)))
    : billableAdhocLessons(rows, studentId);
  if (!lessons.length) {
    return NextResponse.json({ error: month ? `No un-billed Ad-hoc lessons booked in ${month}` : 'No un-billed completed Ad-hoc lessons for this student' }, { status: 400 });
  }
  const uncharged = lessons.filter(l => !(l.charge > 0));
  if (uncharged.length) {
    return NextResponse.json({ error: `No charge set on ${uncharged.map(l => fmtDate(l.date)).join(', ')} — set one on the lesson first` }, { status: 400 });
  }

  const today = sgtTodayISO();
  const inv = await draftAdhocInvoice(studentId, lessons, { issueISO: today, dueISO: addDaysISO(today, 14) });
  return NextResponse.json({ success: true, invoiceId: inv.id, count: lessons.length, total: inv.total, month: inv.month });
}
