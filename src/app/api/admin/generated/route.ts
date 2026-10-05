// /api/admin/generated — the questions written from students' photos
// (SPEC-PRACTICE-PHOTO.md §7 + §12 step 6: Adrian reads the first 20 before
// the flag opens). Admin-only.
//
// GET [?reported=1] [?limit=]  → { rows }
//   rows = `questions` rows with ai_generated AND (twin_of OR gen_meta), newest
//   first, each with its seed (id, school, year, question_text head), the
//   report (reported_at/by/reason) and the student it was written for (the
//   generation_requests row via gen_meta.request_id, if stamped).
// ?bank=science (5 Oct 2026) → the SCIENCE bank's twins (school AdrianMath, exam_type Twin,
//   written by the Fly worker's science-twins lane, SPEC-TWINS §11). Same row shape; a science
//   row has no report/retire columns, so Retire there = practice_hidden + verified=false.
// POST { id, action: 'restore' | 'retire' | 'verify', bank? }
//   verify  = Adrian's read of a twin: verified=true (SPEC-TWINS §7 — the serving doors refuse an unverified ai_generated row)
//   restore = clear the report so it can be served/seeded again
//   retire  = set deleted_at (never served, never a seed; the row stays for the ledger)
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getScienceClient } from '@/lib/science-bank';
import { scienceImageBase, withScienceImageUrls } from '@/lib/science-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, created_at, level, topics, question_text, solution, answer, total_marks, difficulty, has_image, image_url, figure_url, question_image_url, images, parts, twin_of, verified, gen_meta, reported_at, reported_by, report_reason, deleted_at, flagged_count';

export type GeneratedRow = {
  id: string; created_at: string; level: string | null; topics: string[] | null; question_text: string | null;
  solution: string | null; answer: string | null; total_marks: number | null; difficulty: string | null;
  has_image: boolean | null; image_url: string | null; figure_url: string | null; question_image_url: string | null; images: unknown; parts: unknown; twin_of: string | null; verified: boolean | null;
  gen_meta: Record<string, unknown> | null; reported_at: string | null; reported_by: string | null;
  report_reason: string | null; deleted_at: string | null; flagged_count: number | null;
  seed?: { id: string; school: string | null; year: number | null; paper: string | null; question_text: string | null; total_marks: number | null } | null;
  student?: string | null;
};

const SCIENCE_COLUMNS = 'id, created_at, level, topics, question_text, solution, answer, total_marks, difficulty, has_image, image_url, images, parts, twin_of, verified, gen_meta, practice_hidden, practice_hidden_reason, practice_checked_at';

async function scienceRows(limit: number) {
  const sb = getScienceClient();
  const { data, error } = await sb.from('questions').select(SCIENCE_COLUMNS).eq('school', 'AdrianMath').eq('exam_type', 'Twin')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  const base = scienceImageBase(process.env.SUPABASE_URL_SCIENCE);
  const raw = (data ?? []) as unknown as Record<string, unknown>[];
  const seedIds = Array.from(new Set(raw.map(r => r.twin_of).filter((x): x is string => typeof x === 'string')));
  const seeds = new Map<string, GeneratedRow['seed']>();
  if (seedIds.length) {
    const { data: s } = await sb.from('questions').select('id, school, year, paper, question_text, total_marks').in('id', seedIds);
    for (const row of (s ?? []) as NonNullable<GeneratedRow['seed']>[]) seeds.set(row.id, row);
  }
  return raw.map(r0 => {
    const r = withScienceImageUrls(r0, base) as Record<string, unknown>;
    const meta = (r.gen_meta ?? {}) as Record<string, unknown>;
    return {
      ...(r as unknown as GeneratedRow),
      figure_url: null, question_image_url: null,
      reported_at: null, reported_by: null, report_reason: null, flagged_count: null,
      deleted_at: r.practice_hidden ? String(r.practice_hidden_reason ?? 'hidden') : null,
      gen_meta: { ...meta, kind: 'science-twin' },
      seed: typeof r.twin_of === 'string' ? seeds.get(r.twin_of) ?? null : null,
      student: null,
    } as GeneratedRow;
  });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('bank') === 'science') {
    try {
      const rows = await scienceRows(Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100)));
      return NextResponse.json({ rows, generatedAt: new Date().toISOString() });
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  }
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
  const body = await req.json().catch(() => null) as { id?: string; action?: string; bank?: string } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const action = body?.action;
  if (!id || (action !== 'restore' && action !== 'retire' && action !== 'verify')) return NextResponse.json({ error: 'id + action (restore|retire|verify) required' }, { status: 400 });
  if (body?.bank === 'science') {
    const patch = action === 'retire' ? { practice_hidden: true, practice_hidden_reason: 'retired on /admin/generated', verified: false }
      : action === 'restore' ? { practice_hidden: false, practice_hidden_reason: null, verified: true }
      : { verified: true };
    const { error } = await getScienceClient().from('questions').update(patch).eq('id', id).eq('school', 'AdrianMath').eq('exam_type', 'Twin');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id, action, bank: 'science' });
  }
  const sb = getSupabaseAdmin();
  const patch = action === 'restore'
    ? { reported_at: null, reported_by: null, report_reason: null, deleted_at: null }
    : action === 'verify' ? { verified: true }
    : { deleted_at: new Date().toISOString(), verified: false };
  const { error } = await sb.from('questions').update(patch).eq('id', id).eq('ai_generated', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, action });
}
