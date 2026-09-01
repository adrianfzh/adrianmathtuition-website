import { describe, it, expect } from 'vitest';
import { classifyDeliveryCheck } from './resend-verify';

describe('classifyDeliveryCheck — the three states', () => {
  it('a clean read of a healthy event is ok', () => {
    expect(classifyDeliveryCheck(200, { last_event: 'delivered' })).toEqual({ kind: 'ok', event: 'delivered' });
    expect(classifyDeliveryCheck(200, { last_event: 'sent' })).toEqual({ kind: 'ok', event: 'sent' });
  });

  it('suppressed / failed / bounced are non-delivery', () => {
    for (const ev of ['suppressed', 'failed', 'bounced']) {
      expect(classifyDeliveryCheck(200, { last_event: ev })).toEqual({ kind: 'not-delivered', event: ev });
    }
  });

  // The regression this module exists for. A restricted ("Sending access") Resend
  // key answers 403 to every read; the old inline `if (st.ok)` guard skipped the
  // whole block, so an unverified send was indistinguishable from a verified one.
  // 'unavailable' must never collapse into 'ok'.
  it('403 from a restricted key is a PERMANENT unavailable, never ok', () => {
    const v = classifyDeliveryCheck(403, { name: 'restricted_api_key', message: 'error code: 1010' });
    expect(v.kind).toBe('unavailable');
    expect(v).toMatchObject({ permanent: true });
    expect(v.kind === 'unavailable' && v.reason).toMatch(/Full access/);
  });

  it('401 is permanent too — a bad key never fixes itself', () => {
    expect(classifyDeliveryCheck(401, null)).toMatchObject({ kind: 'unavailable', permanent: true });
  });

  it('404 / 429 / 5xx are TRANSIENT — a slow night must not cry wolf', () => {
    for (const s of [404, 429, 500, 502, 503]) {
      expect(classifyDeliveryCheck(s, null)).toMatchObject({ kind: 'unavailable', permanent: false });
    }
  });

  it('a 200 with no last_event is unavailable, not a silent pass', () => {
    expect(classifyDeliveryCheck(200, {})).toMatchObject({ kind: 'unavailable', permanent: false });
    expect(classifyDeliveryCheck(200, null)).toMatchObject({ kind: 'unavailable', permanent: false });
  });

  it('an unknown event is ok — only the three listed events block a send', () => {
    expect(classifyDeliveryCheck(200, { last_event: 'opened' })).toEqual({ kind: 'ok', event: 'opened' });
    expect(classifyDeliveryCheck(200, { last_event: 'delivery_delayed' })).toEqual({ kind: 'ok', event: 'delivery_delayed' });
  });
});
