import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const topic = searchParams.get('topic');
  const subgroupId = searchParams.get('subgroupId');
  const kind = searchParams.get('kind') ?? 'worked_example';
  const publishedOnly = searchParams.get('publishedOnly') === 'true';

  if (!level || !topic) {
    return NextResponse.json({ error: 'level and topic required' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();

  const sgQuery = supa
    .from('subgroups')
    .select('id, name, description, order_index')
    .eq('level', level)
    .eq('topic', topic)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  const sectionOrderQuery = supa
    .from('sections_meta')
    .select('name, order_index')
    .eq('level', level)
    .eq('topic', topic)
    .order('order_index', { ascending: true });

  let cardQuery = supa
    .from('content_snippets')
    .select('id, subgroup_id, display_group, content_kind, order_index, card_title, is_published, source_kb_entry_id, updated_at, content')
    .eq('level', level)
    .eq('topic', topic)
    .eq('content_kind', kind)
    .order('order_index', { ascending: true });

  if (subgroupId) cardQuery = cardQuery.eq('subgroup_id', Number(subgroupId));
  if (publishedOnly) cardQuery = cardQuery.eq('is_published', true);

  const [
    { data: subgroups, error: sgErr },
    { data: cards, error: cardErr },
    { data: sectionMeta },
  ] = await Promise.all([sgQuery, cardQuery, sectionOrderQuery]);

  if (sgErr) return NextResponse.json({ error: sgErr.message }, { status: 500 });
  if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 });

  const cardCountBySg: Record<number, number> = {};
  for (const c of cards ?? []) {
    cardCountBySg[c.subgroup_id] = (cardCountBySg[c.subgroup_id] ?? 0) + 1;
  }

  const subgroupsWithCount = (subgroups ?? []).map((sg: { id: number; name: string; description: string }) => ({
    ...sg,
    card_count: cardCountBySg[sg.id] ?? 0,
  }));

  const mappedCards = (cards ?? []).map((c: {
    id: string; subgroup_id: number; display_group: string | null; content_kind: string; order_index: number; card_title: string;
    is_published: boolean; source_kb_entry_id: string | null; updated_at: string; content: string;
  }) => ({
    id: c.id,
    subgroup_id: c.subgroup_id,
    display_group: c.display_group,
    content_kind: c.content_kind,
    order_index: c.order_index,
    card_title: c.card_title,
    is_published: c.is_published,
    source_kb_entry_id: c.source_kb_entry_id,
    content: c.content ?? '',
    content_length: (c.content ?? '').length,
    updated_at: c.updated_at,
  }));

  // Section order from sections_meta (names in order_index order)
  const sectionOrder: string[] = (sectionMeta ?? []).map(
    (r: { name: string }) => r.name
  );

  return NextResponse.json({ cards: mappedCards, subgroups: subgroupsWithCount, sectionOrder });
}
