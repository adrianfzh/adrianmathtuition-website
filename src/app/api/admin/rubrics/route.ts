import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// Admin view/edit of the Solo grading rubrics (see RUBRIC-SPEC.md). GET reads via
// the anon client (RLS read-all). PATCH writes via the service-role client — which
// requires SUPABASE_SERVICE_ROLE_KEY; without it, editing is done in Supabase directly.

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });
  const { data, error } = await getSupabase()
    .from('rubrics').select('*').order('subject').order('paper');
  if (error) return NextResponse.json({ error: error.message, rubrics: [] }, { status: 200 });
  return NextResponse.json({ rubrics: data || [], canEdit: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'In-app editing needs SUPABASE_SERVICE_ROLE_KEY in the environment. Until then, edit the rubric directly in the Supabase dashboard.' },
      { status: 503 });
  }
  const { id, criteria, grading_notes, out_of } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (criteria !== undefined) fields.criteria = criteria;
  if (grading_notes !== undefined) fields.grading_notes = grading_notes;
  if (out_of !== undefined) fields.out_of = out_of;
  const { error } = await getSupabaseAdmin().from('rubrics').update(fields).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
