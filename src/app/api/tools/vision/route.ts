import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// Public photo-extraction proxy for the /tools pages (graph digitizer on
// graph-transformations, data-table reader on linear-law). No auth by design —
// the tools are public — so ALL protection lives here + at the bot: kind/size
// checks before forwarding, and the bot rate-limits per visitor IP (12/hr) and
// globally (400/day). The bot endpoint itself requires BOT_INTERNAL_SECRET,
// which only this proxy holds; the browser never sees it.
const KINDS = new Set(['graph-curve', 'linear-law']);

export async function POST(req: NextRequest) {
  const botBase = process.env.BOT_BASE_URL;
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !secret) {
    return NextResponse.json({ error: 'photo extraction not configured' }, { status: 503 });
  }

  let body: { kind?: string; image?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const kind = String(body.kind || '');
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 });

  // Accept a data URL or bare base64; the client downscales to ≤1400px JPEG so
  // a typical payload is ~200-400KB. Hard cap well under Vercel's 4.5MB limit.
  const image = String(body.image || '');
  const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  const mimeType = m ? m[1] : 'image/jpeg';
  const imageBase64 = m ? m[2] : image;
  if (!imageBase64 || imageBase64.length > 4_000_000) {
    return NextResponse.json({ error: 'image missing or too large' }, { status: 400 });
  }

  // The visitor's IP for the bot's per-device limit (first x-forwarded-for hop).
  const fwd = req.headers.get('x-forwarded-for') || '';
  const clientIp = (fwd.split(',')[0] || 'unknown').trim().slice(0, 64);

  try {
    const r = await fetch(`${botBase}/api/tools-vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-tool-client-ip': clientIp,
      },
      body: JSON.stringify({ kind, imageBase64, mimeType }),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await r.json().catch(() => ({ error: 'extraction failed' }));
    return NextResponse.json(data, { status: r.status });
  } catch {
    return NextResponse.json({ error: 'extraction timed out — try a clearer, closer photo' }, { status: 504 });
  }
}
