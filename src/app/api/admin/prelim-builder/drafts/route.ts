// Draft persistence for /admin/prelim-builder. Drafts are also the hybrid
// hand-off surface: a Claude session reads a draft via MCP ("run the setter
// pass on draft N") and writes swaps back into slots.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceClient();
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const { data, error } = await supabase.from('paper_drafts').select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ draft: data });
  }
  const { data, error } = await supabase
    .from('paper_drafts')
    .select('id, title, level, paper, preset, difficulty, status, total_marks, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: data });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('paper_drafts')
    .insert({
      title: body.title || `${body.level} ${body.paper} — ${body.preset}`,
      level: body.level,
      paper: body.paper,
      preset: body.preset || 'standard',
      difficulty: body.difficulty || 'standard',
      slots: body.slots ?? [],
      total_marks: body.total_marks ?? 0,
      exclude_school: body.excludeSchool ?? null,
      notes: body.notes ?? null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['title', 'slots', 'total_marks', 'notes', 'status'] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from('paper_drafts').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const supabase = createServiceClient();
  const { error } = await supabase.from('paper_drafts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
