// Counting a student's paid model calls on portal_event_log (5 Oct 2026) — the
// rules are in lib/grade-limit.ts. Fail-open on a read error (a ledger hiccup
// must not lock a student out); the insert is best-effort.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function countEventsToday(admin: SupabaseClient, identity: string, kind: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await admin.from('portal_event_log').select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('kind', kind).gte('created_at', since);
  return error ? 0 : count || 0;
}

export async function recordEvents(admin: SupabaseClient, identity: string, kind: string, n = 1, detail?: Record<string, unknown>): Promise<void> {
  const rows = Array.from({ length: n }, () => ({ identity, kind, detail: detail ?? null }));
  await admin.from('portal_event_log').insert(rows).then(() => {}, () => {});
}
