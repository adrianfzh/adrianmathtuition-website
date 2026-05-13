import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds array required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  const { data: cards, error: fetchErr } = await supa
    .from('content_snippets')
    .select('id, level, topic, subgroup_id')
    .in('id', orderedIds);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const levels = new Set((cards ?? []).map((c: { level: string }) => c.level));
  const topics = new Set((cards ?? []).map((c: { topic: string }) => c.topic));

  // Cards within a display_group section may have different subgroup_ids — only require
  // same (level, topic).
  if (levels.size > 1 || topics.size > 1) {
    return NextResponse.json(
      { error: 'All ids must belong to the same (level, topic)' },
      { status: 400 }
    );
  }

  const updates = orderedIds.map((id: string, i: number) => ({ id, order_index: i + 1 }));

  const { error: updateErr } = await supa
    .from('content_snippets')
    .upsert(updates, { onConflict: 'id' });

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
