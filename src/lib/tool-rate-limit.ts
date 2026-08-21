// ── Per-visitor daily quota for the public "taste" tools ─────────────────────
//
// Pure logic, no I/O: the caller owns the store (a module-level Map today, KV
// later) and hands the recorded hit timestamps in. Written this way because the
// limiter guards a public, unauthenticated, model-billed endpoint — the one
// place where a silent off-by-one becomes a bill — so it must be unit-testable
// without a request.
//
// Distinct from `lib/portal-submit-limit.ts`, which caps a *signed-in student's*
// paper hand-ins per Singapore calendar day against the database. This one is
// for anonymous visitors, keyed on IP + cookie over a rolling 24h window. Don't
// merge them — different identity, different clock, different store.
//
// Identity is IP **and** cookie together: the cookie alone is cleared by a
// private window, the IP alone punishes a whole school behind one NAT, so a hit
// is counted against both keys and either one being exhausted blocks.

/** One rolling day. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Free tries per visitor per rolling day. */
export const DEFAULT_DAILY_LIMIT = 1;

export interface RateLimitDecision {
  allowed: boolean;
  /** Tries left after this request, when allowed. */
  remaining: number;
  /** Milliseconds until the oldest hit falls out of the window (0 when allowed). */
  retryAfterMs: number;
  /** Hit timestamps the caller should store back, oldest first. */
  nextHits: number[];
}

/** Drop hits that have aged out of the rolling window. */
export function pruneHits(hits: readonly number[], now: number, windowMs: number = DAY_MS): number[] {
  const cutoff = now - windowMs;
  return hits.filter((t) => t > cutoff).sort((a, b) => a - b);
}

/**
 * Decide one request against one key's hit history.
 *
 * On `allowed` the returned `nextHits` INCLUDES this request — the caller stores
 * it verbatim. On a block the history is returned pruned but unchanged, so a
 * rejected request never extends its own lockout.
 */
export function checkRateLimit(
  hits: readonly number[],
  now: number,
  opts: { limit?: number; windowMs?: number } = {},
): RateLimitDecision {
  const limit = opts.limit ?? DEFAULT_DAILY_LIMIT;
  const windowMs = opts.windowMs ?? DAY_MS;
  const live = pruneHits(hits, now, windowMs);

  if (live.length >= limit) {
    const oldest = live[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
      nextHits: live,
    };
  }

  return {
    allowed: true,
    remaining: limit - live.length - 1,
    retryAfterMs: 0,
    nextHits: [...live, now],
  };
}

/**
 * First hop of `x-forwarded-for` — the visitor. Later hops are proxies, and a
 * client can forge extra hops, so anything past the first is untrustworthy.
 */
export function clientIpFrom(forwardedFor: string | null | undefined): string {
  const first = (forwardedFor || '').split(',')[0]?.trim();
  return first ? first.slice(0, 64) : 'unknown';
}

/** Storage keys this request counts against — every one must have room. */
export function rateLimitKeys(ip: string, visitorId: string | null | undefined): string[] {
  const keys = [`ip:${ip}`];
  if (visitorId) keys.push(`v:${visitorId.slice(0, 64)}`);
  return keys;
}

/** Whole seconds for a `Retry-After` header; always at least 1 on a block. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}
