import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD_RETRIES, isRetryableStatus, retryDelayMs, uploadFile } from './dropbox';

// The upload retry (10 Sep 2026). Kiara Tan Jia Min's EM TYS 2022 P2 was marked,
// its images PDF built, and the run released to her at 06:57 — and no folder ever
// appeared under /Students/Kiara Tan Jia Min/. The filing is ONE fail-soft POST
// from the bot's deliverQueuedRun with no retry, so any transient answer from
// Dropbox loses the tray copy in silence. Dropbox rate-limits writes per account
// and answers a burst with 429 + Retry-After; its own docs say that call must be
// retried, and nothing here did.

const OK_BODY = { path_lower: '/students/kiara tan jia min/2026-09-09 kiara em tys 2022 p2/1 marked by ai.pdf', path_display: '/Students/Kiara Tan Jia Min/2026-09-09 kiara em tys 2022 p2/1 Marked by AI.pdf', name: '1 Marked by AI.pdf' };

type Reply = { status: number; body?: unknown; headers?: Record<string, string>; throws?: string };

/** Stub fetch: the token call always succeeds, upload calls answer from `replies` in order. */
function stubUploads(replies: Reply[]) {
  process.env.DROPBOX_APP_KEY = 'k';
  process.env.DROPBOX_APP_SECRET = 's';
  process.env.DROPBOX_REFRESH_TOKEN = 'r';
  const queue = [...replies];
  const uploads: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 14400 }), { status: 200 });
    uploads.push(u);
    const next = queue.shift();
    if (!next) throw new Error(`unexpected upload call #${uploads.length}`);
    if (next.throws) throw new Error(next.throws);
    return new Response(JSON.stringify(next.body ?? { error_summary: 'boom' }), { status: next.status, headers: next.headers });
  }));
  return uploads;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const put = () => uploadFile('/Students/Kiara Tan Jia Min/2026-09-09 kiara em tys 2022 p2/1 Marked by AI.pdf', Buffer.from('%PDF'), 'application/pdf', 'overwrite');

describe('isRetryableStatus', () => {
  it('retries the write rate limit and anything server-side', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('never retries a real answer — a bad path, a missing scope, an expired token', () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(409)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('obeys Dropbox\'s own Retry-After, in seconds', () => {
    expect(retryDelayMs('5', 0)).toBe(5000);
    expect(retryDelayMs('1', 1)).toBe(1000);
  });

  it('caps a silly Retry-After so a tick cannot stall on it', () => {
    expect(retryDelayMs('600', 0)).toBe(30_000);
  });

  it('backs off 2s then 4s when Dropbox sends no header', () => {
    expect(retryDelayMs(null, 0)).toBe(2000);
    expect(retryDelayMs(undefined, 1)).toBe(4000);
    expect(retryDelayMs('', 2)).toBe(8000);
    expect(retryDelayMs('nonsense', 5)).toBe(8000);   // the ceiling holds
  });
});

describe('uploadFile', () => {
  it('files the paper after a 429 instead of losing it (Kiara, 9 Sep 2026)', async () => {
    const uploads = stubUploads([
      { status: 429, headers: { 'retry-after': '0.001' } },
      { status: 200, body: OK_BODY },
    ]);
    const saved = await put();
    expect(uploads).toHaveLength(2);
    expect(saved.path).toBe(OK_BODY.path_lower);
    expect(saved.display).toBe(OK_BODY.path_display);
  });

  it('retries a 5xx too', async () => {
    const uploads = stubUploads([
      { status: 503, headers: { 'retry-after': '0.001' } },
      { status: 200, body: OK_BODY },
    ]);
    await put();
    expect(uploads).toHaveLength(2);
  });

  it('gives up after UPLOAD_RETRIES extra attempts and says what Dropbox said', async () => {
    const uploads = stubUploads([
      { status: 429, headers: { 'retry-after': '0.001' } },
      { status: 429, headers: { 'retry-after': '0.001' } },
      { status: 429, headers: { 'retry-after': '0.001' }, body: { error_summary: 'too_many_write_operations/' } },
    ]);
    await expect(put()).rejects.toThrow(/429/);
    expect(uploads).toHaveLength(UPLOAD_RETRIES + 1);
  });

  it('throws at once on a 4xx that is a real answer — a bad path is not worth three tries', async () => {
    const uploads = stubUploads([{ status: 400, body: { error_summary: 'path/malformed_path/' } }]);
    await expect(put()).rejects.toThrow(/400/);
    expect(uploads).toHaveLength(1);
  });

  it('retries a dropped connection, and the wait is the plain backoff', async () => {
    vi.useFakeTimers();
    const uploads = stubUploads([{ throws: 'fetch failed', status: 0 }, { status: 200, body: OK_BODY }]);
    const p = put();
    await vi.advanceTimersByTimeAsync(retryDelayMs(null, 0));
    await expect(p).resolves.toMatchObject({ path: OK_BODY.path_lower });
    expect(uploads).toHaveLength(2);
  });

  it('a connection that never comes back still throws its own error', async () => {
    vi.useFakeTimers();
    stubUploads([
      { throws: 'fetch failed', status: 0 },
      { throws: 'fetch failed', status: 0 },
      { throws: 'fetch failed', status: 0 },
    ]);
    const p = put();
    const assertion = expect(p).rejects.toThrow('fetch failed');
    await vi.advanceTimersByTimeAsync(retryDelayMs(null, 0) + retryDelayMs(null, 1));
    await assertion;
  });
});
