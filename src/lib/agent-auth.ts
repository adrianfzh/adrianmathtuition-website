// Scoped agent tokens (17 Sep 2026, SPEC-STUDENT-FIRST follow-on; docs/CLOUD.md
// §Step 2) — how a cloud session acts on student data WITHOUT the admin
// password: one narrow token per action family, each a Vercel env var Adrian
// can rotate on its own, accepted only by the routes of that family, and every
// use written to `agent_actions` (doctrine step 5: log + alarm).
//
//   AGENT_TOKEN_RELEASE   mark-triage (agree / override / release / re-mark) + release-with-sheet (the desk's one-tap release)
//   AGENT_TOKEN_SHEETS    sheet-jobs (queue / revise / cancel a Practice Again sheet)
//   AGENT_TOKEN_REINSTATE student-reinstate
//   AGENT_TOKEN_SWITCHES  marking-settings + slot-accounts
//   AGENT_TOKEN_PAPERS    papers (tag / rename / looked-at) + desk/rebuild
//   AGENT_TOKEN_ASSIGN    assignments (Send work)
//
// The admin password and the cookie keep working everywhere; this is an
// additional door, closed when its env var is unset. Pure check + a fail-soft
// log; nothing here decides what an action may do.
import type { NextRequest } from 'next/server';
import { safeEqual } from './safe-equal';
import { getSupabaseAdmin } from './supabase';

export type AgentScope = 'release' | 'sheets' | 'reinstate' | 'switches' | 'papers' | 'assign';

const ENV: Record<AgentScope, string> = {
  release: 'AGENT_TOKEN_RELEASE', sheets: 'AGENT_TOKEN_SHEETS', reinstate: 'AGENT_TOKEN_REINSTATE',
  switches: 'AGENT_TOKEN_SWITCHES', papers: 'AGENT_TOKEN_PAPERS', assign: 'AGENT_TOKEN_ASSIGN',
};

/** Pure: does this bearer match the scope's token? Unset token → never. */
export function bearerMatchesScope(authorization: string | null | undefined, scope: AgentScope, env: NodeJS.ProcessEnv = process.env): boolean {
  const token = env[ENV[scope]];
  if (!token || token.length < 24) return false;
  return safeEqual(authorization ?? '', `Bearer ${token}`);
}

/**
 * The request carries the scope's agent token. On a match the use is logged
 * (fail-soft) so /admin/ops can show what agents did. Call beside
 * verifyAdminAuth: `if (!verifyAdminAuth(req) && !verifyAgentAuth(req, 'release', {...})) 401`.
 */
export function verifyAgentAuth(req: NextRequest, scope: AgentScope, log?: { route: string; action?: string | null; detail?: unknown }): boolean {
  if (!bearerMatchesScope(req.headers.get('authorization'), scope)) return false;
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    void getSupabaseAdmin().from('agent_actions').insert({ scope, route: log?.route ?? req.nextUrl.pathname, action: log?.action ?? null, detail: log?.detail ?? null, ip })
      .then(({ error }) => { if (error) console.warn('[agent-auth] log failed:', error.message); });
  } catch (e) { console.warn('[agent-auth] log failed:', (e as Error).message); }
  return true;
}
