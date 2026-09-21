// Student preferences on `portal_accounts.prefs` (jsonb) — the whitelist the
// Settings route accepts and the merge it applies.
//
// 21 Sep 2026 (Adrian: "make things simple"): the four opt-in switches
// (exam countdown at the top of Home, one thing a day, save answers, skills I
// keep asking about) and their features were removed — one student had ever
// turned one on, and that student was Adrian. The whitelist is empty until a
// setting earns its place; stored blobs keep their old keys harmlessly.

export const PORTAL_PREF_KEYS: readonly string[] = [];

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
