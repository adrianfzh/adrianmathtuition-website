// GET /api/agent/twins/queue?bank=maths|science&level=&n=&pool=&focus_only=1&text_only=1&skip=<id,id,…>&per_skill=3|5
// Cloud twins (5 Oct 2026, docs/CLOUD.md §Cloud twins): the next seeds to twin, each a full
// packet — the seed question, its key and solution, its sub-skill, the twins that sub-skill
// already has, the nearest bank questions, and the author brief — so a claude.ai cloud
// session can author → blind-solve → check with NO database key. Same selection as
// scripts/twins/twin.mjs queue (maths) and scripts/science-twins/sci-twin.mjs queue (science —
// science_twin_units: 3 twins per (pool, sub-skill), open topics first, fewest twins first).
// skip = seeds this session already parked (no figure family fits, an inconsistent seed), so
// they stop filling the window and the next sub-skill's seeds come forward (maths only).
// per_skill = the stage (3 now, 5 later — lib/twin-gates TWIN_STAGES); the counts come from the
// maths project's math_twin_units(), the same function twin.mjs and the dashboard read.
// No student data. AGENT_TOKEN_TWINS or admin; rate-limited per hour (lib/twins-door.ts).
import { NextRequest, NextResponse } from 'next/server';
import { twinsDoor, stampTwins } from '@/lib/twins-door';
import { mathQueue, scienceQueue, MATH_LEVELS } from '@/lib/twin-store';
import { TWIN_STAGES, TWINS_PER_SKILL } from '@/lib/twin-gates';

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
      const skip = String(sp.get('skip') || '').split(',').map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 300);
      const perAsked = Number(sp.get('per_skill'));
      const per = (TWIN_STAGES as readonly number[]).includes(perAsked) ? perAsked : TWINS_PER_SKILL;
      const out = await mathQueue(level, n, { focusOnly: sp.get('focus_only') === '1', skip, per });
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
