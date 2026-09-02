// /api/admin/schemes — the mark schemes Adrian attached at upload, kept in
// `paper_schemes` so later hand-ins of the same paper are grounded on them
// (bot lib/scheme-store.js). GET lists them; DELETE ?id= removes one — a bad
// extraction must be removable, or it grounds every future run of that paper.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(req.url).searchParams.get('auth') === 'check') return NextResponse.json({ ok: true });
  const { data, error } = await getSupabaseAdmin()
    .from('paper_schemes')
    .select('id, created_at, updated_at, subject, paper_key, paper_name, questions, fingerprint, source, origin_run_id, uses, last_used_at')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).map(r => {
    const qs = Array.isArray(r.questions) ? r.questions : [];
    const parts = qs.reduce((n: number, q: { parts?: unknown[] }) => n + (Array.isArray(q.parts) ? q.parts.length : 0), 0);
    const marks = qs.reduce((n: number, q: { marks?: number; parts?: { marks?: number }[] }) =>
      n + (Number.isFinite(Number(q.marks)) ? Number(q.marks) : (q.parts || []).reduce((m, p) => m + (Number(p.marks) || 0), 0)), 0);
    return {
      id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, subject: r.subject,
      paperKey: r.paper_key, paperName: r.paper_name,
      questions: qs.length, parts, marks,
      fingerprinted: Array.isArray(r.fingerprint) ? r.fingerprint.length : 0,
      sourceKind: r.source?.pdf_url ? 'pdf' : (Array.isArray(r.source?.pages) && r.source.pages.length ? `${r.source.pages.length} photo${r.source.pages.length === 1 ? '' : 's'}` : null),
      originRunId: r.origin_run_id, uses: r.uses, lastUsedAt: r.last_used_at,
    };
  });
  return NextResponse.json({ rows });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('paper_schemes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
