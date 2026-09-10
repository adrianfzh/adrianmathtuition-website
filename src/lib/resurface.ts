// One thing a day from the notebook (SPEC-NOTEBOOK-V2 §7 "resurfacing",
// Adrian 11 Sep 2026: "we can build this, and have a toggle for students to
// turn this on, default off"). Not a list — a list is what Questions to retry
// was. One small card on Home, chosen for the day, opening straight to the item
// in the Notebook. The choice is deterministic per student per day so the card
// does not change on every visit, and it rotates so an item comes back days
// later rather than tomorrow — spacing for free.
import type { StreamItem } from './notebook-stream';

export const RESURFACE_PREF = 'resurface';

/** Which items may be resurfaced: live mistakes first, then saved answers, then read photos. */
export function resurfaceCandidates(items: readonly StreamItem[]): StreamItem[] {
  const live = items.filter(i => i.kind === 'mistake' && i.mistake?.live);
  const saved = items.filter(i => i.kind === 'saved');
  const photos = items.filter(i => (i.kind === 'photo' || i.kind === 'clip') && i.tag);
  return [...live, ...saved, ...photos];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * The card for `dateISO` (YYYY-MM-DD): a live mistake on most days (they matter
 * most), a saved answer or a read photo on others, rotating through the pool by
 * day so the same item is not shown on consecutive days while there are others.
 */
export function pickResurface(items: readonly StreamItem[], identity: string, dateISO: string): StreamItem | null {
  const pool = resurfaceCandidates(items);
  if (!pool.length) return null;
  const live = pool.filter(i => i.kind === 'mistake');
  const rest = pool.filter(i => i.kind !== 'mistake');
  const day = Math.floor(Date.parse(dateISO + 'T00:00:00Z') / 86_400_000);
  // Two days in three go to a live mistake when there is one; the third to the rest.
  const useLive = live.length > 0 && (rest.length === 0 || day % 3 !== 0);
  const bucket = useLive ? live : rest.length ? rest : live;
  const idx = (hash(identity) + day) % bucket.length;
  return bucket[idx];
}

/** The one line under the title — why this came up today. */
export function resurfaceLine(item: StreamItem): string {
  if (item.kind === 'mistake') return item.mistake?.cameBack ? 'This one came back — worth a look before it costs marks again.' : 'Still on your list. Thirty seconds now saves marks later.';
  if (item.kind === 'saved') return 'You saved this answer. Can you still do it without looking?';
  return 'From your photos. Skim it once today.';
}
