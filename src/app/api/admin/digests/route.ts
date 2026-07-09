// /api/admin/digests — parent digest drafts CRUD for /admin/digests.
//   GET    ?period=month|term|all  → { digests: [...] } newest first
//   PATCH  { id, body_md?, status? ('draft'|'sent') } → { digest }
//   DELETE { id } → { ok: true }
// Auth: standard admin (signed session cookie or ADMIN_PASSWORD bearer).
// Data lives in Supabase `parent_digests` (service-role client — RLS bypassed;
// the table has no public policies).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const period = req.nextUrl.searchParams.get('period') || 'all';

  const supabase = createServiceClient();
  let query = supabase
    .from('parent_digests')
    .select('id, airtable_student_id, student_name, period, period_label, body_md, exam_json, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (period === 'month' || period === 'term') query = query.eq('period', period);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ digests: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { id?: string; body_md?: string; status?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.body_md === 'string') patch.body_md = body.body_md;
  if (body.status !== undefined) {
    if (body.status !== 'draft' && body.status !== 'sent') {
      return NextResponse.json({ error: "status must be 'draft' or 'sent'" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('parent_digests')
    .update(patch)
    .eq('id', body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ digest: data });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('parent_digests').delete().eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
