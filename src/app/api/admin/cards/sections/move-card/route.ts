import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

// POST /api/admin/cards/sections/move-card
// Moves a card to a different display_group section within the same (level, topic),
// then rewrites order_index for both source and destination sections.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cardId, targetSection, sourceOrderedIds, destOrderedIds } = await req.json();

  if (
    !cardId ||
    typeof targetSection !== 'string' ||
    !Array.isArray(sourceOrderedIds) ||
    !Array.isArray(destOrderedIds)
  ) {
    return NextResponse.json(
      { error: 'cardId, targetSection, sourceOrderedIds, destOrderedIds required' },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();

  // Update the card's display_group
  const { error: moveErr } = await supa
    .from('content_snippets')
    .update({ display_group: targetSection })
    .eq('id', cardId);

  if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 });

  // Rewrite order_index for source section (remaining cards)
  if ((sourceOrderedIds as string[]).length > 0) {
    const sourceUpdates = (sourceOrderedIds as string[]).map((id, i) => ({
      id,
      order_index: i + 1,
    }));
    const { error: srcErr } = await supa
      .from('content_snippets')
      .upsert(sourceUpdates, { onConflict: 'id' });
    if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }

  // Rewrite order_index for destination section (including moved card)
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
