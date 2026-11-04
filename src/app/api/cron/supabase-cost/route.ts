// GET /api/cron/supabase-cost — 💸 the daily Supabase cost check (4 Nov 2026, Adrian: "give me
// warning if supabase costs exceeds a certain amount, so I don't get a shock at the bill").
// Rules, prices and wording → lib/supabase-cost.ts; fetching → lib/supabase-cost-store.ts.
//
// Called every morning by the bot's 5:45 fixer (bot repo .claude/skills/bot-review/SKILL.md §1g)
// with the worker's admin token; the fixer puts `lines` into the morning brief, so this route
// sends nothing itself. `lines: []` = nothing new to say (the usual answer).
//
//   ?dry=1 → read and work it out, but do not remember what was "sent" (no stamp), and answer
//            `all` = every warning today's numbers justify, sent before or not.
//
// Stamps job_runs `supabase-cost` with meta { cycle_start, sent[], projection } — so a warning is
// given once per cycle. A failure stamps ok=false and answers 500 with a plain error.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { alertExtraUsd, briefLines, costSummary, newWarnings, project, warnings } from '@/lib/supabase-cost';
import { lastSent, readUsage } from '@/lib/supabase-cost-store';

export const runtime = 'nodejs';
export const maxDuration = 120;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && safeEqual(auth, `Bearer ${process.env.CRON_SECRET}`)) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  if (process.env.ADMIN_PASSWORD && safeEqual(auth, `Bearer ${process.env.ADMIN_PASSWORD}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const [usage, prev] = await Promise.all([readUsage(), lastSent()]);
    const p = project(usage);
    const threshold = alertExtraUsd();
    const all = warnings(usage, p, threshold);
    const fresh = newWarnings(all, prev?.sent ?? null, prev?.cycleStart ?? null, usage.cycleStart);
    const summary = costSummary(usage, p);
    const sameCycle = prev && prev.cycleStart === usage.cycleStart;
    const sent = [...new Set([...(sameCycle ? prev!.sent : []), ...fresh.map((w) => w.key)])];
    if (!dry) {
      await logJobRun('supabase-cost', true, summary, {
        cycle_start: usage.cycleStart, sent, exact: usage.exact, threshold_usd: threshold,
        projection: p, platform_error: usage.platformError || null,
      });
    }
    return NextResponse.json({
      ok: true, dry, exact: usage.exact, threshold, summary,
      lines: briefLines(fresh, usage),
      ...(dry ? { all: all.map((w) => w.line) } : {}),
      projection: p, usage: { ...usage, platformError: usage.platformError || null },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (!dry) await logJobRun('supabase-cost', false, `the daily Supabase cost check could not run: ${msg}`.slice(0, 300));
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
