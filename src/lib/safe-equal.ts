import crypto from 'crypto';

/**
 * Constant-time string equality for secrets (passwords, HMAC signatures,
 * bearer tokens). Plain `===` leaks a match-prefix timing signal; this leaks
 * only length (the guard is required — crypto.timingSafeEqual throws on
 * unequal lengths), which `===` leaked anyway.
 *
 * Callers MUST reject an unset/empty expected secret before comparing:
 * safeEqual('', '') is true, so an empty configured secret would match an
 * empty attacker input.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
