// /api/admin/figure-needs — 🖼 Figures we need (5 Oct 2026). Admin only.
// GET  → { groups (open, by shape, biggest first, ready at 3), rows (newest 200) }
// POST { shape, status: 'built'|'dropped', family? } → closes every open row of that shape
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { groupNeeds, READY_AT } from '@/lib/figure-needs';
import { listFigureNeeds, closeShape } from '@/lib/figure-needs-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const rows = await listFigureNeeds();
    return NextResponse.json({ ready_at: READY_AT, groups: groupNeeds(rows), rows: rows.slice(0, 200) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as { shape?: string; status?: string; family?: string } | null;
  if (!b?.shape || (b.status !== 'built' && b.status !== 'dropped')) return NextResponse.json({ error: 'shape + status (built|dropped) required' }, { status: 400 });
  try { return NextResponse.json({ ok: true, closed: await closeShape(b.shape, b.status, b.family ?? null) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
