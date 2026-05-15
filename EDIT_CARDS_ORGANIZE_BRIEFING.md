# Cards Editor — Organise Sub-groups & Move Cards — Build Briefing

> Follow-up to `EDIT_CARDS_BRIEFING.md` and `EDIT_CARDS_NEW_SUBGROUP_BRIEFING.md`. Adds four organisation features to the cards editor at `/admin/edit-cards`: cross-section card drag, inline sub-group rename, sub-group delete (when empty), and sub-group reorder. ~2.5 hours total.

## What you're building

Today the cards editor sidebar groups cards by sub-group (visible as bold section headers like "Simplify / combine surd expression (3)"). Adrian can drag cards to reorder them **within** a section, and reassign a card to a different sub-group via the editor page's dropdown. But he can't:

- Drag a card from one section into another on the list view
- Rename a section header
- Delete an empty section
- Change the order in which sections appear

This brief adds all four. Pure organisation features; no schema impact other than one optional column for sub-group ordering.

## Why this matters

Sub-groups are the spine of three systems (QB labelling, KB linking, swipe cards). The cards editor is the most-used surface for managing them. Adrian's workflow is currently:

- Create a new sub-group via the modal (already works after the previous brief)
- Notice that an existing card belongs better under the new sub-group → open card, change dropdown, save (clunky)
- Realise the sub-group's name reads awkwardly → drop into SQL to rename (high friction)
- End up with empty/duplicate sub-groups → leave them around because deletion needs SQL (clutter)
- Want strong-skill sections at the top → can't, sort is fixed by sub-group `id`

Each individual workflow already works *somewhere*. The point of this brief is to put them all in the cards editor where the curation actually happens.

## Files you'll touch

```
adrianmathtuition-website/
├── src/app/api/admin/cards/
│   ├── reorder/route.ts                                ← extend: also accept subgroup_id changes
│   ├── subgroups/
│   │   ├── [id]/route.ts                               ← NEW: PATCH (rename), DELETE
│   │   └── reorder/route.ts                            ← NEW: POST (reorder sub-groups)
│   └── (existing endpoints unchanged)
├── src/app/admin/edit-cards/
│   ├── EditCardsClient.tsx                              ← cross-section drag, rename UI, delete button, sub-group drag
│   └── page.tsx                                         ← include order_index in sub-group fetch (if Feature 4 ships)
└── migrations/
    └── subgroups_order_index.sql                        ← NEW (only if Feature 4 ships)
```

No new dependencies. Use the existing `@dnd-kit/core` setup the list view already uses for card drag.

## Feature 1 — Cross-section card drag (~1 h)

### UX

Drag a card chip from one section. Section headers and card-list zones in OTHER sub-groups become valid drop targets (dashed navy border on hover, same style as existing drop hover). Dropping the card:

1. Moves it visually to the new section
2. PATCHes the card with the new `subgroup_id`
3. Recomputes `order_index` for both source AND destination sub-groups (appended at the end of destination, gap closed in source)
4. Both sections show their updated card counts in the header `(N cards)`

If dropped onto its own section, behave as a regular within-section reorder (existing behaviour).

### Endpoint changes

Extend `POST /api/admin/cards/reorder` (the existing within-sub-group reorder endpoint) to optionally accept a `targetSubgroupId` per card:

**Current body:**
```ts
{ orderedIds: string[] }
```

**New body:**
```ts
{
  // For within-sub-group reorder (existing behaviour, kept):
  orderedIds: string[];
  // OR for cross-sub-group move (new):
  movedCard?: {
    cardId: string;
    targetSubgroupId: number;
  };
  // After a cross-sub-group move, the caller also sends the new ordering for
  // BOTH affected sub-groups so the server can rewrite order_index for each.
  sourceOrderedIds?: string[];      // remaining cards in the source sub-group
  destOrderedIds?: string[];        // including the moved card, in destination
}
```

Or — cleaner alternative — add a new endpoint `POST /api/admin/cards/move`:

