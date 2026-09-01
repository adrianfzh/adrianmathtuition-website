import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  friendlyPortalMessage,
  GENERIC_MESSAGE,
  NETWORK_MESSAGE,
  portalFetch,
  PortalFetchError,
  portalMessage,
  SIGNED_OUT_MESSAGE,
} from './portal-fetch';

// Real student-facing `error` strings the portal APIs return today — these
// must reach the student VERBATIM (copied from the routes / lib/portal-find.ts).
const STUDENT_FACING = [
  'You’ve used today’s 5 generated questions — bank questions are unlimited. A fresh batch opens at midnight!',
  'You’ve done a lot of question-finding today — the finder reopens at midnight. Bank questions in the topic list stay unlimited!',
  'Daily limit reached (30 graded attempts). Back tomorrow!',
  'Daily limit reached (20). Back tomorrow!',
  "That's your 2 requests for today — fresh ones open at midnight. Adrian reads every single one.",
  'This isn’t available right now — pick from the topic list instead.',
  'That one didn’t pass our checks — try again, or pick a bank match instead.',
];

// Real machine-facing `error` strings from the same routes — these must NEVER
// be shown to a student.
const INTERNALS = [
  'Unauthorized',
  'Not found',
  'lesson_not_movable',
  'bot not configured',
  'level and topic required',
  'Invalid JSON',
  'Bad JSON',
  'Could not delete attempts: JWT expired',
  'relation "portal_notes" does not exist',
  'fetch failed',
  'TypeError: Cannot read properties of undefined (reading map)',
  'HTTP 502 from upstream',
];

