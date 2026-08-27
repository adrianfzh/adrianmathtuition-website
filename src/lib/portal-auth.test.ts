import { describe, it, expect, vi } from 'vitest';

// portal-auth's session helpers pull in next/headers via supabase-server —
// mock the I/O edges so this stays a pure unit test of portalIdentity.
vi.mock('./supabase-server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('./airtable', () => ({ airtableRequest: vi.fn() }));

import { portalIdentity } from './portal-auth';
import { isTuitionAccount } from './portal-passes';

const UUID = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff';

describe('portalIdentity — THE portal identity convention', () => {
  it('tuition account → the Airtable rec id, verbatim (existing rows keep working)', () => {
    expect(portalIdentity({ id: UUID, airtable_student_id: 'recABC123xyz' })).toBe('recABC123xyz');
  });

  it("stranger account (airtable_student_id = '') → acct:<uuid>", () => {
    expect(portalIdentity({ id: UUID, airtable_student_id: '' })).toBe(`acct:${UUID}`);
  });

  it('null / missing airtable id → acct:<uuid> too', () => {
    expect(portalIdentity({ id: UUID, airtable_student_id: null })).toBe(`acct:${UUID}`);
    expect(portalIdentity({ id: UUID })).toBe(`acct:${UUID}`);
  });

  it('acct: form can never collide with Airtable ids (rec… never starts with acct:)', () => {
    const stranger = portalIdentity({ id: UUID, airtable_student_id: '' });
    expect(stranger.startsWith('acct:')).toBe(true);
    expect(stranger.startsWith('rec')).toBe(false);
    // And two different accounts get two different identities.
    expect(portalIdentity({ id: 'other-uuid', airtable_student_id: '' })).not.toBe(stranger);
  });

  it('identity is never empty for any account row', () => {
    for (const airtableId of ['recXYZ', '', null, undefined, '   ']) {
      expect(portalIdentity({ id: UUID, airtable_student_id: airtableId }).length).toBeGreaterThan(0);
    }
  });

  it('agrees with isTuitionAccount on every edge (whitespace-only id counts as stranger)', () => {
    for (const airtableId of ['recXYZ', '', null, undefined, '   ']) {
      const account = { id: UUID, airtable_student_id: airtableId };
      const identity = portalIdentity(account);
      // Tuition ⇔ the identity is the raw Airtable id; stranger ⇔ acct: form.
      expect(identity.startsWith('acct:')).toBe(!isTuitionAccount(account));
    }
  });
});
