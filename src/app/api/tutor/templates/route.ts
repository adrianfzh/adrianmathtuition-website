// 🧑‍🏫 A tutor's own saved boards — "templates" (SPEC-TUTOR-TOOLS §8; Adrian, 5 Nov 2026: "do … the
// tutor's own saved board"). A template keeps a board's pages, the TUTOR's writing and its photo
// stickers — never the student's writing — so it can start a new board for any of their students.
//   GET                          the tutor's templates, newest first
//   POST   { boardId, title? }   save one of their boards as a template
//   DELETE ?id=<template id>     remove a template (boards made from it are not touched)
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { boardTitle } from '@/lib/shared-board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_TEMPLATES = 100;

export async function GET() {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { data } = await getSupabaseAdmin().from('board_templates').select('id, title, pages, created_at')
    .eq('tutor_id', tutor.id).order('created_at', { ascending: false }).limit(MAX_TEMPLATES);
  return NextResponse.json({
    templates: ((data ?? []) as { id: string; title: string; pages: unknown[]; created_at: string }[])
      .map(t => ({ id: t.id, title: t.title, pages: Array.isArray(t.pages) ? t.pages.length : 0, created_at: t.created_at })),
  });
}

export async function POST(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { boardId?: string; title?: string };
  if (!body.boardId || !UUID.test(body.boardId)) return NextResponse.json({ error: 'board is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: b } = await sb.from('shared_boards').select('title, pages, tutor_ink, stickers').eq('id', body.boardId).eq('tutor_id', tutor.id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { count } = await sb.from('board_templates').select('id', { count: 'exact', head: true }).eq('tutor_id', tutor.id);
  if ((count ?? 0) >= MAX_TEMPLATES) return NextResponse.json({ error: 'You have 100 templates — remove one first.' }, { status: 409 });
  const { data, error } = await sb.from('board_templates').insert({
    tutor_id: tutor.id, title: boardTitle(body.title, b.title as string), pages: b.pages ?? [], ink: b.tutor_ink ?? {}, stickers: b.stickers ?? [],
  }).select('id, title').single();
  if (error || !data) return NextResponse.json({ error: 'Could not save the template — try again.' }, { status: 500 });
  return NextResponse.json({ id: data.id, title: data.title });
}

export async function DELETE(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'template is required' }, { status: 400 });
  await getSupabaseAdmin().from('board_templates').delete().eq('id', id).eq('tutor_id', tutor.id);
  return NextResponse.json({ ok: true });
}
