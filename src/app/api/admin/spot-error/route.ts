// /api/admin/spot-error — Adrian's review list for 🔍 spot-the-error cards
// (SPEC-SPOT-ERROR.md §3). Admin only. Modelled on /api/admin/generated.
//
// GET  [?status=pending|approved|rejected|all]  → { rows }
//   rows = learning_units with kind 'autopsy' and payload.origin 'spot-error',
//   pending first, newest first.
// POST { id, action: 'approve' | 'reject' | 'pending' }
//   approve = status 'approved' — the card may now reach students wherever
//             autopsy units show (the /notes recap, the Learn player, and the
//             My Notebook link behind SPOT_ERROR_OPEN_TO_STUDENTS);
//   reject  = status 'rejected' (never shown; the row stays so its source is
//             not re-harvested);
//   pending = back to the queue.
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { NOTES_CACHE_TAG } from '@/lib/notes-data';
import { SPOT_ORIGIN } from '@/lib/spot-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type SpotRow = {
  id: string; subject: string; topic: string; title: string; status: string;
  created_at: string | null; payload: Record<string, unknown>;
};

const STATUS_RANK: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') || 'all';
  let q = getSupabaseAdmin()
    .from('learning_units')
    .select('id, subject, topic, title, status, created_at, payload')
    .eq('kind', 'autopsy')
    .eq('payload->>origin', SPOT_ORIGIN)
    .order('created_at', { ascending: false })
    .limit(300);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = ((data ?? []) as SpotRow[]).sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3));
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  const next = body?.action === 'approve' ? 'approved' : body?.action === 'reject' ? 'rejected' : body?.action === 'pending' ? 'pending' : null;
  if (!id || !next) return NextResponse.json({ error: 'id and action (approve|reject|pending) required' }, { status: 400 });
  const { error, count } = await getSupabaseAdmin()
    .from('learning_units')
    .update({ status: next }, { count: 'exact' })
    .eq('id', id)
    .eq('kind', 'autopsy')
    .eq('payload->>origin', SPOT_ORIGIN); // this door moves spot-error cards only
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'not found' }, { status: 404 });
  revalidateTag(NOTES_CACHE_TAG, 'max');
  return NextResponse.json({ ok: true, status: next });
}
