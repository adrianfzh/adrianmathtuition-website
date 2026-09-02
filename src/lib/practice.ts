// Shared helpers for the portal practice routes.
//
// Auth model: every practice route accepts EITHER a portal student session
// (Supabase cookie — the real product) OR the admin password Bearer header /
// signed admin cookie (Adrian's testing flow, predates portal auth). Students
// are additionally gated to the QB levels appropriate for their Airtable level.
//
// ORDER MATTERS: the student session is checked FIRST. Adrian tests the portal
// through his demo-student login in the same Safari that holds his admin
// cookie; when admin won (pre-2026-08-21) every API call from that browser
// was treated as admin — the overview returned all nine QB levels and
// /grade 401'd "Student session required" — while the page itself (which
// detects the Supabase session client-side) believed it was a student.
import { NextRequest } from 'next/server';
import { verifyAdminAuth } from './schedule-helpers';
import { createSupabaseServer } from './supabase-server';
import { getSessionUser, type PortalAccount } from './portal-auth';
import { ALL_QB_LEVELS, qbLevelsFor } from './qb-levels';

export type PracticeCaller =
  | { kind: 'admin' }
  | { kind: 'student'; account: PortalAccount }
  | null;

export async function practiceAuth(req: NextRequest): Promise<PracticeCaller> {
  // Local JWT verification (portal-auth fast path) — the picker fires several
  // of these per visit and each used to pay the Auth-server round-trip.
  const user = await getSessionUser();
  if (user) {
    const supabase = await createSupabaseServer();
    const { data: account } = await supabase
      .from('portal_accounts').select('*').eq('id', user.id).single<PortalAccount>();
    if (account) return { kind: 'student', account };
  }
  return verifyAdminAuth(req) ? { kind: 'admin' } : null;
}

// QB level list + per-student level gating live in lib/qb-levels.ts (pure,
// client-safe); re-exported here so existing server imports keep working.
export { ALL_QB_LEVELS, qbLevelsFor, bankScope } from './qb-levels';

/**
 * Sub-group AUDIENCE params for the practice RPCs (practice_topics /
 * practice_overview / practice_subgroups / practice_next — see
 * migrations/subgroup_audience.sql and lib/subgroup-visibility.ts). Admin
 * (Adrian's Bearer/cookie without a student session) sees everything; a
 * student sees the 'all' audience plus 'ip' / lent material when their
 * account is IP. A student session ALWAYS wins in practiceAuth, so Adrian's
 * demo-student login shows him exactly that student's view.
 */
export function rpcAudience(caller: NonNullable<PracticeCaller>): { p_is_ip: boolean; p_admin: boolean } {
  if (caller.kind === 'admin') return { p_is_ip: true, p_admin: true };
  return { p_is_ip: Boolean(caller.account.is_ip), p_admin: false };
}

export function levelAllowed(caller: PracticeCaller, level: string): boolean {
  if (!caller) return false;
  if (caller.kind === 'admin') return true;
  return qbLevelsFor(caller.account.level, caller.account.subjects).some(a => a.key === level);
}

// ── Science (2026-09-02) ─────────────────────────────────────────────────────
// The physics bank (lib/science-bank) joins the picker as its own level key.
// Students reach it only through lib/portal-beta.sciencePracticeAccess —
// closed until SCIENCE_PRACTICE_OPEN_TO_STUDENTS flips, Adrian's admin cookie
// previews it — so the science checks are async where the math ones are pure.
import { isScienceLevel, scienceLevelsFor } from './science-levels';
import { sciencePracticeAccess } from './portal-beta';

/** The caller's full level list: math (pure) + whichever science levels they may see. */
export async function practiceLevelsFor(caller: NonNullable<PracticeCaller>): Promise<{ key: string; label: string }[]> {
  if (caller.kind === 'admin') return ALL_QB_LEVELS;
  const math = qbLevelsFor(caller.account.level, caller.account.subjects);
  const science = scienceLevelsFor(caller.account.subjects, await sciencePracticeAccess());
  return [...math, ...science];
}

/** levelAllowed, plus the science gate for science keys. */
export async function practiceLevelAllowed(caller: PracticeCaller, level: string): Promise<boolean> {
  if (!caller) return false;
  if (!isScienceLevel(level)) return levelAllowed(caller, level);
  if (caller.kind === 'admin') return true;
  return scienceLevelsFor(caller.account.subjects, await sciencePracticeAccess()).some(l => l.key === level);
}
