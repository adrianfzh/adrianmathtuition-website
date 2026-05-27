// GET /api/admin/lessons → list all lessons (latest first)
// POST /api/admin/lessons → create new lesson { id?, name, level, topics?, description? }
//
// `id` is optional — the offline editor generates a UUID locally so the create can be
// replayed verbatim once the device comes back online. The endpoint is idempotent on id:
// if a lesson with the given UUID already exists, the existing row is returned instead
// of failing on a unique-violation. Safe against duplicate replays from the sync queue.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const body = await req.json().catch(() => null) as {
    id?: string; name?: string; level?: string; topics?: string[]; description?: string;
  } | null;
  if (!body?.name || !body?.level) return NextResponse.json({ error: 'name and level required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const clientId = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : null;

  // Idempotency: if a row with the client-supplied id already exists, return it.
  if (clientId) {
    const { data: existing } = await supa.from('lessons').select('*').eq('id', clientId).maybeSingle();
    if (existing) return NextResponse.json({ lesson: existing });
  }

  const insert: Record<string, unknown> = {
    name: body.name,
    level: body.level,
    topics: body.topics ?? [],
    description: body.description ?? null,
  };
  if (clientId) insert.id = clientId;

  const { data, error } = await supa.from('lessons').insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}
