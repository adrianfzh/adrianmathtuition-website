// Student preferences on `portal_accounts.prefs` (jsonb) — the whitelist the
// Settings route accepts and the merge it applies. One place, so a new toggle
// is one line here plus its card, and a client can never write an arbitrary
// key into the blob.
//
// Every pref is a boolean for now; add a type here if that changes.
import { ASK_SIGNAL_PREF } from './ask-signal';

export const PORTAL_PREF_KEYS: readonly string[] = [
  /** Settings → "Count what I ask about" → the Notebook's Keeps-coming-up band (lib/ask-signal.ts). */
  ASK_SIGNAL_PREF,
];

export type PrefsPatch = Record<string, boolean>;

/**
 * Validate a client-supplied `prefs` object. Unknown keys and non-boolean
 * values are refused outright (a 400, not a silent drop — a typo in a client
 * should fail loudly in development, not save nothing).
 */
export function readPrefsPatch(input: unknown): { patch: PrefsPatch } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'prefs must be an object' };
  }
  const patch: PrefsPatch = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!PORTAL_PREF_KEYS.includes(key)) return { error: `unknown pref: ${key}` };
    if (typeof value !== 'boolean') return { error: `${key} must be true or false` };
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return { error: 'prefs is empty' };
  return { patch };
}

/** The stored blob with the patch laid over it; a malformed stored value counts as empty. */
export function mergePrefs(current: unknown, patch: PrefsPatch): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}
