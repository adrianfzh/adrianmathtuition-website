// /api/agent/twins/figure — the figure library for a cloud session (5 Oct 2026).
//   GET              → every family, one line each (the bot's lib/figures)
//   GET ?doc=<fam>   → that family's spec language (SPEC_DOC) — read it BEFORE writing a spec
//   POST {spec}      → verify + render: {ok, family, png (base64)} so the author, the blind
//                      solver and the checker can LOOK at the figure; or 422 {reason}
// Typed specs only — the construction engine (.cjs) runs code and is never offered here.
import { NextRequest, NextResponse } from 'next/server';
import { twinsDoor } from '@/lib/twins-door';
import { figureDoc, renderFigure } from '@/lib/twin-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const fam = req.nextUrl.searchParams.get('doc');
  const denied = await twinsDoor(req, 'figure-doc', { family: fam });
  if (denied) return denied;
  const r = await figureDoc(fam);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const denied = await twinsDoor(req, 'figure-render');
  if (denied) return denied;
  const spec = raw && typeof raw === 'object' ? ((raw as Record<string, unknown>).spec ?? raw) as Record<string, unknown> : null;
  const r = await renderFigure(spec);
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: 422 });
  return NextResponse.json({ ok: true, family: r.family, png: r.png.toString('base64') });
}
