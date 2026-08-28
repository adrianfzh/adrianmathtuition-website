import { describe, it, expect, vi } from 'vitest';

// portal-auth's session helpers pull in next/headers via supabase-server —
// mock the I/O edges so this stays a pure unit test of portalIdentity.
vi.mock('./supabase-server', () => ({ createSupabaseServer: vi.fn() }));
vi.mock('./airtable', () => ({ airtableRequest: vi.fn() }));

import { claimsToSessionUser, portalIdentity } from './portal-auth';
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

  it('agrees with isTuitionAccount on every NON-deactivated edge (whitespace-only id counts as stranger)', () => {
    for (const airtableId of ['recXYZ', '', null, undefined, '   ']) {
      const account = { id: UUID, airtable_student_id: airtableId };
      const identity = portalIdentity(account);
      // For active accounts: tuition ⇔ the identity is the raw Airtable id;
      // stranger ⇔ acct: form. (Deactivated accounts split the two BY DESIGN —
      // pinned below.)
      expect(identity.startsWith('acct:')).toBe(!isTuitionAccount(account));
    }
  });

  // Offboarding (2026-08-28): deactivation flips the PASS gate, never the
  // identity. A graduate Adrian offboards must keep every marked paper,
  // notebook entry and attempt keyed on their rec id — whether or not they
  // later pay S$29 to come back and see them.
  it('DEACTIVATED ex-tuition account KEEPS its Airtable rec id (history stays theirs)', () => {
    const offboarded = {
      id: UUID,
      airtable_student_id: 'recABC123xyz',
      deactivated_at: '2026-08-28T04:00:00.000Z',
    };
    expect(portalIdentity(offboarded)).toBe('recABC123xyz');
    // …even though the pass gate now treats them like a stranger:
    expect(isTuitionAccount(offboarded)).toBe(false);
  });

  it('deactivated STRANGER account keeps the acct: form too', () => {
    const offboardedStranger = { id: UUID, airtable_student_id: '', deactivated_at: '2026-08-28T04:00:00.000Z' };
    expect(portalIdentity(offboardedStranger)).toBe(`acct:${UUID}`);
  });
});

// ── Local-JWT fast path (2026-08-29) ─────────────────────────────────────────
// jose enforces signature, expiry and issuer BEFORE these claims are seen;
// this gate is what stands between "a validly signed token" and "a signed-in
// person" — the anon/publishable key is also a validly signed token on
// legacy projects, and it must never mint a session.

describe('claimsToSessionUser', () => {
  it('accepts a real user token: sub + authenticated role', () => {
    expect(claimsToSessionUser({ sub: 'uuid-1', role: 'authenticated', email: 'kid@example.com' }))
      .toEqual({ id: 'uuid-1', email: 'kid@example.com' });
  });

  it('rejects the anon-key shape (role anon, no sub)', () => {
    expect(claimsToSessionUser({ role: 'anon' })).toBeNull();
    expect(claimsToSessionUser({ sub: '', role: 'anon' })).toBeNull();
  });

  it('rejects a sub-less or role-less token outright', () => {
    expect(claimsToSessionUser({ role: 'authenticated' })).toBeNull();
    expect(claimsToSessionUser({ sub: 'uuid-1' })).toBeNull();
    expect(claimsToSessionUser({ sub: 'uuid-1', role: 'service_role' })).toBeNull();
  });

  it('drops a malformed email rather than failing the session', () => {
    expect(claimsToSessionUser({ sub: 'uuid-1', role: 'authenticated', email: 42 } as never))
      .toEqual({ id: 'uuid-1', email: undefined });
  });
});
