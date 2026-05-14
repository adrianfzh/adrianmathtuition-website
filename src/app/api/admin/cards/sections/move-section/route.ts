import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/sections/move-section
// Moves an entire display_group section from one content_kind to another
// within the same (level, topic). Cards keep their display_group; only
// content_kind changes. If the destination panel already has a section with
// the same display_group, cards are merged into it (appended).
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, displayGroup, sourceKind, targetKind } = await req.json();

  if (!level || !topic || !displayGroup || !sourceKind || !targetKind) {
    return NextResponse.json(
      { error: 'level, topic, displayGroup, sourceKind, targetKind required' },
      { status: 400 }
    );
  }

  if (sourceKind === targetKind) {
    return NextResponse.json({ error: 'sourceKind and targetKind must differ' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  // Fetch all cards in the source section
  const { data: sourceCards, error: fetchErr } = await supa
    .from('content_snippets')
    .select('id, order_index')
    .eq('level', level)
    .eq('topic', topic)
    .eq('content_kind', sourceKind)
    .eq('display_group', displayGroup)
    .order('order_index', { ascending: true });

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!sourceCards?.length) return NextResponse.json({ ok: true, movedCount: 0 });

  // Find max order_index in destination panel's same display_group (for append)
  const { data: destMaxRow } = await supa
    .from('content_snippets')
    .select('order_index')
    .eq('level', level)
    .eq('topic', topic)
    .eq('content_kind', targetKind)
    .eq('display_group', displayGroup)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const destOffset = (destMaxRow as { order_index: number } | null)?.order_index ?? 0;

  // Update all cards: change content_kind, recompute order_index (appending to dest)
  const updates = (sourceCards as { id: string; order_index: number }[]).map((c, i) => ({
    id: c.id,
    content_kind: targetKind,
    order_index: destOffset + i + 1,
  }));

  const { error: updateErr } = await supa
    .from('content_snippets')
    .upsert(updates, { onConflict: 'id' });

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, movedCount: sourceCards.length });
}