```ts
// POST /api/admin/cards/move
{
  cardId: string;
  targetSubgroupId: number;
  sourceOrderedIds: string[];
  destOrderedIds: string[];
}
```

I'd go with the **separate endpoint** — keeps the reorder endpoint simple, makes the move operation explicit, easier to log. Body validates that the destination sub-group is in the SAME (level, topic) as the source (cross-topic moves remain out of scope).

Response: `{ ok: true }` or 4xx with reason.

### Client (`EditCardsClient.tsx`)

The existing dnd-kit setup needs to know about cross-section drops. Specifically:

- Each section's card container becomes a `useDroppable` zone with id like `sg-{N}-zone`
- Each section header also becomes a droppable zone (so users can drop onto an empty section)
- The `onDragEnd` handler inspects `over.id`: if it's a different sub-group's zone, fire the move; otherwise existing within-section reorder
- After a successful move, optimistically update the local cards array and the section count badges; revert on server error

Important UX bits:
- Show a dashed navy border on the hovered section header during drag (visual feedback)
- Don't allow dragging onto a section in a different topic/level (shouldn't happen since the list only shows one topic at a time, but guard anyway)
- Vibrate on iOS Safari (you already do this for within-section drag)

## Feature 2 — Rename sub-group inline (~30 min)

### UX

Section headers (`Simplify / combine surd expression (3)`) become hover-editable. On hover, a small **edit pencil icon** appears next to the header text. Click it:

- Header text replaced by an inline text input pre-filled with current name
- Inline ✓ Save and ✗ Cancel buttons appear next to the input
- Enter saves; Escape cancels; click outside cancels
- On save: PATCH the sub-group, update local state, restore header

Show a tiny tooltip on first hover: "Renaming updates the sub-group everywhere — QB, KB, swipe cards."

### Endpoint

```ts
// PATCH /api/admin/cards/subgroups/[id]
{ name?: string; description?: string }   // partial update, either or both
```

Body validation:
- `name` must be non-empty trimmed string
- `name` must be unique within `(level, topic)` — reject 409 if duplicate (same check as the create endpoint)
- `description` can be empty/null

Response: the updated row.

Auth: `verifyAdminAuth(req)`. Use `getSupabaseAdmin()` for the write.

### Client

Inline edit pattern — add a small `<SubgroupHeader />` component:

```tsx
function SubgroupHeader({ sg, cardCount, onRenamed }: { sg: Subgroup; cardCount: number; onRenamed: (updated: Subgroup) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sg.name);
  // ... text input + Save + Cancel ...
}
```

Don't show the pencil on touch devices where hover is meaningless — use `@media (hover: hover)` so the icon appears only on desktop hover, and on touch devices show it always at lower opacity.

## Feature 3 — Delete empty sub-group (~20 min)

### UX

A trash icon next to the section header, ONLY shown when the section has 0 cards. Clicking it opens a confirmation modal: *"Delete sub-group '{name}'? This cannot be undone. The sub-group is currently empty in this topic, but it may still be referenced by exam questions or KB entries."*

The confirmation requires explicit click on a red "Delete" button.

On confirm:
- DELETE `/api/admin/cards/subgroups/[id]`
- On success: remove the section from the local state
- On 409 (FK conflict): show a clearer error: "Can't delete — this sub-group is referenced by N exam questions and/or M KB entries. Reassign those first."

### Endpoint

```ts
// DELETE /api/admin/cards/subgroups/[id]
```

Server-side safety checks (in order):

1. Confirm zero `content_snippets` rows reference this sub-group:
   ```sql
   SELECT 1 FROM content_snippets WHERE subgroup_id = $1 LIMIT 1;
   ```
   If any exist → 409 "Sub-group has cards. Delete them first."
2. Confirm zero `question_subgroups` references:
   ```sql
   SELECT count(*) FROM question_subgroups WHERE subgroup_id = $1;
   ```
   If > 0 → 409 with the count: "Sub-group is referenced by {N} exam questions. Reassign first."
