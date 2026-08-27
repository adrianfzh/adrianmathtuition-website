import { describe, it, expect } from 'vitest';
import {
  JOIN_LEVELS,
  normalizeJoinLevel,
  validateInviteRef,
  inviteLinkFor,
  validateJoinSignup,
  buildSelfServeConsentRecord,
  selfServeSignupTelegramText,
  passCheckoutUrl,
  rateLimitStep,
  trialReference,
} from './portal-join';
import { POLICY_VERSION } from './portal-consent';
import { qbLevelsFor } from './qb-levels';

const REF = '123e4567-e89b-42d3-a456-426614174000';

describe('validateInviteRef', () => {
  it('accepts a uuid and normalises case', () => {
    expect(validateInviteRef(REF)).toBe(REF);
    expect(validateInviteRef(REF.toUpperCase())).toBe(REF);
    expect(validateInviteRef(`  ${REF}  `)).toBe(REF);
  });
  it('rejects everything that is not a uuid (garbage never blocks signup, it just unattributes it)', () => {
    expect(validateInviteRef('recABCDEF12345678')).toBeNull(); // Airtable id, not an account
    expect(validateInviteRef('')).toBeNull();
    expect(validateInviteRef(undefined)).toBeNull();
    expect(validateInviteRef(null)).toBeNull();
    expect(validateInviteRef(42)).toBeNull();
    expect(validateInviteRef("' OR 1=1 --")).toBeNull();
    expect(validateInviteRef('123e4567-e89b-42d3-a456-42661417400')).toBeNull(); // one hex short
  });
});

describe('normalizeJoinLevel / JOIN_LEVELS', () => {
  it('accepts every offered level verbatim', () => {
    for (const l of JOIN_LEVELS) expect(normalizeJoinLevel(l.value)).toBe(l.value);
  });
  it('is forgiving about case and whitespace but returns the canonical value', () => {
    expect(normalizeJoinLevel(' sec 4 ')).toBe('Sec 4');
    expect(normalizeJoinLevel('jc1')).toBe('JC1');
  });
  it('rejects unknown levels', () => {
    expect(normalizeJoinLevel('Poly')).toBeNull();
    expect(normalizeJoinLevel('Sec 6')).toBeNull();
    expect(normalizeJoinLevel('')).toBeNull();
    expect(normalizeJoinLevel(undefined)).toBeNull();
  });
  it('every join level maps to at least one QB practice level (the stranger can actually practise)', () => {
    for (const l of JOIN_LEVELS) {
      expect(qbLevelsFor(l.value, null).length).toBeGreaterThan(0);
    }
  });
});

describe('validateJoinSignup', () => {
  const good = { name: 'Wei Jie', email: 'wj@example.com', password: 'password1', consent: true, level: 'Sec 4' };
  it('accepts a complete signup and trims name/email', () => {
    const v = validateJoinSignup({ ...good, name: '  Wei Jie ', email: ' wj@example.com ' });
    expect(v).toEqual({ ok: true, name: 'Wei Jie', email: 'wj@example.com', password: 'password1', level: 'Sec 4' });
  });
  it('requires a real name', () => {
    expect(validateJoinSignup({ ...good, name: ' a ' }).ok).toBe(false);
    expect(validateJoinSignup({ ...good, name: 'x'.repeat(81) }).ok).toBe(false);
    expect(validateJoinSignup({ ...good, name: undefined }).ok).toBe(false);
  });
  it('requires a valid email and an 8-char password', () => {
    expect(validateJoinSignup({ ...good, email: 'not-an-email' }).ok).toBe(false);
    expect(validateJoinSignup({ ...good, password: 'short7!' }).ok).toBe(false);
    expect(validateJoinSignup({ ...good, password: 12345678 }).ok).toBe(false);
  });
  it('requires a known level', () => {
    expect(validateJoinSignup({ ...good, level: 'Uni' }).ok).toBe(false);
  });
  it('consent must be EXACTLY true — "yes"/1/truthy strings never create an account (PDPA)', () => {
    expect(validateJoinSignup({ ...good, consent: 'yes' }).ok).toBe(false);
    expect(validateJoinSignup({ ...good, consent: 1 }).ok).toBe(false);
    expect(validateJoinSignup({ ...good, consent: undefined }).ok).toBe(false);
  });
});

