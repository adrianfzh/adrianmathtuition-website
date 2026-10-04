// Two people using one invite link at the same moment → only the first succeeds.
// The fake below behaves like Postgres for this one statement: each UPDATE checks
// its WHERE against the row as it is at that moment and runs whole (row lock).
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimInvite, releaseInvite } from './invite-claim';

type Row = Record<string, string | null>;
function fakeDb(row: Row) {
  const client = {
    from: () => ({
      update(patch: Row) {
        const conds: ((r: Row) => boolean)[] = [];
        const q = {
          eq: (c: string, v: string) => { conds.push((r) => r[c] === v); return q; },
          is: (c: string, v: null) => { conds.push((r) => r[c] === v); return q; },
          gt: (c: string, v: string) => { conds.push((r) => String(r[c]) > v); return q; },
          select: async () => run(),
          then: (res: (v: unknown) => void) => res(run()),
        };
        const run = () => {
          if (!conds.every((f) => f(row))) return { data: [], error: null };
          Object.assign(row, patch);
          return { data: [{ ...row }], error: null };
        };
        return q;
      },
    }),
  };
  return client as unknown as SupabaseClient;
}

describe('claimInvite', () => {
  const fresh = (): Row => ({ token: 't1', airtable_student_id: 'recA', email: 'a@x', expires_at: '2099-01-01T00:00:00.000Z', consumed_at: null, consumed_by_user_id: null });

  it('two claims at the same moment: exactly one wins', async () => {
    const row = fresh();
    const db = fakeDb(row);
    const [a, b] = await Promise.all([claimInvite(db, 't1', '2026-10-05T00:00:00.000Z'), claimInvite(db, 't1', '2026-10-05T00:00:00.001Z')]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(row.consumed_at).toBe('2026-10-05T00:00:00.000Z');
  });
  it('a used or expired link cannot be claimed', async () => {
    expect(await claimInvite(fakeDb({ ...fresh(), consumed_at: '2026-01-01T00:00:00.000Z' }), 't1')).toBeNull();
    expect(await claimInvite(fakeDb({ ...fresh(), expires_at: '2020-01-01T00:00:00.000Z' }), 't1', '2026-10-05T00:00:00.000Z')).toBeNull();
  });
  it('a failed sign-up hands only its OWN claim back, so the link works again', async () => {
    const row = fresh();
    const db = fakeDb(row);
    await claimInvite(db, 't1', '2026-10-05T00:00:00.000Z');
    await releaseInvite(db, 't1', '2026-10-05T09:09:09.000Z'); // not ours: nothing changes
    expect(row.consumed_at).not.toBeNull();
    await releaseInvite(db, 't1', '2026-10-05T00:00:00.000Z');
    expect(row.consumed_at).toBeNull();
    expect(await claimInvite(db, 't1', '2026-10-05T00:01:00.000Z')).not.toBeNull();
  });
});
