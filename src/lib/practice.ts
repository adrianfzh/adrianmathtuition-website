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
import type { PortalAccount } from './portal-auth';
import { qbLevelsFor } from './qb-levels';

export type PracticeCaller =
  | { kind: 'admin' }
  | { kind: 'student'; account: PortalAccount }
  | null;

export async function practiceAuth(req: NextRequest): Promise<PracticeCaller> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: account } = await supabase
      .from('portal_accounts').select('*').eq('id', user.id).single<PortalAccount>();
    if (account) return { kind: 'student', account };
  }
  return verifyAdminAuth(req) ? { kind: 'admin' } : null;
}

// QB level list + per-student level gating live in lib/qb-levels.ts (pure,
// client-safe); re-exported here so existing server imports keep working.
export { ALL_QB_LEVELS, qbLevelsFor, bankScope } from './qb-levels';

export function levelAllowed(caller: PracticeCaller, level: string): boolean {
  if (!caller) return false;
  if (caller.kind === 'admin') return true;
  return qbLevelsFor(caller.account.level, caller.account.subjects).some(a => a.key === level);
}
