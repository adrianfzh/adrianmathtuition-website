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

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { runId?: string; photoIndex?: number; layerSvg?: string; inkSvg?: string; strokes?: unknown; recordEdits?: unknown; markSwaps?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { runId, layerSvg, inkSvg, strokes, recordEdits, markSwaps } = body;
  const photoIndex = Number(body.photoIndex);
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(photoIndex) || photoIndex < 0) {
    return NextResponse.json({ error: 'runId and photoIndex are required' }, { status: 400 });
  }
  if (typeof layerSvg !== 'string' || typeof inkSvg !== 'string') return NextResponse.json({ error: 'layerSvg and inkSvg must be strings' }, { status: 400 });
  const botBase = process.env.BOT_BASE_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !secret) return NextResponse.json({ error: 'bot not configured (BOT_BASE_URL / BOT_INTERNAL_SECRET)' }, { status: 503 });
  try {
    const r = await fetch(`${botBase.replace(/\/+$/, '')}/api/compose-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      // Every field the overlay sends goes through — markSwaps feed the desk's ink hint (§14 ⑥).
      body: JSON.stringify(composeForwardBody({ runId, photoIndex, layerSvg, inkSvg, strokes, recordEdits, markSwaps })),
      signal: AbortSignal.timeout(170_000),
    });
    const out = await r.json().catch(() => ({}));
    return NextResponse.json(out, { status: r.ok ? 200 : (r.status || 502) });
  } catch (e) {
    return NextResponse.json({ error: `bot unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
