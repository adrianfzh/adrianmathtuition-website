import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { NOTE_SLUG_TO_LEVELS, listPrintablesForLevel, isPrintableKind } from '@/lib/notes-list';

export const runtime = 'nodejs';

// GET /api/admin-notes?level=am[&kind=notes|revision]
// Listing logic lives in lib/notes-list.ts — shared with /api/kiosk/notes so the
// two surfaces can't drift (they used to hold separate copies of it).
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const kindParam = searchParams.get('kind') ?? 'notes';

  if (!level || !NOTE_SLUG_TO_LEVELS[level]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }
  if (!isPrintableKind(kindParam)) {
    return NextResponse.json({ error: "kind must be 'notes' or 'revision'" }, { status: 400 });
  }

  return NextResponse.json(await listPrintablesForLevel(kindParam, level));
}
