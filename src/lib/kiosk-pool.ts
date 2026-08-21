// The worksheet question pool — the ONE query + eligibility gate behind both
// the iPad kiosk generator (/api/kiosk/worksheet) and the bot's
// worksheet-on-demand endpoint (/api/bot/worksheet). Extracted from the kiosk
// route on 2026-08-22 so the two callers can never drift on what is servable.
//
// INVARIANTS (docs/KIOSK.md §5b–5c):
//  - Servability is decided by the `kiosk_pool` RPC: tag-match UNION
//    sub-group-match, answer-presence (top-level OR parts), not-deleted,
//    text-only or verified/engine-drawn figure. Ordered by id so the seeded
//    daily draw is reproducible.
//  - Answer-GATED, not solution-gated: a row with no printable answer never
//    serves (the sheet always prints its [Ans: …] line / answer page).
//  - NEVER worked solutions, NEVER originating school/paper metadata. The RPC
//    returns only id / question_text / parts / total_marks / answer /
//    figure_url / has_image / image_url, and flattenParts reads only
//    text·label·marks·answer·subparts·image_url from each part — `solution`
//    lives in the same jsonb and must stay unread here.
//  - NO cap before the shuffle. The whole gated pool goes to dailyDraw and the
//    count slice happens last (capping first permanently starved every row past
//    the cap in id order). The RPC's own 400-row fetch cap is the only bound.
import type { SupabaseClient } from '@supabase/supabase-js';
import { flattenParts, cropUrls, type Part } from './kiosk-worksheet-images';
import { TIER_DIFFICULTY_VALUES, type Tier } from './practice-tiers';

/** `questions.level` values servable per kiosk level token. */
export const SEED_LEVELS: Record<string, string[]> = {
  EM: ['EM', 'S3_EM'],
  AM: ['AM', 'S3_AM'],
  JC2: ['JC', 'JC1', 'JC2'],
  S1: ['S1'],
  S2: ['S2'],
};

export type PoolItem = {
  id: string;
  markdown: string;
  marks: number | null;
  figureUrl: string | null;
  imageUrls: string[];
  answer: string;
};

export type PoolQuery = {
  /** `questions.level` values to tag-match (SEED_LEVELS[levelKey]). */
  seedLevels: string[];
  /** `subgroups.level` key the sub-group match runs against (cfg.topicsKey). */
  topicsKey: string;
  topic: string;
  tier: Tier | null;
};

/**
 * Fetch the eligible, answer-gated question pool for one level+topic(+tier).
 * Returns `{ items: [], error }` rather than throwing so callers keep their own
 * HTTP-status shape.
 */
export async function fetchWorksheetPool(
  supa: SupabaseClient,
  { seedLevels, topicsKey, topic, tier }: PoolQuery,
): Promise<{ items: PoolItem[]; error: string | null }> {
  const bankRes = await supa.rpc('kiosk_pool', {
    p_tag_levels: seedLevels,
    p_sg_level: topicsKey,
    p_topic: topic,
    p_difficulties: tier ? TIER_DIFFICULTY_VALUES[tier] : null,
  });
  if (bankRes.error) return { items: [], error: bankRes.error.message };

  const items: PoolItem[] = [];
  for (const r of bankRes.data || []) {
    const flat = flattenParts((r.question_text as string) ?? '', (r.parts as Part[] | null) ?? null);
    const answer = flat.answer || ((r.answer as string | null) ?? '');
    if (!answer.trim()) continue; // answers always print — answer-less questions don't serve
    items.push({
      id: r.id as string,
      markdown: flat.text,
      marks: (r.total_marks as number | null) ?? null,
      figureUrl: (r.figure_url as string | null) ?? null,
      imageUrls: r.figure_url ? [] : cropUrls((r.image_url as string | null) ?? null),
      answer,
    });
  }
  return { items, error: null };
}
