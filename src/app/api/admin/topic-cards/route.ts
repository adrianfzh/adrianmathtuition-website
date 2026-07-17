// Admin CRUD for kiosk worksheet topic cards (the "Notes" section on Type A
// revision worksheets). GET → list; PATCH → edit content/title/status.
// Auth: admin session cookie or Bearer ADMIN_PASSWORD.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await getSupabaseAdmin()
    .from('topic_cards')
    .select('id, level, topic, title, content_md, status, author, updated_at')
    .order('level')
    .order('topic');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as
    { id?: string; title?: string; content_md?: string; status?: string } | null;
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (body.status && !['draft', 'approved'].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'draft' or 'approved'" }, { status: 400 });
  }

  const patch: Record<string, string> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.content_md === 'string' && body.content_md.trim()) patch.content_md = body.content_md;
  if (body.status) patch.status = body.status;

  const { data, error } = await getSupabaseAdmin()
    .from('topic_cards')
    .update(patch)
    .eq('id', body.id)
    .select('id, level, topic, title, content_md, status, author, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
