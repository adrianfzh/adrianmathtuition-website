import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  parseStripeSignatureHeader,
  verifyStripeSignature,
  STRIPE_SIG_TOLERANCE_SECONDS,
} from './stripe-verify';

const SECRET = 'whsec_test_4eC39HqLyjWDarjtT1zdp7dc';
const NOW = new Date('2026-08-28T04:00:00.000Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const BODY = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"id":"cs_1"}}}';

/** Independent reference implementation of Stripe's scheme:
 *  HMAC-SHA256(secret, `${t}.${rawBody}`) hex — used to sign fixtures. */
function sign(t: number, body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
}

describe('parseStripeSignatureHeader', () => {
  it('parses t and a single v1', () => {
    expect(parseStripeSignatureHeader(`t=1492774577,v1=abc123`)).toEqual({
      timestamp: 1492774577,
      v1: ['abc123'],
    });
  });
  it('collects MULTIPLE v1 entries (secret roll) and ignores v0', () => {
    const h = 't=100,v1=aaa,v1=bbb,v0=legacy';
    expect(parseStripeSignatureHeader(h)).toEqual({ timestamp: 100, v1: ['aaa', 'bbb'] });
  });
  it('tolerates whitespace around parts', () => {
    expect(parseStripeSignatureHeader(' t=100 , v1=aaa ')).toEqual({ timestamp: 100, v1: ['aaa'] });
  });
  it('non-numeric or missing t → null timestamp', () => {
    expect(parseStripeSignatureHeader('t=soon,v1=aaa').timestamp).toBeNull();
    expect(parseStripeSignatureHeader('v1=aaa').timestamp).toBeNull();
  });
});

describe('verifyStripeSignature', () => {
  it('accepts a header signed by the independent reference implementation', () => {
    const header = `t=${NOW_S},v1=${sign(NOW_S, BODY)}`;
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });
  it('accepts when ANY v1 matches (old + new secret during a roll)', () => {
    const header = `t=${NOW_S},v1=${'0'.repeat(64)},v1=${sign(NOW_S, BODY)}`;
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });
  it('rejects a tampered body — the signature covers the RAW bytes', () => {
    const header = `t=${NOW_S},v1=${sign(NOW_S, BODY)}`;
    expect(verifyStripeSignature(BODY.replace('cs_1', 'cs_2'), header, SECRET, NOW)).toBe(false);
  });
  it('rejects the wrong secret', () => {
    const header = `t=${NOW_S},v1=${sign(NOW_S, BODY)}`;
    expect(verifyStripeSignature(BODY, header, 'whsec_other', NOW)).toBe(false);
  });
  it('rejects a signature computed for a DIFFERENT timestamp than the header claims', () => {
    // valid sig for t-10 presented under t → signed_payload differs → reject
    const header = `t=${NOW_S},v1=${sign(NOW_S - 10, BODY)}`;
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  describe('timestamp skew (replay window, default 300s)', () => {
    const at = (t: number) => `t=${t},v1=${sign(t, BODY)}`;
    it('exactly 300s old → still valid (inclusive)', () => {
      expect(verifyStripeSignature(BODY, at(NOW_S - 300), SECRET, NOW)).toBe(true);
    });
    it('301s old → rejected even though the HMAC itself is correct', () => {
      expect(verifyStripeSignature(BODY, at(NOW_S - 301), SECRET, NOW)).toBe(false);
    });
    it('clock ahead: 300s in the future valid, 301s rejected', () => {
      expect(verifyStripeSignature(BODY, at(NOW_S + 300), SECRET, NOW)).toBe(true);
      expect(verifyStripeSignature(BODY, at(NOW_S + 301), SECRET, NOW)).toBe(false);
    });
    it('honours an injected tolerance', () => {
      expect(verifyStripeSignature(BODY, at(NOW_S - 40), SECRET, NOW, 30)).toBe(false);
      expect(verifyStripeSignature(BODY, at(NOW_S - 40), SECRET, NOW, 60)).toBe(true);
      expect(STRIPE_SIG_TOLERANCE_SECONDS).toBe(300);
    });
  });

  it('rejects malformed headers without throwing', () => {
    expect(verifyStripeSignature(BODY, null, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, '', SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, 'v1=abc', SECRET, NOW)).toBe(false); // no t
    expect(verifyStripeSignature(BODY, `t=${NOW_S}`, SECRET, NOW)).toBe(false); // no v1
    expect(verifyStripeSignature(BODY, `t=${NOW_S},v1=zz`, SECRET, NOW)).toBe(false); // wrong length
    expect(verifyStripeSignature(BODY, `t=${NOW_S},v0=${sign(NOW_S, BODY)}`, SECRET, NOW)).toBe(false); // v0 only
  });
  it('rejects an empty secret', () => {
    const header = `t=${NOW_S},v1=${sign(NOW_S, BODY)}`;
    expect(verifyStripeSignature(BODY, header, '', NOW)).toBe(false);
  });
  it('uppercased hex digest still verifies (case-insensitive compare)', () => {
    const header = `t=${NOW_S},v1=${sign(NOW_S, BODY).toUpperCase()}`;
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toBe(true);
  });
});
