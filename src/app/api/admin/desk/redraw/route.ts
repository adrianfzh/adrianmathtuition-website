// POST /api/admin/desk/redraw { runId, photoIndex, allowReleased? }
//
// After Adrian changes a part's marks on the desk, the red pen on that page
// still shows the marker's ink. This asks the bot to redraw the page from the
// stored original with the marks as they now stand (bot /api/reannotate-page →
// ai/reannotate-page.js, which holds the one rule about which ink changes).
// The parts sent are the run's CURRENT per-part marks for every question on
// the page — the record is the truth, the drawing follows it. The bot writes
// the new page onto the run; the PDFs stay stale until Rebuild PDFs & release.
//
// `allowReleased: true` (10 Sep 2026) is the door for a paper the student
// ALREADY has: auto-release moved Adrian's checkpoint to after the fact, and he
// found three wrong ✗/✓ on Isabelle's page 3 of run 9e66d0b4 once she held it.
// With the flag the bot re-inks the page and stamps the run, and this route then
// runs the SAME re-issue the override path uses (mark-triage {action:'reissue'})
// — which rebuilds both PDFs with allowReleased, stamps reissued_at so the cover
// re-renders, flips the assignment's score and tells the student on Telegram. So
// one call replaces the copy in their hands. Without the flag: 409, unchanged.
//
// The re-issue is NOT preceded by a separate rebuildRunPdfs call: 'reissue' does
// that rebuild itself (mark-triage route → rebuildRunPdfs(…, allowReleased:true)),
// and a second pass would run Puppeteer over the whole paper twice for one copy.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { parseRedrawBody, redrawReleaseRefusal, partsForPage } from '@/lib/desk-redraw';

export const runtime = 'nodejs';
// The bot redraw is 10–60 s; a re-issue then rebuilds both PDFs (up to ~200 s on a
// long prelim), so a released re-ink needs mark-triage's budget, not the old 120.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = parseRedrawBody(raw);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { runId, photoIndex, allowReleased } = parsed.req;

  const botBase = process.env.BOT_BASE_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !secret) return NextResponse.json({ error: 'bot not configured (BOT_BASE_URL / BOT_INTERNAL_SECRET)' }, { status: 503 });

  const supa = getSupabaseAdmin();
  const { data: run, error } = await supa.from('paper_marking_runs').select('id, released_at, result_json').eq('id', runId).single();
  if (error || !run) return NextResponse.json({ error: error?.message || 'run not found' }, { status: 404 });
  const refusal = redrawReleaseRefusal(run.released_at, allowReleased);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  const wasReleased = !!run.released_at;

  const parts = partsForPage((run.result_json as { results?: unknown })?.results, photoIndex);
  if (!parts.length) return NextResponse.json({ error: `no part-level marks on page ${photoIndex + 1} to draw from` }, { status: 400 });

  let out: Record<string, unknown>;
  try {
    const r = await fetch(`${botBase.replace(/\/+$/, '')}/api/reannotate-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ runId, photoIndex, parts, ...(allowReleased ? { allow_released: true } : {}) }),
      signal: AbortSignal.timeout(100_000),
    });
    out = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json(out, { status: r.status || 502 });
  } catch (e) {
    return NextResponse.json({ error: `bot unreachable: ${(e as Error).message}` }, { status: 502 });
  }

  // Unreleased: nothing else to do — the PDFs are rebuilt at release time.
  if (!wasReleased) return NextResponse.json({ ...out, reinked: true, reissued: false });

  // Released: the page on the run is now right and the student's copy is not.
  // A re-issue that fails is REPORTED, not thrown away — the ink is already
  // fixed, and Adrian can re-issue from the desk rather than redraw again.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = req.headers.get('authorization'); const cookie = req.headers.get('cookie');
  if (auth) headers.Authorization = auth;
  if (cookie) headers.cookie = cookie;
  try {
    const rr = await fetch(`${req.nextUrl.origin}/api/admin/mark-triage`, {
      method: 'POST', headers, body: JSON.stringify({ action: 'reissue', runId }),
      signal: AbortSignal.timeout(280_000),
    });
    const rd = (await rr.json().catch(() => ({}))) as { error?: string; via?: string; awarded?: number; max?: number };
    if (!rr.ok) {
      return NextResponse.json({ ...out, reinked: true, reissued: false, reissueError: rd.error || `HTTP ${rr.status}` }, { status: 200 });
    }
    return NextResponse.json({ ...out, reinked: true, reissued: true, via: rd.via ?? null, awarded: rd.awarded ?? null, max: rd.max ?? null });
  } catch (e) {
    return NextResponse.json({ ...out, reinked: true, reissued: false, reissueError: (e as Error).message }, { status: 200 });
  }
}
