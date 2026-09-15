// GET/POST /api/admin/holiday-optout — Adrian's per-DATE view of the year-end
// opt-out for Oct/Nov/Dec (ARREARS_MONTHS in lib/year-end-billing.ts).
//
// The logic moved to lib/holiday-optout.ts on 15 Sep 2026, when the parent's
// emailed button (/api/holiday-optout) became the second door onto the same
// records. This route is now just auth + shape: it offers every date
// individually, where the parent's button offers whole months.
//
// How an opt-out is stored, and which records are locked, is documented in the
// lib — read that before changing anything here.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import {
  loadOptoutMonths, applyOptoutChanges, validateChanges, type OptoutChange,
} from '@/lib/holiday-optout';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  try {
    const months = await loadOptoutMonths(studentId);
    if (!months) return NextResponse.json({ months: [], noSlots: true });
    return NextResponse.json({ months });
  } catch (e: unknown) {
    console.error('[holiday-optout] GET failed:', e);
    return NextResponse.json({ error: 'Failed to load opt-out data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { studentId?: string; changes?: OptoutChange[] } | null;
  const { studentId, changes } = body || {};
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const bad = validateChanges(changes);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  try {
    const result = await applyOptoutChanges(studentId, changes as OptoutChange[]);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    console.error('[holiday-optout] POST failed:', e);
    return NextResponse.json({ error: 'Failed to apply opt-out changes' }, { status: 500 });
  }
}
