// POST /api/admin/desk/preview { runId, photoIndex }
//
// 🧪 The red-pen PREVIEW (23 Sep 2026). Adrian: "I want to be able to test it
// (see the results) without touching the current marking pipeline — don't want
// to have to toggle on and off." The bot draws one already-marked page in
// the red-ink mode in a throw-away child process whose env alone carries
// MARK_RED_INK=1 (bot ai/preview-page.js; ONE mode since 23 Sep 2026 — Adrian:
// "do just one red ink mode — we will just iterate on one mode"): no marker call,
// no change to the live switch, the delivered pages untouched. The image lands under
// runs/<id>/preview/ and the run keeps a breadcrumb in result_json.previews[].
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 300;


export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const runId = typeof b.runId === 'string' ? b.runId.trim() : '';
  const photoIndex = Number(b.photoIndex);
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(photoIndex) || photoIndex < 0) {
    return NextResponse.json({ error: 'runId and photoIndex are required' }, { status: 400 });
  }

  const botBase = process.env.BOT_BASE_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !secret) return NextResponse.json({ error: 'bot not configured (BOT_BASE_URL / BOT_INTERNAL_SECRET)' }, { status: 503 });
  try {
    const r = await fetch(`${botBase.replace(/\/+$/, '')}/api/preview-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ runId, photoIndex }),
      signal: AbortSignal.timeout(200_000),
    });
    const out = await r.json().catch(() => ({}));
    return NextResponse.json(out, { status: r.ok ? 200 : (r.status || 502) });
  } catch (e) {
    return NextResponse.json({ error: `bot unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
