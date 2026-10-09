// ✂️ Re-crops — the one-tap reasons Adrian gives when a new picture is not good enough
// (9 Oct 2026, Adrian: "buttons to click what's wrong … faster to approve in bulk").
// The reasons are stored on the figure's row so the cutter's checks can be tightened
// from what he actually rejects. Pure — no I/O.

export const RECROP_REASONS = [
  'part cut off',
  'cut off in the old picture too',
  'question words still in',
  'too small or blurry',
  'wrong picture',
  // 9 Oct 2026, Adrian on a blurry scan: "able to request to redraw?" — the picture is the
  // right one but a clean drawing is wanted; the redraw batch reads this reason.
  'please redraw',
] as const;
export type RecropReason = (typeof RECROP_REASONS)[number];

/** Only reasons from the list, each once, in the list's order. */
export function cleanRecropReasons(input: unknown): RecropReason[] {
  const got = new Set(Array.isArray(input) ? input.map((x) => String(x)) : []);
  return RECROP_REASONS.filter((r) => got.has(r));
}

export const RECROP_ADRIAN_PREFIX = 'Adrian: ';

/** The `why` a rejected row carries: his reasons first, then what the cutter had said. */
export function recropRejectWhy(reasons: readonly string[], was: string | null | undefined): string | null {
  if (!reasons.length) return null;
  const old = (was ?? '').trim();
  const kept = old.startsWith(RECROP_ADRIAN_PREFIX) ? '' : old;
  return `${RECROP_ADRIAN_PREFIX}${reasons.join('; ')}${kept ? ` — ${kept}` : ''}`.slice(0, 600);
}
