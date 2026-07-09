// Practice difficulty tiers — the single source of truth for mapping the
// `questions.difficulty` free-text column onto three canonical tiers.
//
// The bank's existing `difficulty` values (live counts, 2026-07):
//   Standard 17874 · Advanced 1370 · null 332 · Challenging 31 · Bonus 4
// AI-generated questions now write a tier value ('basic'|'standard'|'advanced')
// straight into `difficulty` (see the bot's ai/generation-worker.js), so the
// mapping is deliberately case-insensitive and covers both the legacy
// Title-case bank values and the new lowercase tier values.
//
// Canonical mapping (case-insensitive on difficulty):
//   basic                         → basic
//   standard                      → standard
//   advanced | challenging | bonus → advanced
//   anything else / null          → null (unmapped)

export type Tier = 'basic' | 'standard' | 'advanced';
export const TIERS: readonly Tier[] = ['basic', 'standard', 'advanced'] as const;

export function isTier(v: unknown): v is Tier {
  return v === 'basic' || v === 'standard' || v === 'advanced';
}

/** Normalise an arbitrary query param to a Tier, or null (= Mixed / no filter). */
export function normalizeTier(v: string | null | undefined): Tier | null {
  const t = String(v ?? '').toLowerCase().trim();
  return isTier(t) ? t : null;
}

// Canonical difficulty (lowercased) → tier. Single source both the TS helper and
// the SQL CASE below are derived from.
const DIFFICULTY_TO_TIER: Record<string, Tier> = {
  basic: 'basic',
  standard: 'standard',
  advanced: 'advanced',
  challenging: 'advanced',
  bonus: 'advanced',
};

/** Map a stored `questions.difficulty` value to its tier, or null if unmapped. */
export function tierOf(difficulty: string | null | undefined): Tier | null {
  const d = String(difficulty ?? '').toLowerCase().trim();
  return DIFFICULTY_TO_TIER[d] ?? null;
}

// Reverse map: tier → the exact `difficulty` strings that fall into it, in every
// stored casing (legacy Title-case bank values + new lowercase tier values).
// Used for supabase-js `.in('difficulty', …)` filters, which are case-sensitive
// exact matches and can't run the SQL CASE directly.
export const TIER_DIFFICULTY_VALUES: Record<Tier, string[]> = (() => {
  const out: Record<Tier, string[]> = { basic: [], standard: [], advanced: [] };
  for (const [value, tier] of Object.entries(DIFFICULTY_TO_TIER)) {
    const title = value.charAt(0).toUpperCase() + value.slice(1);
    out[tier].push(value, title); // e.g. 'advanced' → ['advanced','Advanced']
  }
  return out;
})();

// Shared SQL CASE — same mapping as tierOf(), for any raw SQL (e.g. grouped
// stock counts). Keep in lock-step with DIFFICULTY_TO_TIER above.
export const TIER_CASE_SQL = `CASE lower(difficulty)
  WHEN 'basic' THEN 'basic'
  WHEN 'standard' THEN 'standard'
  WHEN 'advanced' THEN 'advanced'
  WHEN 'challenging' THEN 'advanced'
  WHEN 'bonus' THEN 'advanced'
  ELSE NULL END`;