3. Confirm zero `kb_entries.related_subgroup_ids` references (more expensive query):
   ```sql
   SELECT count(*) FROM kb_entries WHERE $1 = ANY(related_subgroup_ids);
   ```
   If > 0 → 409 with the count.
4. Only if all three are zero, `DELETE FROM subgroups WHERE id = $1`. Return `{ ok: true }`.

Auth: `verifyAdminAuth(req)`. Use the admin Supabase client.

### Client

Add the trash button to the section header. Confirmation modal pattern same as the existing card-delete confirmation.

## Feature 5 — Create an empty section (~15 min)

### Why

Today the only way to create a sub-group is via the New Card modal's "+ New sub-group" option, which forces you to also create a card. Adrian wants to plan structure first (create empty sections) and fill cards later.

### UX

Add a **"+ New section"** button at the top of the list view (next to "+ New card") in `EditCardsClient.tsx`. Clicking it opens the same inline name + description form pattern as the New Card modal's "+ New sub-group" option, but without the card-creation step:

```
┌─────────────────────────────────────────────────────┐
│  Cards editor                  + New section  + New card │
├─────────────────────────────────────────────────────┤
│  Level: [AM ▾]   Topic: [Surds ▾]   Sub-group: [...] │
└─────────────────────────────────────────────────────┘
```

When clicked, show a small modal (or inline drawer):
- **Name** (required text input)
- **Description** (optional textarea, recommended)
- **Create section** + **Cancel** buttons

On submit: POST to existing `/api/admin/cards/subgroups/create` (no new endpoint needed — it already supports level + topic + name + description) → on success, refresh the sidebar so the new section appears with `(0 cards)`. The section will be visible but empty until cards are added.

No new endpoint needed. Just a new button + modal that reuses the existing create-subgroup API.

### Acceptance criteria

- Click "+ New section" → modal opens
- Fill in name "Test Empty Section", description "Just a structure placeholder"
- Click Create → modal closes, sidebar shows "Test Empty Section (0)"
- SQL: `SELECT * FROM subgroups WHERE name = 'Test Empty Section';` returns one row
- Refresh page → section persists
- Duplicate name in same (level, topic) → 409 error inline

## Feature 4 — Reorder sub-groups (~1 h, optional)

### Why this needs a migration

Today the cards list page orders sub-groups by `id ASC`. Newly created sub-groups appear at the bottom; you can't manually move "Surd simplification" above "Rationalise denominator" without changing the `id` (which you can't).

To support reorderable sections, `subgroups` needs an `order_index` column:

```sql
-- migrations/subgroups_order_index.sql
ALTER TABLE subgroups ADD COLUMN IF NOT EXISTS order_index real;

-- Seed existing rows with monotonically increasing values, partitioned by (level, topic):
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY level, topic ORDER BY id) AS rn
  FROM subgroups
)
UPDATE subgroups s SET order_index = r.rn FROM ranked r WHERE s.id = r.id;

CREATE INDEX IF NOT EXISTS idx_subgroups_level_topic_order
  ON subgroups (level, topic, order_index);

NOTIFY pgrst, 'reload schema';
```

Use `real` (not `int`) so reorderings can insert between two adjacent values (e.g. between 3 and 4, set new value to 3.5) without rewriting every row. The endpoint can periodically renormalise to 1..N.

### Endpoint

```ts
// POST /api/admin/cards/subgroups/reorder
{
  level: string;       // for scoping the renumber operation
  topic: string;
  orderedIds: number[]; // sub-group ids in the desired order
}
```

Server rewrites `order_index` to 1..N in that order for all rows matching the (level, topic) scope.

Auth: `verifyAdminAuth(req)`.

### Client

Add a small drag handle (⠿) to the LEFT of each section header. Use `@dnd-kit/sortable` for a vertical sortable list of section headers. On drag end, call the new endpoint and refresh.

