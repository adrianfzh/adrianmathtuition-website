// Shared fetch helper for the student portal (/app/*) — portal client
// components talk to /api/portal/* through this instead of raw fetch so that:
//
//   · students never see raw HTTP statuses, stack text, or server internals —
//     every failure maps to a short student-voice message (same tone as the
//     /app/submit copy);
//   · server `error` strings that are ALREADY written for students (the daily
//     cap messages, "didn’t pass our checks", …) pass through verbatim, while
//     machine strings ('Unauthorized', 'lesson_not_movable', JWT/SQL noise)
//     are replaced by a friendly generic — the gate is isStudentFacing();
//   · a plain network blip on an idempotent GET retries once before failing.
//
// Callers catch PortalFetchError and show `e.message` (or portalMessage(e) if
// the try block can throw other things); logic branches (409 conflict, 429
// cap) use `e.status` / `e.serverError` — never the message text.
// An AbortError from the caller's own AbortSignal is rethrown untouched.
// The message mapping is unit-tested in portal-fetch.test.ts (testing policy
// in CLAUDE.md).

export const NETWORK_MESSAGE = 'Connection problem — check your internet and try again.';
export const SIGNED_OUT_MESSAGE = 'You’ve been signed out — log in again to keep going.';
export const GENERIC_MESSAGE = 'Something went wrong — give it a moment and try again.';
const FORBIDDEN_MESSAGE = 'That isn’t available for your account — message Adrian if that seems wrong.';
const NOT_FOUND_MESSAGE = 'Couldn’t find that — refresh the page and try again.';
const LIMIT_MESSAGE = 'That’s the limit for now — try again later.';

// Fragments that mark a server `error` string as machine-facing. The portal
// APIs return a MIX: student-facing prose (cap messages) that should reach the
// student verbatim, and codes/internals that must never. Err on the side of
// blocking — a blocked friendly message still gets a friendly generic.
const INTERNALS =
  /unauthori[sz]|forbidden|invalid|\bjson\b|jwt|token|sql|supabase|postgres|airtable|blob|\bhttp\b|status\s*\d|\bfetch\b|not configured|internal|exception|\bundefined\b|\bnull\b|econn|etimedout|_/i;

/**
 * True when a server `error` string reads like copy written for the student:
 * a real sentence (spaces + sentence punctuation, 20–300 chars) with no
 * machine vocabulary in it.
 */
function isStudentFacing(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  return (
    t.length >= 20 &&
    t.length <= 300 &&
    t.includes(' ') &&
    /[.!?—…]/.test(t) &&
    !INTERNALS.test(t)
  );
}

/**
 * Map a failed portal call to the message a student sees.
 *
 * `status` null means the request never reached the server (network failure).
 * `fallback` lets a call site supply its own wording for generic failures
 * ("Couldn’t save that note — try again.") — it never overrides the network
 * or signed-out messages, and a student-facing server message beats it.
 */
export function friendlyPortalMessage(
  status: number | null,
  serverError?: unknown,
  fallback?: string,
): string {
  if (status === null) return NETWORK_MESSAGE;
  if (status === 401) return SIGNED_OUT_MESSAGE;
  if (isStudentFacing(serverError)) return serverError.trim();
  if (fallback) return fallback;
  if (status === 403) return FORBIDDEN_MESSAGE;
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 429) return LIMIT_MESSAGE;
  return GENERIC_MESSAGE;
}

export class PortalFetchError extends Error {
  /** HTTP status, or null when the request never reached the server. */
  readonly status: number | null;
  /** The server's raw `error` string — for logic branches, never for display. */
  readonly serverError: string | null;
  /** The parsed response body, when there was one. */
  readonly body: unknown;

  constructor(message: string, status: number | null, serverError: string | null = null, body: unknown = null) {
    super(message);
    this.name = 'PortalFetchError';
    this.status = status;
    this.serverError = serverError;
    this.body = body;
  }
}

/** The display message for anything a portalFetch try block threw. */
export function portalMessage(e: unknown): string {
  return e instanceof PortalFetchError ? e.message : GENERIC_MESSAGE;
}

export type PortalFetchOptions = {
  method?: string;
  /** JSON request body; implies POST unless `method` says otherwise. */
  json?: unknown;
  /** Call-site wording for generic failures (see friendlyPortalMessage). */
  fallback?: string;
  /** Retry once on pure network failure. Defaults to true for GET, false otherwise. */
  retry?: boolean;
  signal?: AbortSignal;
  keepalive?: boolean;
};

const RETRY_DELAY_MS = 600;

/**
 * fetch + JSON-parse a portal API route. Resolves with the parsed body;
 * throws PortalFetchError (message already student-safe) on any failure.
 */
export async function portalFetch<T = unknown>(url: string, opts: PortalFetchOptions = {}): Promise<T> {
  const method = (opts.method ?? (opts.json !== undefined ? 'POST' : 'GET')).toUpperCase();
  const retry = opts.retry ?? method === 'GET';

  const attempt = () =>
    fetch(url, {
      method,
      ...(opts.json !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.json) }
        : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.keepalive ? { keepalive: true } : {}),
    });

  let res: Response;
  try {
    res = await attempt();
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e; // caller-driven cancel, not a failure
    if (!retry) throw new PortalFetchError(NETWORK_MESSAGE, null);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    try {
      res = await attempt();
    } catch (e2) {
      if ((e2 as Error)?.name === 'AbortError') throw e2;
      throw new PortalFetchError(NETWORK_MESSAGE, null);
    }
  }

  const body: unknown = await res.json().catch(() => null);
  const serverError =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;

  if (!res.ok) {
    throw new PortalFetchError(
      friendlyPortalMessage(res.status, serverError, opts.fallback),
      res.status,
      serverError,
      body,
    );
  }
  if (body === null && res.status !== 204 && res.status !== 205) {
    // An OK response the portal can't read is still a failure for the student.
    throw new PortalFetchError(opts.fallback ?? GENERIC_MESSAGE, res.status);
  }
  return body as T;
}
