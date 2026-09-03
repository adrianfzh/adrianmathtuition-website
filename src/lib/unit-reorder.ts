// ── Drag-to-reorder for learning_units ───────────────────────────────────────
//
// The rule, shared by /admin/learn-review and the /notes review mode (Adrian,
// 3 Sep 2026: "arrange the order of the cards by holding and moving them"):
//
//   The units' EXISTING `unit_order` values are fixed slots. A drop changes
//   which unit occupies which slot — nothing else. No new numbers are minted,
//   so the topic's numbering scheme (601.xx = Part 1, 602.xx = Part 2, the
//   integer part naming the source lesson) survives every reorder, and two
//   reviewers moving cards in two topics can never collide.
//
//   Consequence: there is deliberately NO Part-boundary rule. A unit dragged
//   past the last card of Part 1 takes Part 2's first slot — the slot set is
//   what is fixed, and the visual order decides who sits where. Same behaviour
//   as learn-review's handleDragEnd since 333cd3f2.
//
// Pure module: the client islands call `reassignSlots` for the optimistic
// order and `slotChanges` for the POST body; the write route calls
// `checkSlotPermutation` so nothing but a permutation of the units' own slots
// can ever reach the table.

export interface SlotUnit {
  id: string;
  unit_order: number | null;
}

/** null sorts as 0 — mirrors learn-review's `(a ?? 0) - (b ?? 0)`. */
const slotValue = (n: number | null) => n ?? 0;

/** Plain array move (dnd-kit's arrayMove, without the dependency in a lib). */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Move `units[fromIndex]` to `toIndex`, then hand out the group's own slots in
 * ascending order down the new visual sequence. Returns the full group in its
 * new order; every other field of each unit is carried across unchanged.
 *
 * `units` is expected in slot order already (the pages render them sorted by
 * `unit_order`); the slots are sorted regardless, so an unsorted input is
 * normalised rather than scrambled. Out-of-range indices, or from === to,
 * return a copy with nothing changed.
 */
export function reassignSlots<T extends SlotUnit>(
  units: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const n = units.length;
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (!inRange(fromIndex) || !inRange(toIndex) || fromIndex === toIndex) {
    return [...units];
  }
  const slots = units.map(u => u.unit_order).sort((a, b) => slotValue(a) - slotValue(b));
  return arrayMove(units, fromIndex, toIndex).map((u, i) => ({ ...u, unit_order: slots[i] }));
}

/**
 * The pairs whose slot actually changed between two orderings of the same
 * units — the POST body. Units that landed back on their own slot are left
 * out, so a drop that changes nothing sends nothing.
 */
export function slotChanges(
  before: readonly SlotUnit[],
  after: readonly SlotUnit[],
): { id: string; unit_order: number | null }[] {
  const was = new Map(before.map(u => [u.id, u.unit_order]));
  return after
    .filter(u => was.has(u.id) && was.get(u.id) !== u.unit_order)
    .map(u => ({ id: u.id, unit_order: u.unit_order }));
}

export type SlotCheck =
  | { ok: true; changes: { id: string; unit_order: number }[] }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Server-side gate for a reorder request. `existing` is every unit the topic
 * holds (id + current slot); `requested` is what the client wants written.
 *
 *   400 — malformed: empty, a duplicate id, an id the topic doesn't own, or a
 *         non-finite slot (the client is talking about a different topic).
 *   409 — well-formed but not a permutation: the requested slots are not
 *         exactly the requested units' current slots (the page was stale, or
 *         a unit still has no slot — fix that in /admin/learn-review first).
 *
 * On success, `changes` is the subset that differs from what's stored — the
 * only rows the route needs to touch.
 */
export function checkSlotPermutation(
  existing: readonly SlotUnit[],
  requested: readonly { id: unknown; unit_order: unknown }[],
): SlotCheck {
  if (requested.length === 0) return { ok: false, status: 400, error: 'orders[] is empty' };
  const current = new Map(existing.map(u => [u.id, u.unit_order]));
  const seen = new Set<string>();
  const clean: { id: string; unit_order: number }[] = [];
  for (const r of requested) {
    if (typeof r.id !== 'string' || !r.id) {
      return { ok: false, status: 400, error: 'every order needs a string id' };
    }
    if (typeof r.unit_order !== 'number' || !Number.isFinite(r.unit_order)) {
      return { ok: false, status: 400, error: `unit ${r.id}: unit_order must be a finite number` };
    }
    if (seen.has(r.id)) return { ok: false, status: 400, error: `unit ${r.id} listed twice` };
    seen.add(r.id);
    if (!current.has(r.id)) {
      return { ok: false, status: 400, error: `unit ${r.id} is not in this topic` };
    }
    clean.push({ id: r.id, unit_order: r.unit_order });
  }
  for (const c of clean) {
    if (current.get(c.id) === null) {
      return {
        ok: false,
        status: 409,
        error: `unit ${c.id} has no unit_order yet — give it one in /admin/learn-review first`,
      };
    }
  }
  // Multiset equality: the slots being handed out must be exactly the slots
  // these units hold now. Sorted numeric compare, so 112.05 == 112.05 whatever
  // order the client listed them in.
  const have = clean.map(c => current.get(c.id) as number).sort((a, b) => a - b);
  const want = clean.map(c => c.unit_order).sort((a, b) => a - b);
  if (have.some((v, i) => v !== want[i])) {
    return {
      ok: false,
      status: 409,
      error: 'orders must be a permutation of the units\' current slots — reload the page and try again',
    };
  }
  return { ok: true, changes: clean.filter(c => current.get(c.id) !== c.unit_order) };
}
