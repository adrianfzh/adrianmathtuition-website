// POST /api/admin/desk/redraw { runId, photoIndex }
//
// After Adrian changes a part's marks on the desk, the red pen on that page
// still shows the marker's ink. This asks the bot to redraw the page from the
// stored original with the marks as they now stand (bot /api/reannotate-page →
// ai/reannotate-page.js, which holds the one rule about which ink changes).
// The parts sent are the run's CURRENT per-part marks for every question on
// the page — the record is the truth, the drawing follows it. The bot writes
// the new page onto the run; the PDFs stay stale until Rebuild PDFs & release.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Part = { label?: unknown; awarded?: unknown };
type Result = { photo_index?: unknown; question_number?: unknown; marking?: { parts?: Part[] } };

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { runId?: string; photoIndex?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const runId = body.runId;
  const photoIndex = Number(body.photoIndex);
  if (!runId || !Number.isInteger(photoIndex) || photoIndex < 0) {
    return NextResponse.json({ error: 'runId and photoIndex are required' }, { status: 400 });
  }
  const botBase = process.env.BOT_BASE_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !secret) return NextResponse.json({ error: 'bot not configured (BOT_BASE_URL / BOT_INTERNAL_SECRET)' }, { status: 503 });

  const supa = getSupabaseAdmin();
  const { data: run, error } = await supa.from('paper_marking_runs').select('id, released_at, result_json').eq('id', runId).single();
  if (error || !run) return NextResponse.json({ error: error?.message || 'run not found' }, { status: 404 });
  if (run.released_at) return NextResponse.json({ error: 'already released — the student has that copy' }, { status: 409 });
  const results = Array.isArray((run.result_json as { results?: unknown })?.results)
    ? ((run.result_json as { results: Result[] }).results)
    : [];
  const parts = results
    .filter(r => Number(r.photo_index) === photoIndex)
    .flatMap(r => (Array.isArray(r.marking?.parts) ? r.marking!.parts! : [])
      .filter(p => typeof p.label === 'string')
      .map(p => ({ question: String(r.question_number ?? ''), label: p.label as string, awarded: Number(p.awarded) || 0 })));
  if (!parts.length) return NextResponse.json({ error: `no part-level marks on page ${photoIndex + 1} to draw from` }, { status: 400 });

  try {
    const r = await fetch(`${botBase.replace(/\/+$/, '')}/api/reannotate-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ runId, photoIndex, parts }),
      signal: AbortSignal.timeout(100_000),
    });
    const out = await r.json().catch(() => ({}));
    return NextResponse.json(out, { status: r.ok ? 200 : (r.status || 502) });
  } catch (e) {
    return NextResponse.json({ error: `bot unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
