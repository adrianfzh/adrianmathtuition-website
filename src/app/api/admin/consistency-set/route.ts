// /api/admin/consistency-set — the papers re-read in SHADOW every week
// (17 Sep 2026, docs/MARKING.md §The consistency measure).
//
//   GET                                  → { rows: [{ run_id, added_at, note, active, paper_name, student_name, readings }] }
//   POST { runId, note? }                → add (or bring back a rested paper)
//   POST { runId, action: 'rest' }       → stop re-reading it; the readings stay
//
// Adrian curates this set by hand — it is not a sample. It is seeded with the
// bot's golden-bench papers, which every marking fix is already checked against.
// Auth: admin session cookie or Bearer ADMIN_PASSWORD (verifyAdminAuth).
// The health check probes the 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { addToSet, listSet, restInSet } from '@/lib/consistency-set';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const rows = await listSet(false);
    if (!rows.length) return NextResponse.json({ rows: [] });
    const { data } = await getSupabaseAdmin().from('paper_marking_runs')
      .select('id, paper_name, student_name, result_json')
      .in('id', rows.map((r) => r.run_id));
    type Row = { id: string; paper_name: string | null; student_name: string | null; result_json: { shadow_runs?: unknown[] } | null };
    const byId = new Map(((data ?? []) as Row[]).map((r) => [r.id, r]));
    return NextResponse.json({
      rows: rows.map((r) => {
        const run = byId.get(r.run_id);
        return {
          ...r,
          paper_name: run?.paper_name ?? null,
          student_name: run?.student_name ?? null,
          readings: Array.isArray(run?.result_json?.shadow_runs) ? run!.result_json!.shadow_runs!.length : 0,
        };
      }),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { runId?: string; note?: string; action?: string };
  const runId = typeof body.runId === 'string' ? body.runId.trim() : '';
  if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  try {
    if (body.action === 'rest') {
      await restInSet(runId);
      return NextResponse.json({ ok: true, runId, active: false });
    }
    // A paper with no stored photos can never be re-read, so it is refused at
    // the door rather than failing silently every Sunday night.
    const { data: run } = await getSupabaseAdmin().from('paper_marking_runs')
      .select('id, result_json, total_max').eq('id', runId).maybeSingle();
    if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
    const rj = (run.result_json ?? {}) as { source?: { photos?: unknown[] }; results?: unknown[] };
    if (!Array.isArray(rj.source?.photos) || !rj.source!.photos!.length) {
      return NextResponse.json({ error: 'this paper has no stored photos to re-read' }, { status: 400 });
    }
    if (!(Array.isArray(rj.results) && rj.results.length) && run.total_max == null) {
      return NextResponse.json({ error: 'this paper is not marked yet — a shadow read compares against a marking' }, { status: 400 });
    }
    await addToSet(runId, body.note ?? null);
    return NextResponse.json({ ok: true, runId, active: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
