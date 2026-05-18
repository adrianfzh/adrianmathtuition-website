import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    level,
    topic,
    subgroup_id,
    card_title,
    content,
    display_group,
    content_kind,
    source_question_id,        // optional: link to questions.id (drag-from-bank)
    insert_after_card_id,      // optional: place new card immediately AFTER this card id
    insert_before_card_id,     // optional: place new card immediately BEFORE this card id
    source,                    // optional override (defaults to manual_admin_editor or bank_drag)
  } = await req.json();
  if (!level || !topic || !subgroup_id) {
    return NextResponse.json({ error: 'level, topic, subgroup_id required' }, { status: 400 });
  }

  const resolvedKind: string = content_kind ?? 'worked_example';
  const resolvedSource: string = source ?? (source_question_id ? 'bank_drag' : 'manual_admin_editor');

  const supa = getSupabaseAdmin();

  // Determine order_index. Two paths:
  //   A) insert_after_card_id or insert_before_card_id specified — insert at that position,
  //      shifting subsequent cards in the SAME (subgroup_id, content_kind) group by +1
  //   B) Default — append at end of (subgroup_id, content_kind) group
  let order_index: number;

  if (insert_after_card_id || insert_before_card_id) {
    // Look up the anchor card to find its order_index AND confirm it belongs to the same
    // (subgroup_id, content_kind) group as the new card. If not, fall through to append.
    const anchorId = insert_after_card_id ?? insert_before_card_id;
    const { data: anchor } = await supa
      .from('content_snippets')
      .select('order_index, subgroup_id, content_kind, level, topic')
      .eq('id', anchorId)
      .maybeSingle();
    const a = anchor as { order_index: number; subgroup_id: number; content_kind: string; level: string; topic: string } | null;

    if (a && a.subgroup_id === Number(subgroup_id) && a.content_kind === resolvedKind && a.level === level && a.topic === topic) {
      // Place at anchor + 1 (or anchor itself if "before") and shift all >= that index by +1
      const targetIdx = insert_after_card_id ? a.order_index + 1 : a.order_index;
      // Shift cards >= targetIdx
      // We use a single UPDATE: order_index = order_index + 1 WHERE same group AND order_index >= targetIdx
      await supa.rpc('shift_card_order_indexes', {
        p_level: level,
        p_topic: topic,
        p_subgroup_id: Number(subgroup_id),
        p_content_kind: resolvedKind,
        p_min_order_index: targetIdx,
      });
      order_index = targetIdx;
    } else {
      // Anchor not in same group — fall back to append
      const { data: maxRow } = await supa
        .from('content_snippets')
        .select('order_index')
        .eq('level', level)
        .eq('topic', topic)
        .eq('subgroup_id', subgroup_id)
        .eq('content_kind', resolvedKind)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      order_index = ((maxRow as { order_index: number } | null)?.order_index ?? 0) + 1;
    }
  } else {
    // Default: append at end
    const { data: maxRow } = await supa
      .from('content_snippets')
      .select('order_index')
      .eq('level', level)
      .eq('topic', topic)
      .eq('subgroup_id', subgroup_id)
      .eq('content_kind', resolvedKind)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    order_index = ((maxRow as { order_index: number } | null)?.order_index ?? 0) + 1;
  }

  const insertRow: Record<string, unknown> = {
    level,
    topic,
    subgroup_id,
    card_title: card_title ?? '',
    content: content ?? '',
    display_group: display_group ?? null,
    order_index,
    content_kind: resolvedKind,
    feature: 'both',
    is_published: true,
    source: resolvedSource,
  };
  if (source_question_id) insertRow.source_question_id = source_question_id;

  const { data, error } = await supa
    .from('content_snippets')
    .insert(insertRow)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
