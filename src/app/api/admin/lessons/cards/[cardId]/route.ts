// PATCH  /api/admin/lessons/cards/[cardId] → update card
// DELETE /api/admin/lessons/cards/[cardId] → delete card
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ cardId: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { cardId } = await ctx.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const k of ['card_title', 'content', 'section_name'] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (typeof body.marks === 'number') patch.marks = body.marks;
  if (typeof body.order_index === 'number') patch.order_index = body.order_index;
  // Cross-kind drag moves and bank-link saves
  if (typeof body.content_kind === 'string' && ['refresher', 'worked_example', 'practice'].includes(body.content_kind)) {
    patch.content_kind = body.content_kind;
  }
  if (typeof body.source_question_id === 'string' || body.source_question_id === null) {
    patch.source_question_id = body.source_question_id;
  }

  const supa = getSupabaseAdmin();
  const { data, error } = await supa.from('lesson_cards').update(patch).eq('id', cardId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ cardId: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { cardId } = await ctx.params;
  const supa = getSupabaseAdmin();
  const { error } = await supa.from('lesson_cards').delete().eq('id', cardId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
