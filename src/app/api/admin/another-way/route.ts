// /api/admin/another-way — Adrian's review list for 🔀 "Another way to solve this"
// (SPEC-ANOTHER-WAY.md). Admin only. Modelled on /api/admin/spot-error.
//
// GET  [?status=pending|approved|rejected|all]  → { rows }
//   rows = question_alt_methods joined to their bank question (stem, answer, the main
//   solution), pending first, newest first. Small: at most 200 rows.
// POST { id, action: 'approve' | 'reject' | 'pending', note? }
//   approve = status 'approved' — the drop-down may now show under that question's worked
//             solution (admin + preview student until ANOTHER_WAY_OPEN_TO_STUDENTS opens);
//             refused when the blind check did not pass;
//   reject  = never shown; the row stays so the question is not drafted again;
//   pending = back to the queue.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { checkProblems, type AltChecks } from '@/lib/alt-method';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type AnotherWayRow = {
  id: string; question_id: string; main_method: string; alt_method: string; working: string;
  better: string; alt_answer: string; checks: Partial<AltChecks> | null; status: string; note: string | null;
  created_at: string | null;
  question: { level: string | null; topics: string[] | null; question_text: string | null; answer: string | null; solution: string | null } | null;
};

const STATUS_RANK: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') || 'all';
  let q = getSupabaseAdmin()
    .from('question_alt_methods')
    .select('id, question_id, main_method, alt_method, working, better, alt_answer, checks, status, note, created_at, question:questions(level, topics, question_text, answer, solution)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = ((data ?? []) as unknown as AnotherWayRow[]).sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3));
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  const next = body?.action === 'approve' ? 'approved' : body?.action === 'reject' ? 'rejected' : body?.action === 'pending' ? 'pending' : null;
  if (!id || !next) return NextResponse.json({ error: 'id and action (approve|reject|pending) required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (next === 'approved') {
    const { data: row } = await sb.from('question_alt_methods').select('checks').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const problems = checkProblems(row.checks as Partial<AltChecks> | null);
    if (problems.length) return NextResponse.json({ error: `The check did not pass: ${problems.join('; ')}` }, { status: 409 });
  }
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined;
  const { error, count } = await sb.from('question_alt_methods')
    .update({ status: next, reviewed_at: new Date().toISOString(), ...(note !== undefined ? { note } : {}) }, { count: 'exact' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, status: next });
}
