// /api/portal/humanities/teacher-mark — the mark the student's teacher gave this answer (15 Oct 2026,
// lib/humanities-tracking.ts). POST { id, mark, total } → { ok }. Their own row only. Anonymous → 401.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { readTeacherMark } from '@/lib/humanities-tracking';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; mark?: unknown; total?: unknown };
  const id = String(body.id ?? '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const t = readTeacherMark(body.mark, body.total);
  if (!t) return NextResponse.json({ error: 'Give the mark and what it was out of.' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('humanities_runs')
    .update({ teacher_mark: t.mark, teacher_total: t.total, teacher_at: new Date().toISOString() })
    .eq('id', id).eq('airtable_student_id', portalIdentity(account)).select('id');
  if (error) return NextResponse.json({ error: 'Could not save it.' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