describe('friendlyPortalMessage', () => {
  it('maps a network failure (status null) to the connection message', () => {
    expect(friendlyPortalMessage(null)).toBe(NETWORK_MESSAGE);
  });

  it('never lets a fallback or server text override the network message', () => {
    expect(friendlyPortalMessage(null, 'Daily limit reached (30 graded attempts). Back tomorrow!', 'Custom fallback.'))
      .toBe(NETWORK_MESSAGE);
  });

  it('maps 401 to the signed-out message regardless of body or fallback', () => {
    expect(friendlyPortalMessage(401)).toBe(SIGNED_OUT_MESSAGE);
    expect(friendlyPortalMessage(401, 'Unauthorized', 'Custom fallback.')).toBe(SIGNED_OUT_MESSAGE);
  });

  it.each(STUDENT_FACING)('passes student-facing server text through verbatim: %s', msg => {
    expect(friendlyPortalMessage(429, msg)).toBe(msg);
    expect(friendlyPortalMessage(400, msg)).toBe(msg);
    // A student-facing server message is more specific than the caller's fallback.
    expect(friendlyPortalMessage(429, msg, 'Could not do that — try again.')).toBe(msg);
  });

  it.each(INTERNALS)('blocks machine-facing server text: %s', raw => {
    const msg = friendlyPortalMessage(500, raw);
    expect(msg).not.toContain(raw);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('prefers the call-site fallback when the server text is blocked', () => {
    expect(friendlyPortalMessage(500, 'Could not delete attempts: JWT expired', 'Could not delete — contact Adrian.'))
      .toBe('Could not delete — contact Adrian.');
    expect(friendlyPortalMessage(400, undefined, 'Couldn’t save that note — try again.'))
      .toBe('Couldn’t save that note — try again.');
  });

  it('gives sensible generics per status with no fallback', () => {
    expect(friendlyPortalMessage(500)).toBe(GENERIC_MESSAGE);
    expect(friendlyPortalMessage(403)).not.toBe(GENERIC_MESSAGE);
    expect(friendlyPortalMessage(404)).not.toBe(GENERIC_MESSAGE);
    expect(friendlyPortalMessage(429)).not.toBe(GENERIC_MESSAGE);
  });

  it('never leaks a status code, "HTTP", or machine vocabulary in any mapping', () => {
    const statuses = [null, 400, 401, 403, 404, 409, 429, 500, 502, 503];
    for (const status of statuses) {
      for (const raw of [...INTERNALS, undefined, '', 42, { nested: true }]) {
        const msg = friendlyPortalMessage(status, raw);
        expect(msg).not.toMatch(/\d{3}/);
        expect(msg).not.toMatch(/http/i);
        expect(msg).not.toMatch(/unauthori[sz]|jwt|sql|json|undefined|status/i);
        expect(msg.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('portalMessage', () => {
  it('uses the PortalFetchError message, generic for anything else', () => {
    expect(portalMessage(new PortalFetchError('Nice message for the student.', 500))).toBe('Nice message for the student.');
    expect(portalMessage(new Error('ECONNREFUSED 127.0.0.1'))).toBe(GENERIC_MESSAGE);
    expect(portalMessage('boom')).toBe(GENERIC_MESSAGE);
  });
});

// ── portalFetch behavior (mocked fetch) ─────────────────────────────────────

type MockRes = { ok: boolean; status: number; json: () => Promise<unknown> };
const jsonRes = (status: number, body: unknown): MockRes => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const networkError = () => new TypeError('fetch failed');
const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('portalFetch', () => {
  it('resolves with the parsed body on success', async () => {
    const mock = vi.fn().mockResolvedValue(jsonRes(200, { papers: [1, 2] }));
    vi.stubGlobal('fetch', mock);
    await expect(portalFetch('/api/portal/x')).resolves.toEqual({ papers: [1, 2] });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('defaults to POST with a JSON body when `json` is given', async () => {
    const mock = vi.fn().mockResolvedValue(jsonRes(200, { ok: true }));
    vi.stubGlobal('fetch', mock);
    await portalFetch('/api/portal/x', { json: { a: 1 } });
    const [, init] = mock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('throws PortalFetchError carrying status + raw serverError, message student-safe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(409, { error: 'lesson_not_movable' })));
    const err = await portalFetch('/api/portal/reschedule', { json: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PortalFetchError);
    const pe = err as PortalFetchError;
    expect(pe.status).toBe(409);
    expect(pe.serverError).toBe('lesson_not_movable'); // for logic branches
    expect(pe.message).not.toContain('lesson_not_movable'); // never for display
    expect(pe.message).not.toMatch(/409|http/i);
  });

  it('passes a student-facing 429 cap message through as the error message', async () => {
    const cap = 'Daily limit reached (30 graded attempts). Back tomorrow!';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(429, { error: cap })));
    const err = await portalFetch('/api/portal/practice/grade', { json: {} }).catch((e: unknown) => e);
    expect((err as PortalFetchError).message).toBe(cap);
    expect((err as PortalFetchError).status).toBe(429);
  });

  it('retries a GET once on network failure, then succeeds', async () => {
    const mock = vi.fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    vi.stubGlobal('fetch', mock);
    await expect(portalFetch('/api/portal/x')).resolves.toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('throws the connection message (status null) when the retry also fails', async () => {
    const mock = vi.fn().mockRejectedValue(networkError());
    vi.stubGlobal('fetch', mock);
    const err = await portalFetch('/api/portal/x').catch((e: unknown) => e);
    expect(mock).toHaveBeenCalledTimes(2);
    expect((err as PortalFetchError).status).toBeNull();
    expect((err as PortalFetchError).message).toBe(NETWORK_MESSAGE);
  });

  it('does not retry non-GET requests', async () => {
    const mock = vi.fn().mockRejectedValue(networkError());
    vi.stubGlobal('fetch', mock);
    const err = await portalFetch('/api/portal/x', { json: { a: 1 } }).catch((e: unknown) => e);
    expect(mock).toHaveBeenCalledTimes(1);
    expect((err as PortalFetchError).message).toBe(NETWORK_MESSAGE);
  });

  it('rethrows an AbortError untranslated, without retrying', async () => {
    const mock = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal('fetch', mock);
    const err = await portalFetch('/api/portal/x').catch((e: unknown) => e);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(err).not.toBeInstanceOf(PortalFetchError);
    expect((err as Error).name).toBe('AbortError');
  });

  it('treats an OK response with an unreadable body as a failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    }));
    const err = await portalFetch('/api/portal/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PortalFetchError);
    expect((err as PortalFetchError).message).toBe(GENERIC_MESSAGE);
  });
});
