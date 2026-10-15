// GET /api/cron/humanities-selfcheck — the Humanities marker checks and improves itself (15 Oct 2026,
// lib/humanities-selfcheck.ts). Every two hours: settle the checker's reads, decide tested rules, start
// tests on drafted rules, draft rules where misses repeat, queue checks of new answers. Telegram only when
// a rule goes live. Stamps job_runs. Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { runSelfcheck } from '@/lib/humanities-selfcheck-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  if (req.headers.get('x-vercel-cron')) return true;
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return true;
  if (admin && safeEqual(auth, `Bearer ${admin}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const r = await runSelfcheck();
    await logJobRun('humanities-selfcheck', true, `${r.audited} checks queued, ${r.settled} settled, ${r.drafted} rules drafted, ${r.tested} tests started, ${r.decided} decided`).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const message = (e as Error).message;
    await logJobRun('humanities-selfcheck', false, message).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