describe('buildSelfServeConsentRecord', () => {
  const NOW = new Date('2026-08-28T04:00:00Z');
  it('records source, ref, who consented, the policy version and the moment', () => {
    expect(buildSelfServeConsentRecord({ ref: REF, now: NOW })).toEqual({
      source: 'self-serve invite',
      ref: REF,
      consented_by: 'student',
      policy_version: POLICY_VERSION,
      consented_at: '2026-08-28T04:00:00.000Z',
    });
  });
  it('keeps ref null for an unattributed signup', () => {
    expect(buildSelfServeConsentRecord({ ref: null, now: NOW }).ref).toBeNull();
  });
});

describe('selfServeSignupTelegramText', () => {
  it('names the signup, level and inviter', () => {
    expect(selfServeSignupTelegramText('Wei Jie', 'Sec 4', 'Zane Lim')).toBe(
      '🆕 Self-serve signup: <b>Wei Jie</b> (Sec 4), invited by Zane Lim'
    );
  });
  it("no inviter → 'nobody'", () => {
    expect(selfServeSignupTelegramText('Wei Jie', 'JC1', null)).toContain('invited by nobody');
    expect(selfServeSignupTelegramText('Wei Jie', 'JC1', '  ')).toContain('invited by nobody');
  });
  it('escapes student-typed HTML (parse_mode HTML injection)', () => {
    const t = selfServeSignupTelegramText('<b>x</b>', 'Sec 4', '<i>y</i>');
    expect(t).not.toContain('<b>x</b>');
    expect(t).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(t).toContain('&lt;i&gt;y&lt;/i&gt;');
  });
  it('notes the 3-day trial only when it was actually granted', () => {
    expect(selfServeSignupTelegramText('Wei Jie', 'Sec 4', 'Zane', true)).toBe(
      '🆕 Self-serve signup: <b>Wei Jie</b> (Sec 4), invited by Zane · 3-day trial granted'
    );
    expect(selfServeSignupTelegramText('Wei Jie', 'Sec 4', 'Zane', false)).not.toContain('trial');
  });
});

describe('trialReference (referred-signup trial idempotency key)', () => {
  const INVITER = '999e4567-e89b-42d3-a456-426614174999';
  it('carries both uuids — inviter for audit, new account for per-invitee dedupe', () => {
    expect(trialReference(INVITER, REF)).toBe(`invite:${INVITER}:${REF}`);
  });
  it('two invitees of the SAME inviter get DIFFERENT references (the second friend must not be "a duplicate")', () => {
    const other = 'aaaa4567-e89b-42d3-a456-426614174aaa';
    expect(trialReference(INVITER, REF)).not.toBe(trialReference(INVITER, other));
  });
  it('the same signup retried yields the same reference (grantPass dedupes it)', () => {
    expect(trialReference(INVITER, REF)).toBe(trialReference(INVITER, REF));
  });
});

describe('passCheckoutUrl', () => {
  it('appends client_reference_id to a bare payment link', () => {
    expect(passCheckoutUrl('https://buy.stripe.com/abc123', REF)).toBe(
      `https://buy.stripe.com/abc123?client_reference_id=${REF}`
    );
  });
  it('plays nice with a link that already has a query', () => {
    expect(passCheckoutUrl('https://buy.stripe.com/abc123?locale=en', REF)).toBe(
      `https://buy.stripe.com/abc123?locale=en&client_reference_id=${REF}`
    );
  });
  it('a non-URL link degrades to null, never a broken href', () => {
    expect(passCheckoutUrl('', REF)).toBeNull();
    expect(passCheckoutUrl('not a url', REF)).toBeNull();
  });
});

describe('rateLimitStep', () => {
  it('allows up to max within the window, then refuses', () => {
    let hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = rateLimitStep(hits, 1000 + i, { windowMs: 60_000, max: 3 });
      expect(r.allowed).toBe(true);
      hits = r.hits;
    }
    expect(rateLimitStep(hits, 2000, { windowMs: 60_000, max: 3 }).allowed).toBe(false);
  });
  it('old hits fall out of the window', () => {
    const r = rateLimitStep([0, 1, 2], 70_000, { windowMs: 60_000, max: 3 });
    expect(r.allowed).toBe(true);
    expect(r.hits).toEqual([70_000]);
  });
});

describe('inviteLinkFor', () => {
  it('is the canonical www join link with the account id as ref', () => {
    expect(inviteLinkFor(REF)).toBe(`https://www.adrianmathtuition.com/join?ref=${REF}`);
  });
  it('round-trips through validateInviteRef', () => {
    const url = new URL(inviteLinkFor(REF));
    expect(validateInviteRef(url.searchParams.get('ref'))).toBe(REF);
  });
});
