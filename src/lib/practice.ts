// Shared helpers for the portal practice routes.
//
// Auth model: every practice route accepts EITHER a portal student session
// (Supabase cookie — the real product) OR the admin password Bearer header
// (Adrian's testing flow, predates portal auth). Students are additionally
// gated to the QB levels appropriate for their Airtable level.
import { NextRequest } from 'next/server';
import { verifyAdminAuth } from './schedule-helpers';
import { createSupabaseServer } from './supabase-server';
import type { PortalAccount } from './portal-auth';

export type PracticeCaller =
  | { kind: 'admin' }
  | { kind: 'student'; account: PortalAccount }
  | null;

export async function practiceAuth(req: NextRequest): Promise<PracticeCaller> {
  if (verifyAdminAuth(req)) return { kind: 'admin' };
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: account } = await supabase
    .from('portal_accounts').select('*').eq('id', user.id).single<PortalAccount>();
  return account ? { kind: 'student', account } : null;
}

// Airtable/portal level → QB levels a student may practise
export function qbLevelsFor(accountLevel: string | null): { key: string; label: string }[] {
  const l = accountLevel || '';
  if (/^Sec\s?1/i.test(l)) return [{ key: 'S1', label: 'Sec 1' }];
  if (/^Sec\s?2/i.test(l)) return [{ key: 'S2', label: 'Sec 2' }];
  if (/^Sec\s?3/i.test(l)) return [
    { key: 'S3_EM', label: 'E Math (Sec 3)' }, { key: 'S3_AM', label: 'A Math (Sec 3)' },
    { key: 'EM', label: 'E Math (Sec 4)' }, { key: 'AM', label: 'A Math (Sec 4)' },
  ];
  if (/^Sec/i.test(l)) return [
    { key: 'EM', label: 'E Math' }, { key: 'EM_NA', label: 'Math (NA)' }, { key: 'AM', label: 'A Math' },
  ];
  if (/^JC1/i.test(l)) return [{ key: 'JC1', label: 'H2 Math (JC1)' }, { key: 'JC2', label: 'H2 Math (JC2)' }];
  if (/^JC/i.test(l)) return [{ key: 'JC2', label: 'H2 Math' }];
  return [{ key: 'EM', label: 'E Math' }, { key: 'AM', label: 'A Math' }, { key: 'JC2', label: 'H2 Math' }];
}

export function levelAllowed(caller: PracticeCaller, level: string): boolean {
  if (!caller) return false;
  if (caller.kind === 'admin') return true;
  return qbLevelsFor(caller.account.level).some(a => a.key === level);
}
