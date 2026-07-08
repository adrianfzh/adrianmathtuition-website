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

// The full QB level list — what admin (Adrian's testing) sees. Mirrors
// ADMIN_LEVELS in the practice page so both the picker UI and the overview
// endpoint agree on the admin view.
export const ALL_QB_LEVELS: { key: string; label: string }[] = [
  { key: 'S1', label: 'Sec 1' }, { key: 'S2', label: 'Sec 2' },
  { key: 'S3_EM', label: 'Sec 3 E-Math' }, { key: 'S3_AM', label: 'Sec 3 A-Math' },
  { key: 'EM', label: 'O-Level E-Math' }, { key: 'EM_NA', label: 'E-Math (NA)' },
  { key: 'AM', label: 'O-Level A-Math' }, { key: 'JC1', label: 'JC1 H2 Math' },
  { key: 'JC2', label: 'JC2 H2 Math' },
];

// Airtable Subjects (multipleSelects) → the QB level keys that subject unlocks.
// A key survives subject-filtering if ANY of the student's subjects maps to it.
const SUBJECT_KEYS: Record<string, string[]> = {
  'E Math': ['EM', 'S3_EM', 'EM_NA'],
  'A Math': ['AM', 'S3_AM'],
  'H2 Math': ['JC1', 'JC2'],
  'H1 Math': ['JC1', 'JC2'],
  'Math': ['S1', 'S2'],
  'IP Math': ['S1', 'S2'],
};

// Airtable/portal level → QB levels a student may practise.
// When `subjects` is a non-empty array, the level-derived candidate list is
// further filtered to the keys their subjects unlock. If subjects are absent
// or the filter would empty the list, fall back to the level-only result.
export function qbLevelsFor(
  accountLevel: string | null,
  subjects?: string[] | null,
): { key: string; label: string }[] {
  const l = accountLevel || '';
  let base: { key: string; label: string }[];
  if (/^Sec\s?1/i.test(l)) base = [{ key: 'S1', label: 'Sec 1' }];
  else if (/^Sec\s?2/i.test(l)) base = [{ key: 'S2', label: 'Sec 2' }];
  else if (/^Sec\s?3/i.test(l)) base = [
    { key: 'S3_EM', label: 'E Math (Sec 3)' }, { key: 'S3_AM', label: 'A Math (Sec 3)' },
    { key: 'EM', label: 'E Math (Sec 4)' }, { key: 'AM', label: 'A Math (Sec 4)' },
  ];
  else if (/^Sec/i.test(l)) base = [
    { key: 'EM', label: 'E Math' }, { key: 'EM_NA', label: 'Math (NA)' }, { key: 'AM', label: 'A Math' },
  ];
  else if (/^JC1/i.test(l)) base = [{ key: 'JC1', label: 'H2 Math (JC1)' }, { key: 'JC2', label: 'H2 Math (JC2)' }];
  else if (/^JC/i.test(l)) base = [{ key: 'JC2', label: 'H2 Math' }];
  else base = [{ key: 'EM', label: 'E Math' }, { key: 'AM', label: 'A Math' }, { key: 'JC2', label: 'H2 Math' }];

  if (subjects && subjects.length) {
    const allowed = new Set<string>();
    for (const s of subjects) for (const k of (SUBJECT_KEYS[s] || [])) allowed.add(k);
    if (allowed.size) {
      const filtered = base.filter(b => allowed.has(b.key));
      if (filtered.length) return filtered;
    }
  }
  return base;
}

export function levelAllowed(caller: PracticeCaller, level: string): boolean {
  if (!caller) return false;
  if (caller.kind === 'admin') return true;
  return qbLevelsFor(caller.account.level, caller.account.subjects).some(a => a.key === level);
}
