import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { level, topic, subgroup_id, card_title, content, display_group, content_kind } = await req.json();
  if (!level || !topic || !subgroup_id) {
    return NextResponse.json({ error: 'level, topic, subgroup_id required' }, { status: 400 });
  }

  const resolvedKind: string = content_kind ?? 'worked_example';

  const supa = getSupabaseAdmin();

  // Max order_index scoped to same (subgroup_id, content_kind) so refresher and worked_example
  // cards each have their own 1..N ordering.
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

  const order_index = ((maxRow as { order_index: number } | null)?.order_index ?? 0) + 1;

  const { data, error } = await supa
    .from('content_snippets')
    .insert({
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
      source: 'manual_admin_editor',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
