import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, countLessonsOnDateBySlot } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// GET /api/admin-schedule/slot-counts?date=YYYY-MM-DD
// Per-slot booked-lesson counts for one date, with the SAME semantics as the
// reschedule/add routes' 409 capacity gate (excludes Cancelled/Absent only).
// Used by the reschedule modal so its n/cap numbers stay honest for dates
// outside the currently loaded week.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  try {
    const counts = await countLessonsOnDateBySlot(date);
    return NextResponse.json({ date, counts });
  } catch (err: any) {
    console.error('[slot-counts] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
