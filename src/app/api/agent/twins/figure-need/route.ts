// POST /api/agent/twins/figure-need — a cloud session parked a seed because no figure-library
// family draws the picture it needs (5 Oct 2026). Body {bank, seed_id, what, shape?, subject?,
// level?, topic?} → one figure_needs row (lib/figure-needs-store.ts). AGENT_TOKEN_TWINS or admin.
import { NextRequest, NextResponse } from 'next/server';
import { twinsDoor } from '@/lib/twins-door';
import { recordFigureNeed } from '@/lib/figure-needs-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const denied = await twinsDoor(req, 'figure-need', { bank: b?.bank ?? null, seed_id: b?.seed_id ?? null });
  if (denied) return denied;
  const bank = b?.bank === 'science' ? 'science' : b?.bank === 'maths' || b?.bank === 'math' ? 'maths' : null;
  const str = (k: string) => (typeof b?.[k] === 'string' && (b[k] as string).trim() ? (b[k] as string).trim() : null);
  if (!bank || !str('what')) return NextResponse.json({ ok: false, error: 'bank (maths|science) + what (one plain line) required' }, { status: 400 });
  const seed = str('seed_id');
  if (seed && !/^[0-9a-f-]{36}$/i.test(seed)) return NextResponse.json({ ok: false, error: 'seed_id must be a uuid' }, { status: 400 });
  const shape = await recordFigureNeed({ bank, seed_id: seed, subject: str('subject'), level: str('level'), topic: str('topic'), what: str('what')!, shape: str('shape'), source: 'cloud-door' });
  if (!shape) return NextResponse.json({ ok: false, error: 'could not record' }, { status: 500 });
  return NextResponse.json({ ok: true, shape });
}