**If this feature is skipped for v1:** that's fine. The first three features alone are a huge quality-of-life upgrade. Feature 4 can come later — just adds the migration + endpoint + drag handle when you do it.

## Acceptance criteria

Verify ALL of the following before declaring done:

1. **Cross-section drag** — drag "Multiplying surds" from "Simplify / combine surd expression" onto "Surds Operations". After drop:
   - Card now appears under "Surds Operations"
   - "Simplify / combine surd expression" count drops from (3) to (2)
   - "Surds Operations" count rises from (1) to (2)
   - Refresh the page — change persists
   - Open the card in editor — `subgroup_id` shows the new value
2. **Cross-section drag — error path** — try to drag a card onto its own section (or no valid target). No DB write occurs, card returns to original spot.
3. **Rename sub-group** — click pencil on "Simplifying surds" → rename to "Surd simplification basics" → save. Refresh page. Sidebar shows new name. SQL `SELECT name FROM subgroups WHERE id = 105;` returns new name. Open the swipe app at `/revise/am/surds/worked-examples` — sub-group label shows new name too.
4. **Rename — duplicate guard** — try to rename "Rationalise using the conjugate" to "Simplifying surds" (existing name) → see 409 error inline, original name stays.
5. **Delete empty sub-group** — create a brand-new sub-group via the modal, immediately delete it via the trash icon → confirmation modal → confirm → row disappears from sidebar. `SELECT * FROM subgroups WHERE id = ...` returns 0 rows.
6. **Delete non-empty sub-group** — try to delete a sub-group that has cards → see error "Sub-group has cards. Delete them first." No DB change.
7. **Delete sub-group with QB references** — pick a sub-group that's referenced in `question_subgroups`, ensure it has 0 cards, try to delete → see error with the question count. No DB change.
8. **(if Feature 4 included)** Drag the "Surds Operations" section header above "Solve surd equation" → save. Refresh — order persists.
9. **No regression** — within-section drag-to-reorder still works exactly as before.
10. **No regression** — opening the card editor still lets you change `subgroup_id` via the dropdown (parallel path to dragging — both should remain functional).

## Out of scope for v1

- **Cross-topic moves** — moving a card from AM Surds to AM Indices is a different sub-group AND different topic. Not supported here. Out of scope because it touches the broader topic taxonomy.
- **Merging sub-groups** ("merge sg105 into sg106, redirect everything") — separate feature; needs careful FK rewiring across content_snippets, question_subgroups, kb_entries.
- **Bulk move** — select multiple cards, move all to a different sub-group. Useful but not v1.
- **Section collapse / expand** to hide cards of a section temporarily. Nice but not v1.

## Update `CLAUDE.md`

After landing this, add to the website CLAUDE.md under the cards editor section:

```
- `admin/cards/move/route.ts` — POST: move a card to a different sub-group within the same (level, topic), recomputes order_index for source and destination
- `admin/cards/subgroups/[id]/route.ts` — PATCH (rename) / DELETE (only when no QB/KB/cards reference)
- `admin/cards/subgroups/reorder/route.ts` — POST: rewrite order_index for sub-groups in a (level, topic) scope
```

## Build order

1. **Feature 2 (rename)** — smallest, no drag complexity. Validates the endpoint + UI pattern. (~30 min)
2. **Feature 3 (delete empty)** — uses same modal/endpoint patterns. (~20 min)
3. **Feature 1 (cross-section drag)** — the biggest of the three. (~1 h)
4. **Feature 4 (sub-group reorder)** — only if you want it. (~1 h + migration)
5. **Acceptance test pass** (~20 min)
6. **Commit + push to main** — Vercel auto-deploys

Total without Feature 4: ~2 hours. With Feature 4: ~3 hours.

## When you're done

1. Commit + push to main.
2. Tell Adrian: "Cross-section drag, rename, and delete-empty live on `/admin/edit-cards`. Try moving Multiplying surds to Surds Operations."
3. Update `CLAUDE.md` per the section above.

That's it.
