// /api/admin/paper-scheme — a paper's mark scheme as a STATE (8 Sep 2026).
//
// Adrian: "why the discrepancy in her marks? are our marking not consistent?"
// Every marking of a paper used to re-derive the per-part M/A split, so the
// same script drifted ±1 on a handful of parts run to run. The bot now records
// the split the FIRST marking used on `paper_schemes.allocation` under the
// paper's canonical key and hands it to every later marking of that paper
// ("use the same split"); Adrian's approval here upgrades it to "use exactly
// this" — his checkpoint, the desk's 📐 chip. No marks are changed by either.
//
//   GET  ?key=<canonical key>&subject=math → { scheme: {…} | null }
//   POST { action:'approve', key, subject?, runId? } → { ok, scheme }
//   POST { action:'rederive', key, subject?, runId } → { ok, scheme } — replace a
//        recorded (unapproved) allocation with the one THIS run used; refused on
//        an approved scheme unless { force:true }.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allocationFrom } from '@/lib/scheme-allocation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS = 'id, subject, paper_key, paper_name, status, allocation, allocation_run_id, allocation_at, approved_at, approved_run_id, approved_by, uses, last_used_at';

type SchemeRow = {
  id: string; subject: string; paper_key: string; paper_name: string | null; status: string;
  allocation: unknown; allocation_run_id: string | null; allocation_at: string | null;
  approved_at: string | null; approved_run_id: string | null; approved_by: string | null;
  uses: number | null; last_used_at: string | null;
};

function summary(row: SchemeRow | null) {
  if (!row) return null;
  const alloc = Array.isArray(row.allocation) ? row.allocation as { number: string; marks: number; parts?: unknown[] }[] : [];
  return {
    id: row.id, key: row.paper_key, subject: row.subject, status: row.status,
    questions: alloc.length,
    marks: alloc.reduce((s, q) => s + (Number(q.marks) || 0), 0),
    allocationRunId: row.allocation_run_id, allocationAt: row.allocation_at,
    approvedAt: row.approved_at, approvedRunId: row.approved_run_id, approvedBy: row.approved_by,
    uses: row.uses ?? 0,
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const key = String(req.nextUrl.searchParams.get('key') || '').trim();
  const subject = String(req.nextUrl.searchParams.get('subject') || 'math');
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('paper_schemes').select(COLS).eq('subject', subject).eq('paper_key', key).maybeSingle<SchemeRow>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scheme: summary(data) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string; key?: string; subject?: string; runId?: string; force?: boolean };
  const key = String(body.key || '').trim();
  const subject = String(body.subject || 'math');
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const at = new Date().toISOString();

  if (body.action === 'approve') {
    const { data, error } = await sb.from('paper_schemes')
      .update({ status: 'approved', approved_at: at, approved_run_id: body.runId || null, approved_by: 'adrian', updated_at: at })
      .eq('subject', subject).eq('paper_key', key).select(COLS).maybeSingle<SchemeRow>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'no scheme recorded for this paper yet — it is written by the first marking' }, { status: 404 });
    if (!Array.isArray(data.allocation) || !data.allocation.length) return NextResponse.json({ error: 'this scheme has no allocation to approve' }, { status: 409 });
    return NextResponse.json({ ok: true, scheme: summary(data) });
  }

  if (body.action === 'rederive') {
    const runId = String(body.runId || '');
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    const { data: run, error: runErr } = await sb.from('paper_marking_runs').select('id, paper_name, result_json').eq('id', runId).maybeSingle<{ id: string; paper_name: string | null; result_json: { results?: unknown[] } | null }>();
    if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
    const allocation = allocationFrom(run.result_json?.results);
    if (!allocation.length) return NextResponse.json({ error: 'this marking has no per-part marks to record' }, { status: 409 });
    const { data: existing } = await sb.from('paper_schemes').select(COLS).eq('subject', subject).eq('paper_key', key).maybeSingle<SchemeRow>();
    if (existing?.status === 'approved' && !body.force) return NextResponse.json({ error: 'this paper’s scheme is approved — re-deriving would replace what you vetted' }, { status: 409 });
    const patch = { allocation, allocation_run_id: runId, allocation_at: at, updated_at: at, ...(existing?.status === 'approved' ? { status: 'derived', approved_at: null, approved_run_id: null, approved_by: null } : {}) };
    const { data, error } = existing
      ? await sb.from('paper_schemes').update(patch).eq('id', existing.id).select(COLS).maybeSingle<SchemeRow>()
      : await sb.from('paper_schemes').insert({ subject, paper_key: key, paper_name: run.paper_name || key, questions: [], fingerprint: [], source: { derived: true }, origin_run_id: runId, status: 'derived', ...patch }).select(COLS).maybeSingle<SchemeRow>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, scheme: summary(data) });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
