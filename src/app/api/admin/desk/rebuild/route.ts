// POST /api/admin/desk/rebuild { runId } — redraw both marked PDFs from what
// the run already holds (lib/rebuild-run-pdfs.ts), for the desk's header bar.
//
// When it matters: after an Agree/Override changed the total (the PAPER TOTAL
// strip is drawn from the run's totals at assembly), or after the sheet's
// diagnosis landed and the cover should follow it. Refuses a released run —
// the student has that copy, and a new file under the same links would make
// the copy in their hands and the copy on the run disagree.
//
// A COMPLETE rebuild clears `result_json.pdf_stale`: the flag means "the PDF
// prints the old total", and the rebuilt strip prints the current one. The
// per-question boxes in the ink are still the marker's original — the desk says
// so, and Adrian's own "Marked (Adrian).pdf" remains the copy that fixes those.
// Rebuilding never touches `annotated_pdf_url`.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { rebuildRunPdfs } from '@/lib/rebuild-run-pdfs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Both halves build in parallel against mark-paper-pdf; the full copy can take
// ~2 min cold on a 30-question paper. Same ceiling as that route.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as { runId?: string }));
  const runId = String(body.runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: run, error } = await sb.from('paper_marking_runs')
    .select('id, released_at, result_json').eq('id', runId).maybeSingle<{ id: string; released_at: string | null; result_json: unknown }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  if (run.released_at) return NextResponse.json({ error: 'already released — the student has this copy' }, { status: 409 });

  // Same-origin call carrying the caller's own admin credentials (the
  // release-with-sheet / sheet-jobs pattern).
  const headers: Record<string, string> = {};
  const auth = req.headers.get('authorization');
  const cookie = req.headers.get('cookie');
  if (auth) headers.Authorization = auth;
  if (cookie) headers.cookie = cookie;

  const outcome = await rebuildRunPdfs(runId, { origin: req.nextUrl.origin, headers });

  let pdfStaleCleared = false;
  if (outcome.rebuilt) {
    try {
      const { data: fresh } = await sb.from('paper_marking_runs').select('result_json, released_at').eq('id', runId).maybeSingle<{ result_json: unknown; released_at: string | null }>();
      const rj = (fresh?.result_json && typeof fresh.result_json === 'object') ? { ...(fresh.result_json as Record<string, unknown>) } : {};
      const wasStale = !!rj.pdf_stale;
      delete rj.pdf_stale;
      rj.pdf_rebuilt = { at: new Date().toISOString(), photos: outcome.photos ?? null, full: outcome.full ?? null, clearedStale: wasStale };
      // Guarded on still-unreleased: a release that landed mid-rebuild keeps its record.
      const { error: upErr } = await sb.from('paper_marking_runs').update({ result_json: rj }).eq('id', runId).is('released_at', null);
      if (upErr) console.warn('[desk/rebuild] stamp failed', runId, upErr.message);
      else pdfStaleCleared = wasStale;
    } catch (e) {
      console.warn('[desk/rebuild] stamp failed', runId, (e as Error).message);
    }
  }

  return NextResponse.json({ ok: outcome.rebuilt, runId, ...outcome, pdfStaleCleared }, { status: outcome.rebuilt ? 200 : 502 });
}
