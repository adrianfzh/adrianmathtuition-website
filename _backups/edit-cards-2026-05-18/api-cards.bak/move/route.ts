import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/move
// Moves a card to a different sub-group within the same (level, topic),
// then rewrites order_index for both source and destination sub-groups.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cardId, targetSubgroupId, sourceOrderedIds, destOrderedIds } = await req.json();

  if (
    !cardId ||
    !targetSubgroupId ||
    !Array.isArray(sourceOrderedIds) ||
    !Array.isArray(destOrderedIds)
  ) {
    return NextResponse.json(
      { error: 'cardId, targetSubgroupId, sourceOrderedIds, destOrderedIds required' },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();

  // Fetch the card to verify it exists and get its level/topic
  const { data: card } = await supa
    .from('content_snippets')
    .select('id, level, topic, subgroup_id')
    .eq('id', cardId)
    .single();

  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  // Verify target sub-group exists and is in the same level+topic
  const { data: targetSg } = await supa
    .from('subgroups')
    .select('id, level, topic')
    .eq('id', targetSubgroupId)
    .single();

  if (!targetSg) return NextResponse.json({ error: 'Target sub-group not found' }, { status: 404 });

  if (targetSg.level !== card.level || targetSg.topic !== card.topic) {
    return NextResponse.json({ error: 'Cross-topic moves are not supported' }, { status: 400 });
  }

  // Update the card's subgroup_id
  const { error: moveErr } = await supa
    .from('content_snippets')
    .update({ subgroup_id: targetSubgroupId })
    .eq('id', cardId);

  if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 });

  // Rewrite order_index for source sub-group (remaining cards after removal)
  if (sourceOrderedIds.length > 0) {
    const sourceUpdates = (sourceOrderedIds as string[]).map((id, i) => ({
      id,
      order_index: i + 1,
    }));
    const { error: srcErr } = await supa
      .from('content_snippets')
      .upsert(sourceUpdates, { onConflict: 'id' });
    if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }

  // Rewrite order_index for destination sub-group (including moved card)
  const destUpdates = (destOrderedIds as string[]).map((id, i) => ({
    id,
    order_index: i + 1,
  }));
  const { error: destErr } = await supa
    .from('content_snippets')
    .upsert(destUpdates, { onConflict: 'id' });
  if (destErr) return NextResponse.json({ error: destErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
