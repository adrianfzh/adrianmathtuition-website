// GET    /api/admin/lessons/[id] → lesson + all its cards (ordered)
// PATCH  /api/admin/lessons/[id] → update lesson metadata
// DELETE /api/admin/lessons/[id] → delete lesson (cascade deletes cards)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const supa = getSupabaseAdmin();

  const [{ data: lesson, error: le }, { data: cards, error: ce }] = await Promise.all([
    supa.from('lessons').select('*').eq('id', id).maybeSingle(),
    supa
      .from('lesson_cards')
      .select('id, source_card_id, source_question_id, content_kind, section_name, card_title, content, marks, order_index, is_advanced, updated_at')
      .eq('lesson_id', id)
      .order('content_kind', { ascending: true })
      .order('order_index', { ascending: true }),
  ]);
  if (le) return NextResponse.json({ error: le.message }, { status: 500 });
  if (!lesson) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

  return NextResponse.json({ lesson, cards: cards ?? [] });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.level === 'string') patch.level = body.level;
  if (Array.isArray(body.topics)) patch.topics = body.topics;
  if (body.description !== undefined) patch.description = body.description;
  if (typeof body.is_archived === 'boolean') patch.is_archived = body.is_archived;
  if (body.section_order !== undefined && typeof body.section_order === 'object') patch.section_order = body.section_order;
  if (body.list_order === null || typeof body.list_order === 'number') patch.list_order = body.list_order;

  const supa = getSupabaseAdmin();
  const { data, error } = await supa.from('lessons').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const supa = getSupabaseAdmin();
  const { error } = await supa.from('lessons').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
