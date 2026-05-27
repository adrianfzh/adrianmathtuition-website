// POST /api/admin/lessons/cards/reorder → bulk reorder within a (content_kind, section_name) group
// Body: { orderedIds: string[] } — IDs in their new order, all in the same group
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { orderedIds?: string[] } | null;
  if (!Array.isArray(body?.orderedIds)) return NextResponse.json({ error: 'orderedIds required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  // Reassign order_index = 0,1,2,... for the given list
  const updates = body!.orderedIds.map((id, idx) =>
    supa.from('lesson_cards').update({ order_index: idx }).eq('id', id)
  );
  const results = await Promise.all(updates);
  const firstErr = results.find(r => r.error);
  if (firstErr?.error) return NextResponse.json({ error: firstErr.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: body!.orderedIds.length });
}
