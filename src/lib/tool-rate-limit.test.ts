import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  checkRateLimit,
  clientIpFrom,
  pruneHits,
  rateLimitKeys,
  retryAfterSeconds,
} from './tool-rate-limit';

const T0 = Date.UTC(2026, 7, 21, 9, 0, 0);

describe('pruneHits', () => {
  it('drops hits older than the window and sorts the rest', () => {
    const hits = [T0 - DAY_MS - 1, T0 - 10, T0 - 1000];
    expect(pruneHits(hits, T0)).toEqual([T0 - 1000, T0 - 10]);
  });

  it('keeps a hit exactly at the window edge out', () => {
    expect(pruneHits([T0 - DAY_MS], T0)).toEqual([]);
  });
});

describe('checkRateLimit', () => {
  it('allows the first try of the day and records it', () => {
    const d = checkRateLimit([], T0);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(0);
    expect(d.nextHits).toEqual([T0]);
  });

  it('blocks the second try within the day', () => {
    const d = checkRateLimit([T0 - 60_000], T0);
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.retryAfterMs).toBe(DAY_MS - 60_000);
  });

  // A blocked request must not push its own timestamp in — otherwise hammering
  // the endpoint would roll the lockout forward forever.
  it('does not extend the lockout on a blocked request', () => {
    const d = checkRateLimit([T0 - 60_000], T0);
    expect(d.nextHits).toEqual([T0 - 60_000]);
  });

  it('allows again once the previous hit ages out', () => {
    const d = checkRateLimit([T0 - DAY_MS - 1], T0);
    expect(d.allowed).toBe(true);
    expect(d.nextHits).toEqual([T0]);
  });

  it('honours a custom limit', () => {
    expect(checkRateLimit([T0 - 5], T0, { limit: 3 })).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit([T0 - 5, T0 - 4, T0 - 3], T0, { limit: 3 }).allowed).toBe(false);
  });
});

describe('clientIpFrom', () => {
  it('takes the first hop only', () => {
    expect(clientIpFrom('203.0.113.7, 10.0.0.1, 10.0.0.2')).toBe('203.0.113.7');
  });

  it('falls back to "unknown" when the header is missing or blank', () => {
    expect(clientIpFrom(null)).toBe('unknown');
    expect(clientIpFrom('   ')).toBe('unknown');
  });
});

describe('rateLimitKeys', () => {
  it('counts a request against both IP and visitor cookie', () => {
    expect(rateLimitKeys('203.0.113.7', 'abc')).toEqual(['ip:203.0.113.7', 'v:abc']);
  });

  it('falls back to the IP key alone when there is no cookie yet', () => {
    expect(rateLimitKeys('203.0.113.7', null)).toEqual(['ip:203.0.113.7']);
  });
});

describe('retryAfterSeconds', () => {
  it('rounds up and never returns 0', () => {
    expect(retryAfterSeconds(1500)).toBe(2);
    expect(retryAfterSeconds(0)).toBe(1);
  });
});
