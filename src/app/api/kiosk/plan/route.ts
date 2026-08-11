// GET /api/kiosk/plan
// The one line Adrian wrote at the end of this student's last lesson: what they
// should start on today. The kiosk shows it the moment they scan in, so they can
// begin without queueing for him to say it — that queue is the time this whole
// build is trying to buy back.
//
// Auth: kiosk device cookie + a paired student token (same gate as the content
// routes). Fail-soft everywhere — a missing plan must never block the kiosk.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth, localToday, daysAgo } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { studentFromRequest } from '@/lib/kiosk-student';

export const runtime = 'nodejs';

// How far back to look for a plan. Beyond a few weeks it's stale advice, and a
// student returning after a long gap should be told in person.
const LOOKBACK_DAYS = 28;

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const student = studentFromRequest(req);
  if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });

  const today = localToday();
  const since = daysAgo(LOOKBACK_DAYS);

  try {
    // Linked-record filters don't work (ARRAYJOIN gives display names) — window
    // by date/status in Airtable, then match the student in JS.
    // Upper bound is exclusive per the Airtable date-filter gotcha; today's own
    // lesson is excluded anyway since the plan comes from a PREVIOUS lesson.
    const { records } = await airtableRequestAll(
      'Lessons',
      `?filterByFormula=${encodeURIComponent(
        `AND({Date}>='${since}',{Date}<'${today}',{Status}!='Cancelled',{Status}!='Rescheduled')`
      )}&sort[0][field]=Date&sort[0][direction]=desc` +
        `&fields[]=Date&fields[]=Student&fields[]=Next Lesson Plan`
    );

    const mine = records.find(
      (r: { fields: Record<string, any> }) =>
        r.fields['Student']?.[0] === student.id && String(r.fields['Next Lesson Plan'] ?? '').trim()
    );

    if (!mine) return NextResponse.json({ plan: null });
    return NextResponse.json({
      plan: String(mine.fields['Next Lesson Plan']).trim(),
      from: mine.fields['Date'] ?? null,
    });
  } catch (err) {
    // Field not created yet, Airtable hiccup, anything — the kiosk just shows
    // no card. Never surface an error banner over the three big buttons.
    console.warn('[kiosk/plan] lookup failed:', (err as Error).message);
    return NextResponse.json({ plan: null });
  }
}
