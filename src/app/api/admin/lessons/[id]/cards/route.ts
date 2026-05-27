// POST /api/admin/lessons/[id]/cards → add a card to the lesson
// Body: { content_kind, section_name?, card_title?, content?, marks?, source_card_id?, source_question_id? }
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: lessonId } = await ctx.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body?.content_kind) return NextResponse.json({ error: 'content_kind required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  // Compute next order_index in this (lesson, content_kind, section_name)
  const sectionName = (typeof body.section_name === 'string' && body.section_name) || defaultSectionFor(body.content_kind as string);
  const { data: maxRow } = await supa
    .from('lesson_cards')
    .select('order_index')
    .eq('lesson_id', lessonId)
    .eq('content_kind', body.content_kind)
    .eq('section_name', sectionName)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIdx = ((maxRow?.order_index ?? -1) as number) + 1;

  const insert = {
    lesson_id: lessonId,
    source_card_id: body.source_card_id ?? null,
    source_question_id: body.source_question_id ?? null,
    content_kind: body.content_kind,
    section_name: sectionName,
    card_title: body.card_title ?? null,
    content: body.content ?? null,
    marks: typeof body.marks === 'number' ? body.marks : null,
    order_index: nextIdx,
  };
  const { data, error } = await supa.from('lesson_cards').insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

function defaultSectionFor(kind: string): string {
  if (kind === 'refresher') return 'Refreshers';
  if (kind === 'worked_example') return 'Worked Examples';
  if (kind === 'practice') return 'Practice';
  return 'Default';
}
