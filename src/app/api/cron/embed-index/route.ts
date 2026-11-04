// GET /api/cron/embed-index — the nightly bank index top-up (6 Oct 2026).
//
// Adrian: "yes build the nightly job". Nothing that ADDS a question to a bank gives it its
// search index (twins, science twins, the extraction insert), so a new question could never be
// found by the solver's bank look or any "similar question" search: 10,769 maths and 17,193
// science questions had piled up unseen by 6 Oct. This asks the bot — which holds the
// embedding key and both banks — to index whatever has none (bot lib/embed-backfill.js,
// POST /api/embed-index). The bot answers 202 and writes the job_runs row 'embed-index'
// itself when it finishes, with the counts; this route stamps only when it could not start it.
//
// Cron: `40 18 * * *` UTC = 02:40 SGT, after the evening's twins and before the 3am sweeps.
// Cost: a normal day's few hundred questions is a fraction of a cent.
// Auth: CRON_SECRET or ADMIN_PASSWORD bearer (lib/cron-auth; the scheduler header is not proof, 4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server';
import { logJobRun } from '@/lib/job-log';
import { cronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const authed = cronAuth;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const botBase = (process.env.BOT_BASE_URL || '').trim();
  const botSecret = (process.env.BOT_INTERNAL_SECRET || '').trim();
  if (!botBase || !botSecret) return NextResponse.json({ error: 'bot not configured' }, { status: 503 });
  try {
    const r = await fetch(`${botBase}/api/embed-index`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 202) return NextResponse.json({ ok: true, state: 'started' });
    if (r.status === 409) return NextResponse.json({ ok: true, state: 'already running' });
    const why = `the bot answered ${r.status}`;
    await logJobRun('embed-index', false, `could not start: ${why}`);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    await logJobRun('embed-index', false, `could not start: ${why.slice(0, 200)}`);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }
}
