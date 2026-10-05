// GET /api/agent/twins/queue?bank=maths|science&level=&n=&pool=&focus_only=1&text_only=1
// Cloud twins (5 Oct 2026, docs/CLOUD.md §Cloud twins): the next seeds to twin, each a full
// packet — the seed question, its key and solution, its sub-skill, the twins that sub-skill
// already has, the nearest bank questions, and the author brief — so a claude.ai cloud
// session can author → blind-solve → check with NO database key. Same selection as
// scripts/twins/twin.mjs queue (maths) and scripts/science-twins/sci-twin.mjs queue (science —
// science_twin_units: 3 twins per (pool, sub-skill), open topics first, fewest twins first).
// No student data. AGENT_TOKEN_TWINS or admin; rate-limited per hour (lib/twins-door.ts).
import { NextRequest, NextResponse } from 'next/server';
import { twinsDoor, stampTwins } from '@/lib/twins-door';
import { mathQueue, scienceQueue, MATH_LEVELS } from '@/lib/twin-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const bank = sp.get('bank') === 'science' ? 'science' : sp.get('bank') === 'maths' || sp.get('bank') === 'math' ? 'maths' : null;
  const denied = await twinsDoor(req, 'queue', { bank, level: sp.get('level'), n: sp.get('n') });
  if (denied) return denied;
  if (!bank) return NextResponse.json({ error: 'bank=maths|science' }, { status: 400 });
  try {
    if (bank === 'maths') {
      const level = String(sp.get('level') || '').toUpperCase();
      if (!MATH_LEVELS.includes(level)) return NextResponse.json({ error: `level must be one of ${MATH_LEVELS.join(', ')}` }, { status: 400 });
      const n = Math.min(Math.max(Number(sp.get('n')) || 5, 1), 10);
      const out = await mathQueue(level, n, { focusOnly: sp.get('focus_only') === '1' });
      return NextResponse.json(out);
    }
    const n = Math.min(Math.max(Number(sp.get('n')) || 5, 1), 10);
    const out = await scienceQueue(n, { pool: sp.get('pool'), textOnly: sp.get('text_only') === '1' });
    return NextResponse.json(out);
  } catch (e) {
    void stampTwins(false, `queue ${bank} failed: ${(e as Error).message}`.slice(0, 280));
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
