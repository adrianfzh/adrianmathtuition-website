// Cloud twins — the one gate every /api/agent/twins/* door passes (5 Oct 2026).
// AGENT_TOKEN_TWINS (lib/agent-auth.ts — logged to agent_actions) or the admin password;
// then a per-token rate limit counted from agent_actions over the last hour
// (lib/twin-gates.ts rateDecision; serverless memory is not shared, the table is).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentAuth } from './agent-auth';
import { verifyAdminAuth } from './schedule-helpers';
import { getSupabaseAdmin } from './supabase';
import { rateDecision } from './twin-gates';
import { logJobRun } from './job-log';

export async function twinsDoor(req: NextRequest, action: string, detail?: unknown): Promise<NextResponse | null> {
  const admin = verifyAdminAuth(req);
  if (!admin && !verifyAgentAuth(req, 'twins', { route: req.nextUrl.pathname, action, detail })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (admin) return null;
  try {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const sb = getSupabaseAdmin();
    const [all, sub] = await Promise.all([
      sb.from('agent_actions').select('id', { count: 'exact', head: true }).eq('scope', 'twins').gte('created_at', since),
      sb.from('agent_actions').select('id', { count: 'exact', head: true }).eq('scope', 'twins').eq('action', 'submit').gte('created_at', since),
    ]);
    const d = rateDecision({ calls: all.count ?? 0, submits: sub.count ?? 0 }, action === 'submit');
    if (!d.allowed) return NextResponse.json({ error: d.reason }, { status: 429, headers: { 'retry-after': '600' } });
  } catch { /* an unreadable count never blocks the door */ }
  return null;
}

/** One logbook row per door call that did work (job_runs 'twins-cloud'). */
export function stampTwins(ok: boolean, summary: string, meta?: Record<string, unknown>) {
  return logJobRun('twins-cloud', ok, summary, meta);
}
