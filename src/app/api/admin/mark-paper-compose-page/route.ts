// POST /api/admin/mark-paper-compose-page { runId, photoIndex, layerSvg, inkSvg, strokes, recordEdits, markSwaps }
//
// The ✏️ Annotate overlay's Done step for a page that has an editable marker
// layer (SPEC-ANNOTATE §14). The client sends the marker's layer as Adrian left
// it and his own ink as SVG (both in the layer's coordinate space) and the bot
// composes them onto the hi-res original with the fonts only it has
// (/api/compose-page → ai/compose-page.js), stores the page on the run and
// returns its URL; the overlay then assembles the PDF from page URLs as before.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { composeForwardBody } from '@/lib/annotate/compose-forward';
import { scoreEdits, scoreEditsToOverrides } from '@/lib/annotate/score-edits';
import { applyOverride, recomputeTotals } from '@/lib/mark-triage';
import { getSupabaseAdmin } from '@/lib/supabase';
import { recordCorrections, contextFromRun, RUN_COLUMNS_FOR_CORRECTIONS } from '@/lib/marking-corrections-store';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { runId?: string; photoIndex?: number; layerSvg?: string; inkSvg?: string; strokes?: unknown; recordEdits?: unknown; markSwaps?: unknown; allowReleased?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { runId, layerSvg, inkSvg, strokes, recordEdits, markSwaps } = body;
  // Only a literal true re-inks a paper the student already holds (desk-redraw's rule).
  const allowReleased = body.allowReleased === true;
  const photoIndex = Number(body.photoIndex);
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(photoIndex) || photoIndex < 0) {
    return NextResponse.json({ error: 'runId and photoIndex are required' }, { status: 400 });
  }
  if (typeof layerSvg !== 'string' || typeof inkSvg !== 'string') return NextResponse.json({ error: 'layerSvg and inkSvg must be strings' }, { status: 400 });
  const botBase = process.env.BOT_BASE_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !secret) return NextResponse.json({ error: 'bot not configured (BOT_BASE_URL / BOT_INTERNAL_SECRET)' }, { status: 503 });

  // A score chip retyped on the page IS a mark change (20 Sep 2026): the record is
  // written FIRST through the desk editor's own path (applyOverride with parts →
  // question total = the parts' sum → paper totals), so the bot's compose, which
  // re-reads the run before it persists, sees the new marks and repaints the chip.
  let marks: { awarded: number; max: number; questions: number; unmatched: number } | null = null;
  const scores = scoreEdits(recordEdits);
  // 🔁 Loop 1 (5 Oct 2026): the run as it stood BEFORE this Done — diffed against the run
  // after the bot's compose (which writes Adrian's note/verdict edits) so every mark and
  // every note he changed is filed in marking_corrections. Read only when Done edits the
  // record; plain ink changes nothing the marker could learn from.
  const editsRecord = Array.isArray(recordEdits) && recordEdits.length > 0;
  const supa = getSupabaseAdmin();
  let before: { id: string; result_json: unknown; released_at: string | null; student_id?: string | null; paper_name?: string | null; paper_subject?: string | null; subject?: string | null } | null = null;
  if (editsRecord) {
    const { data } = await supa.from('paper_marking_runs').select(RUN_COLUMNS_FOR_CORRECTIONS).eq('id', runId).maybeSingle();
    before = data;
  }
  if (scores.length) {
    const { data: run, error } = await supa.from('paper_marking_runs').select('id, result_json, released_at').eq('id', runId).single();
    if (error || !run) return NextResponse.json({ error: error?.message || 'run not found' }, { status: 404 });
    if (run.released_at && !allowReleased) return NextResponse.json({ error: 'already released — the student has that copy' }, { status: 409 });
    const { overrides, unmatched } = scoreEditsToOverrides(run.result_json, scores, photoIndex);
    if (overrides.length) {
      const now = new Date().toISOString();
      let json: unknown = run.result_json;
      for (const o of overrides) {
        json = applyOverride(json, o.index, o.awarded, 'score chip retyped in ✏️ Annotate', now, undefined, o.parts.length ? o.parts : undefined);
      }
      const totals = recomputeTotals(json);
      const next = { ...(json as Record<string, unknown>), pdf_stale: { at: now, reason: `score chip retyped on page ${photoIndex + 1}` } };
      const { error: writeErr } = await supa.from('paper_marking_runs')
        .update({ result_json: next, total_awarded: totals.awarded, total_max: totals.max }).eq('id', runId);
      if (writeErr) return NextResponse.json({ error: `marks not saved: ${writeErr.message}` }, { status: 500 });
      marks = { awarded: totals.awarded, max: totals.max, questions: overrides.length, unmatched: unmatched.length };
    } else {
      marks = { awarded: NaN, max: NaN, questions: 0, unmatched: unmatched.length };
    }
  }

  try {
    const r = await fetch(`${botBase.replace(/\/+$/, '')}/api/compose-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      // Every field the overlay sends goes through — markSwaps feed the desk's ink hint (§14 ⑥).
      body: JSON.stringify(composeForwardBody({ runId, photoIndex, layerSvg, inkSvg, strokes, recordEdits, markSwaps, allowReleased })),
      signal: AbortSignal.timeout(170_000),
    });
    const out = await r.json().catch(() => ({}));
    if (before && (r.ok || marks)) {
      const { data: afterRun } = await supa.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle();
      if (afterRun) await recordCorrections(supa, before.result_json, afterRun.result_json, contextFromRun(before, 'annotate', new Date().toISOString()));
    }
    return NextResponse.json(marks ? { ...out, marks } : out, { status: r.ok ? 200 : (r.status || 502) });
  } catch (e) {
    return NextResponse.json({ error: `bot unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
