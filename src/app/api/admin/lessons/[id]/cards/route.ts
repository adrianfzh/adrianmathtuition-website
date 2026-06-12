// POST /api/admin/lessons/[id]/cards → add a card to the lesson
// Body: { id?, content_kind, section_name?, card_title?, content?, marks?, source_card_id?, source_question_id? }
//
// `id` is optional and only used by the offline editor — when a card is created offline the
// client generates a UUID with crypto.randomUUID() so the mutation can be replayed verbatim
// when connectivity returns. The lesson_cards.id column accepts UUIDs and Postgres will
// generate one via `gen_random_uuid()` if we leave the field unset.
//
// Idempotent on (id) — if a card with the given UUID already exists for this lesson the
// existing row is returned. This makes the offline replay safe against double-fires from
// the sync engine (e.g. tab close + reopen mid-flight).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: lessonId } = await ctx.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body?.content_kind) return NextResponse.json({ error: 'content_kind required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const clientId = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : null;

  // Idempotency: if the client-provided id already exists, return that row instead of
  // attempting an insert (avoids replay duplicates from the offline sync engine).
  if (clientId) {
    const { data: existing } = await supa
      .from('lesson_cards').select('*').eq('id', clientId).maybeSingle();
    if (existing) return NextResponse.json({ card: existing });
  }

  // Compute next order_index per SECTION (across all kinds — section-first model, so a new card
  // lands at the end of its section regardless of R/E/P).
  const sectionName = (typeof body.section_name === 'string' && body.section_name) || defaultSectionFor(body.content_kind as string);
  const { data: maxRow } = await supa
    .from('lesson_cards')
    .select('order_index')
    .eq('lesson_id', lessonId)
    .eq('section_name', sectionName)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIdx = ((maxRow?.order_index ?? -1) as number) + 1;

  const insert: Record<string, unknown> = {
    lesson_id: lessonId,
    source_card_id: body.source_card_id ?? null,
    source_question_id: body.source_question_id ?? null,
    content_kind: body.content_kind,
    section_name: sectionName,
    card_title: body.card_title ?? null,
    content: body.content ?? null,
    marks: typeof body.marks === 'number' ? body.marks : null,
    is_advanced: body.is_advanced === true,
    concept: (typeof body.concept === 'string' && body.concept) || null,
    order_index: nextIdx,
  };
  if (clientId) insert.id = clientId;

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
