// Manage Adrian's away/blocked date ranges (see src/lib/blocked-dates.ts).
// GET    → { ranges }
// POST   { start, end, reason? } → adds a range, marks its Scheduled lessons missed → { ranges, marked }
// DELETE { start, end } → removes the matching range, puts those lessons back → { ranges, restored }
// (lib/away-lessons.ts — Adrian, 2 Nov 2026: "can it also mark the scheduled lessons as missed with reason?")
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { fetchBlockedRecord, saveBlockedRanges, isValidRange, type BlockedRange } from '@/lib/blocked-dates';
import { markAwayLessons, restoreAwayLessons } from '@/lib/away-lessons-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { ranges } = await fetchBlockedRecord();
    return NextResponse.json({ ranges });
  } catch (err: any) {
    console.error('[blocked-dates GET]', err?.message);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const range: BlockedRange = { start: body.start, end: body.end, reason: String(body.reason || '').trim() };
    if (!isValidRange(range)) {
      return NextResponse.json({ error: 'start/end must be YYYY-MM-DD with start ≤ end' }, { status: 400 });
    }
    const { id, ranges } = await fetchBlockedRecord();
    if (ranges.some(r => r.start <= range.end && range.start <= r.end)) {
      return NextResponse.json({ error: 'Overlaps an existing blocked period' }, { status: 400 });
    }
    const next = [...ranges, range].sort((a, b) => a.start.localeCompare(b.start));
    await saveBlockedRanges(id, next);
    // The period is saved first: a failure marking lessons leaves it in place
    // and the daily away-reminder sweep marks them on its next run.
    let marked: number | null = null;
    try { marked = await markAwayLessons(range); }
    catch (e: any) { console.error('[blocked-dates POST] marking lessons', e?.message); }
    return NextResponse.json({ ranges: next, marked });
  } catch (err: any) {
    console.error('[blocked-dates POST]', err?.message);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { id, ranges } = await fetchBlockedRecord();
    const gone = ranges.find(r => r.start === body.start && r.end === body.end);
    if (!gone) {
      return NextResponse.json({ error: 'Range not found' }, { status: 404 });
    }
    const next = ranges.filter(r => r !== gone);
    await saveBlockedRanges(id, next);
    let restored: number | null = null;
    try { restored = await restoreAwayLessons(gone); }
    catch (e: any) { console.error('[blocked-dates DELETE] restoring lessons', e?.message); }
    return NextResponse.json({ ranges: next, restored });
  } catch (err: any) {
    console.error('[blocked-dates DELETE]', err?.message);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
