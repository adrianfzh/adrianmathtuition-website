# Refresher Cards — Patch: Cross-Kind Drag and Drop

**Supersedes** the line in the original brief that said "Drag-reorder works within a panel only — you can't drag a refresher card into the Worked Examples list."

**New behaviour required:**

1. **Individual cards** can be dragged between any section — including across the Refresher ↔ Worked Examples boundary. Dropping changes the card's `content_kind` to match the destination panel.
2. **Whole sections** (display_group groups) can be dragged between Refresher and Worked Examples. All cards in that section move; their `display_group` label is preserved, but their `content_kind` updates to the destination panel's kind.

Within-panel drag-reorder still works for both cards and sections.

---

## API changes

### Update: `POST /api/admin/cards/sections/move-card`

Already moves a card between display_groups within the same sub-group. Extend the body:

```ts
{
  cardId: string,
  targetDisplayGroup: string,     // existing
  targetKind: 'worked_example' | 'refresher',  // NEW — optional, defaults to current kind
  sourceOrderedIds: string[],
  destOrderedIds: string[],
}
```

When `targetKind` differs from the card's current `content_kind`, update both `content_kind` AND `display_group` in the same transaction, then recompute `order_index` for the source and destination lists.

### New: `POST /api/admin/cards/sections/move-section`

Move an entire display_group section between kinds.

```ts
// Body
{
  level: 'AM' | 'EM' | 'JC' | 'S1' | 'S2',
  topic: string,
  subgroupId: number,
  displayGroup: string,                              // section being moved
  sourceKind: 'worked_example' | 'refresher',
  targetKind: 'worked_example' | 'refresher',
  destOrderedDisplayGroups: string[],                // section order in destination panel after the move
}
```

Behaviour:
1. Find all cards where `(level, topic, subgroup_id, content_kind=sourceKind, display_group=displayGroup)` matches.
2. Update them: set `content_kind = targetKind`. Keep `display_group` unchanged.
3. Recompute `order_index` in the destination panel — cards within the moved section retain their relative order, but the section as a whole is positioned per `destOrderedDisplayGroups`.
4. Return the updated card lists for both panels so the frontend can rerender.

If the destination panel already contains a section with the same `display_group` name, **merge them**: the moved cards append to the existing section (no rename prompt). This matches the existing "merging allowed" behaviour described in `admin/cards/sections/rename`.

---

## Frontend changes

### Single dnd-kit context across both panels

Currently each panel likely has its own `DndContext` with its own sortable list. Switch to **one `DndContext` wrapping both panels**, with two `SortableContext` regions inside it (one per kind). `@dnd-kit/core` supports cross-context drag via shared sensor + a single context.

### Draggable section headers

Each section header (e.g. "Simplifying Surds (4)") becomes a draggable handle. Dragging it grabs the whole group:
- Visual: while dragging, show the section header + a count badge ("Simplifying Surds — 4 cards") as the drag preview.
- Drop target: any section position in either panel (between existing sections, at the top, or at the bottom).
- Dropping into the same panel = reorder sections (no API call needed beyond a section-reorder PATCH).
- Dropping into the other panel = call `move-section` with `targetKind` set to the destination.

### Draggable cards (cross-kind)

Each card row stays draggable as it is. Drop targets:
- Another position within its current section → existing reorder.
- A different section within the same kind → existing `move-card` (no kind change).
- A section in the other kind → `move-card` with `targetKind` set.

The dnd-kit `over` event gives you both the destination's section id and panel kind from the section header's data attributes. Pass both to the API.

### Optimistic UI

Update the local state immediately on drop, then call the API. On API error, roll back and show a toast. (Same pattern as existing card reorder.)

### Visual cues

- Section panels (`🧠 Refresher` and `💡 Worked Examples`) should highlight with a dashed border when a card or section is being dragged over them and the drop would be a cross-kind move. Makes the kind-change explicit so it doesn't feel like an accident.
- Optional: brief toast on cross-kind drop, e.g. "Moved 'Simplifying Surds' (4 cards) to Refresher". Auto-dismiss 2s.

### No confirmation modal

Don't prompt "Are you sure?" — the action is reversible (drag it back). Confirmation friction is worse than the rare misdrag.

---

## Edge cases

- **Empty section**: can still be dragged across (it just changes its semantics from "an empty refresher group" to "an empty worked-examples group"). Better: when a display_group becomes empty in the source panel after all its cards move out, delete the (now-zero-card) display_group entry. Display_groups are derived from card rows in the existing schema — when zero cards have a given display_group, it stops appearing.
- **Conflict on merge**: if the destination panel already has a section with the same `display_group` name, append the moved cards to it (no rename, no prompt).
- **Order_index recompute**: always recompute 1..N within each affected `(subgroup_id, content_kind, display_group)` tuple after a move. Don't try to preserve original indices — too brittle.
- **Concurrent edits**: this UI is single-admin (Adrian), no real concurrency. Don't bother with versioning.

---

## Acceptance criteria (additions)

7. **Drag whole section across kinds**: drag "Simplifying Surds" header from Worked Examples panel to Refresher panel. All 4 cards' `content_kind` flips to `refresher`. Section now appears under 🧠 Refresher with count badge `(4)`.
8. **Drag single card across kinds**: drag one card (e.g. "Multiplying surds") from a Worked Examples section to the Refresher panel. Its `content_kind` updates to `refresher`. It appears in the Refresher panel under the same display_group name (creating that section if it didn't exist).
9. **Reorder within panel still works**: same drag mechanics, but ending up in the same panel = no kind change, just `order_index` update.
10. **Empty section auto-collapses**: after moving all cards out of "Simplifying Surds" in Worked Examples, that section header disappears from the Worked Examples panel.

---

## Implementation order

Do the API endpoints first (`move-card` body extension + new `move-section`), then refactor the frontend to a single DndContext, then wire up the section-header draggable. Test each step with the existing Surds sub-group as the live target.
