// Manage Adrian's away/blocked date ranges (see src/lib/blocked-dates.ts).
// GET    → { ranges }
// POST   { start, end, reason? } → adds a range → { ranges }
// DELETE { start, end } → removes the matching range → { ranges }
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { fetchBlockedRecord, saveBlockedRanges, isValidRange, type BlockedRange } from '@/lib/blocked-dates';

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
    return NextResponse.json({ ranges: next });
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
    const next = ranges.filter(r => !(r.start === body.start && r.end === body.end));
    if (next.length === ranges.length) {
      return NextResponse.json({ error: 'Range not found' }, { status: 404 });
    }
    await saveBlockedRanges(id, next);
    return NextResponse.json({ ranges: next });
  } catch (err: any) {
    console.error('[blocked-dates DELETE]', err?.message);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
