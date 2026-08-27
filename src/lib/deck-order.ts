/**
 * Ordering for the /revise swipe decks (worked-examples + refresher).
 *
 * The deck's desktop view groups consecutive cards by their student-facing
 * section — `display_group`, falling back to the card's sub-group name — so the
 * sort here MUST keep every section's cards contiguous under that same key.
 * Sorting by raw `display_group` alone (the pre-2026-08 behaviour) dumped every
 * null-display_group card into one shared bucket ordered only by order_index,
 * which interleaved sub-groups and made the same section name appear as several
 * non-adjacent groups (duplicate React keys on /revise/em/trigonometry).
 *
 * Section order: sections named in `sections_meta` first, in their configured
 * order (the same known-first rule as `sectionRanker` in notes-tree.ts); every
 * other section is anchored to where its earliest card lives — sub-group order,
 * then card order_index — so an unconfigured topic still reads sub-group by
 * sub-group. Within a section, `order_index` is the editor-written position
 * (the cards reorder/move-card routes rewrite it 1..N per section).
 */

export interface DeckCardRow {
  id: string;
  subgroup_id: number;
  display_group: string | null;
  order_index: number | null;
}

export interface DeckSubgroupRow {
  id: number;
  name: string;
  order_index?: number | null;
}

export interface DeckSectionMetaRow {
  name: string;
  order_index: number;
}

/** Student-facing section a card belongs to: display_group, else its sub-group's name. */
export function deckSectionName(
  card: Pick<DeckCardRow, 'display_group' | 'subgroup_id'>,
  subgroups: Record<number, { name: string }>,
): string {
  return card.display_group ?? subgroups[card.subgroup_id]?.name ?? '';
}

export function orderDeckCards<T extends DeckCardRow>(
  cards: T[],
  subgroups: Record<number, DeckSubgroupRow>,
  meta: DeckSectionMetaRow[],
): T[] {
  // Sub-group rank: order_index (null last), name tiebreak — same rule as
  // sortSubgroups in notes-tree.ts.
  const sgRank = new Map<number, number>();
  Object.values(subgroups)
    .sort((a, b) => {
      const ao = a.order_index ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order_index ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    })
    .forEach((s, i) => sgRank.set(s.id, i));

  // Each section's anchor = position of its earliest card (sub-group rank, then
  // order_index) — used to place sections that sections_meta doesn't cover.
  const anchor = new Map<string, { sg: number; idx: number }>();
  for (const c of cards) {
    const section = deckSectionName(c, subgroups);
    const sg = sgRank.get(c.subgroup_id) ?? Number.MAX_SAFE_INTEGER;
    const idx = c.order_index ?? Number.MAX_SAFE_INTEGER;
    const a = anchor.get(section);
    if (!a || sg < a.sg || (sg === a.sg && idx < a.idx)) anchor.set(section, { sg, idx });
  }

  const metaOrder = new Map(meta.map(m => [m.name, m.order_index]));
  const sections = [...anchor.keys()];
  const known = sections
    .filter(s => metaOrder.has(s))
    .sort((a, b) => (metaOrder.get(a) as number) - (metaOrder.get(b) as number) || a.localeCompare(b));
  const unknown = sections
    .filter(s => !metaOrder.has(s))
    .sort((a, b) => {
      const A = anchor.get(a) as { sg: number; idx: number };
      const B = anchor.get(b) as { sg: number; idx: number };
      if (A.sg !== B.sg) return A.sg - B.sg;
      if (A.idx !== B.idx) return A.idx - B.idx;
      return a.localeCompare(b);
    });
  const rank = new Map([...known, ...unknown].map((s, i) => [s, i]));

  return [...cards].sort((a, b) => {
    const r =
      (rank.get(deckSectionName(a, subgroups)) as number) -
      (rank.get(deckSectionName(b, subgroups)) as number);
    if (r !== 0) return r;
    const oi = (a.order_index ?? 0) - (b.order_index ?? 0);
    if (oi !== 0) return oi;
    // Ties only occur when a section's order_index was never rewritten as one
    // list; keep the result deterministic regardless of fetch order.
    const sg = (sgRank.get(a.subgroup_id) ?? 0) - (sgRank.get(b.subgroup_id) ?? 0);
    if (sg !== 0) return sg;
    return a.id.localeCompare(b.id);
  });
}
