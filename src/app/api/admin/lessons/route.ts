// GET /api/admin/lessons → list all lessons (latest first)
// POST /api/admin/lessons → create new lesson { name, level, topics?, description? }
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const includeArchived = searchParams.get('archived') === 'true';

  const supa = getSupabaseAdmin();
  let q = supa
    .from('lessons')
    .select('id, name, level, topics, description, is_archived, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (level) q = q.eq('level', level);
  if (!includeArchived) q = q.eq('is_archived', false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lessons: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { name?: string; level?: string; topics?: string[]; description?: string } | null;
  if (!body?.name || !body?.level) return NextResponse.json({ error: 'name and level required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('lessons')
    .insert({ name: body.name, level: body.level, topics: body.topics ?? [], description: body.description ?? null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}
