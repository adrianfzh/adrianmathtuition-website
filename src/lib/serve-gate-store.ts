// The data half of lib/serve-gate.ts: the student's practice levels, whether the
// question is on their own list, and — only when the level rule says no — the
// practice pool itself, so a question the RPCs DO serve (filed under a sub-skill
// of another level) is never refused by a shortcut.
import type { SupabaseClient } from '@supabase/supabase-js';
import { qbLevelsFor, bankScope } from '@/lib/qb-levels';
import { portalIdentity } from '@/lib/portal-auth';
import { practiceQLevels, serveRefusal, type GateRow, type Refusal } from '@/lib/serve-gate';

export const GATE_COLUMNS = 'level, school, national, deleted_at, ai_generated, verified, flagged_count, legacy_syllabus';

type Account = { id: string; airtable_student_id?: string | null; level?: string | null; subjects?: string[] | null; is_ip?: boolean | null };

export async function studentRefusal(admin: SupabaseClient, account: Account, questionId: string, q: GateRow): Promise<Refusal | null> {
  const keys = qbLevelsFor(account.level ?? null, account.subjects ?? null).map((l) => l.key);
  const scopes = keys.map((k) => bankScope(k));
  const allowed = [...new Set(scopes.flatMap((s) => [...practiceQLevels(s.level), ...(s.qlevel ? [s.qlevel] : [])]))];
  const { data: asg } = await admin.from('portal_assignments').select('id')
    .eq('airtable_student_id', portalIdentity(account)).eq('question_id', questionId).neq('status', 'revoked').limit(1);
  const ctx = { allowedQLevels: allowed, isIp: !!account.is_ip, assigned: (asg?.length ?? 0) > 0 };
  const refusal = serveRefusal(q, ctx);
  if (refusal !== 'level') return refusal;
  for (const level of [...new Set(scopes.map((s) => s.level))]) {
    const { data } = await admin.rpc('practice_pool', { p_level: level, p_topic: null, p_is_ip: !!account.is_ip, p_admin: false })
      .eq('question_id', questionId).limit(1);
    if ((data as unknown[] | null)?.length) return null;
  }
  return 'level';
}
