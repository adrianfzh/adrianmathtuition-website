// /api/admin/generated — the questions written from students' photos
// (SPEC-PRACTICE-PHOTO.md §7 + §12 step 6: Adrian reads the first 20 before
// the flag opens). Admin-only.
//
// GET [?reported=1] [?limit=]  → { rows }
//   rows = `questions` rows with ai_generated AND (twin_of OR gen_meta), newest
//   first, each with its seed (id, school, year, question_text head), the
//   report (reported_at/by/reason) and the student it was written for (the
//   generation_requests row via gen_meta.request_id, if stamped).
// POST { id, action: 'restore' | 'retire' }
//   restore = clear the report so it can be served/seeded again
//   retire  = set deleted_at (never served, never a seed; the row stays for the ledger)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, created_at, level, topics, question_text, solution, answer, total_marks, difficulty, has_image, image_url, parts, twin_of, gen_meta, reported_at, reported_by, report_reason, deleted_at, flagged_count';

export type GeneratedRow = {
  id: string; created_at: string; level: string | null; topics: string[] | null; question_text: string | null;
  solution: string | null; answer: string | null; total_marks: number | null; difficulty: string | null;
  has_image: boolean | null; image_url: string | null; parts: unknown; twin_of: string | null;
  gen_meta: Record<string, unknown> | null; reported_at: string | null; reported_by: string | null;
  report_reason: string | null; deleted_at: string | null; flagged_count: number | null;
  seed?: { id: string; school: string | null; year: number | null; paper: string | null; question_text: string | null; total_marks: number | null } | null;
  student?: string | null;
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const reportedOnly = req.nextUrl.searchParams.get('reported') === '1';
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 60));
  const sb = getSupabaseAdmin();
  let q = sb.from('questions').select(COLUMNS).eq('ai_generated', true)
    .or('twin_of.not.is.null,gen_meta.not.is.null')
    .order('created_at', { ascending: false }).limit(limit);
  if (reportedOnly) q = q.not('reported_at', 'is', null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as GeneratedRow[];

  const seedIds = Array.from(new Set(rows.map(r => r.twin_of).filter((x): x is string => Boolean(x))));
  const seeds = new Map<string, GeneratedRow['seed']>();
  if (seedIds.length) {
    const { data: s } = await sb.from('questions').select('id, school, year, paper, question_text, total_marks').in('id', seedIds);
    for (const row of (s ?? []) as NonNullable<GeneratedRow['seed']>[]) seeds.set(row.id, row);
  }
  const reqIds = Array.from(new Set(rows.map(r => String(r.gen_meta?.request_id ?? '')).filter(Boolean)));
  const students = new Map<string, string | null>();
  if (reqIds.length) {
    const { data: gr } = await sb.from('generation_requests').select('id, portal_account_id').in('id', reqIds);
    const accIds = Array.from(new Set(((gr ?? []) as { portal_account_id: string | null }[]).map(g => g.portal_account_id).filter((x): x is string => Boolean(x))));
    const names = new Map<string, string>();
    if (accIds.length) {
      const { data: acc } = await sb.from('portal_accounts').select('id, display_name, email').in('id', accIds);
      for (const a of (acc ?? []) as { id: string; display_name: string | null; email: string | null }[]) names.set(a.id, a.display_name || a.email || a.id);
    }
    for (const g of (gr ?? []) as { id: string; portal_account_id: string | null }[]) students.set(g.id, g.portal_account_id ? names.get(g.portal_account_id) ?? null : null);
  }
  for (const r of rows) {
    r.seed = r.twin_of ? seeds.get(r.twin_of) ?? null : null;
    r.student = students.get(String(r.gen_meta?.request_id ?? '')) ?? null;
  }
  return NextResponse.json({ rows, generatedAt: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { id?: string; action?: string } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const action = body?.action;
  if (!id || (action !== 'restore' && action !== 'retire')) return NextResponse.json({ error: 'id + action (restore|retire) required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const patch = action === 'restore'
    ? { reported_at: null, reported_by: null, report_reason: null, deleted_at: null }
    : { deleted_at: new Date().toISOString() };
  const { error } = await sb.from('questions').update(patch).eq('id', id).eq('ai_generated', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, action });
}
