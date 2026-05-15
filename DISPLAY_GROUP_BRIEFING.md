# Display Group — Decouple Card Sections from Sub-Groups

> Self-contained brief. Adds a `display_group` column to `content_snippets` so the **section name students see** is fully decoupled from the **sub-group name used for QB labelling**. Sections become first-class, editable, draggable units in the cards editor. ~2.5-3 hours of work.

## What you're building

Today the cards editor's sidebar (and the swipe app) groups cards by **sub-group**. That's wrong for student-facing UX because sub-group names were chosen for the question bank — "Simplify / combine surd expression", "Rationalise denominator" — too technical, too granular, and Adrian has no way to merge two sub-groups under a single friendly section name like "Simplifying surds".

This brief introduces a separate field, `display_group` (free-text), stored on each card. Cards with the same `display_group` value within the same `(level, topic)` get rendered as one section — in both the cards editor sidebar and the swipe app. Sub-groups stay where they are for QB labelling, totally invisible to students.

**The decoupling explicitly delivers all of these:**

1. Edit a section name (rename "Simplify / combine surd expression" section → "Simplifying surds" without touching the sub-group name)
2. Create an empty section (just a display_group label — no need to create a sub-group)
3. Delete a section (clear `display_group` on its cards or refuse if non-empty — Adrian's call)
4. Move a card from any section to any other section (single UPDATE on `display_group`)
5. Edit card titles (already supported by existing schema)
6. AI sidebar can still write/amend/improve cards (already supported, no change needed)
7. Section names and card titles are both fully independent of sub-group names

## Why this matters

The same tension you've already noticed: sub-group taxonomy is precise (good for labelling, searching, the bot's Teach Me sub-skill routing) but bad for student-facing presentation. With `display_group`, you keep both — the precision for QB/KB/Teach Me, the friendly umbrella names for the swipe app.

After this ships, a sub-group can be referenced for QB labelling without ever appearing as a section header to students.

## Files you'll touch

```
adrianmathtuition-website/
├── migrations/content_snippets_display_group.sql       ← NEW
├── src/app/api/admin/cards/
│   ├── list/route.ts                                    ← return display_group + group by it
│   ├── [id]/route.ts                                    ← PATCH accepts display_group
│   ├── sections/                                        ← NEW folder
│   │   ├── list/route.ts                                ← NEW: GET distinct display_groups for (level, topic)
│   │   ├── rename/route.ts                              ← NEW: POST rename a display_group across N cards
│   │   ├── delete/route.ts                              ← NEW: POST clear display_group across N cards
│   │   └── move-card/route.ts                           ← NEW: POST move a card's display_group + recompute order
│   └── reorder/route.ts                                 ← already exists; extend to handle display_group reorder
├── src/app/admin/edit-cards/
│   ├── EditCardsClient.tsx                              ← sidebar groups by display_group; cross-section drag
│   └── [id]/EditorClient.tsx                            ← editor shows BOTH display_group + sub-group as separate fields
└── src/app/revise/[topic]/[subtopic]/worked-examples/page.tsx
                                                        ← group cards by display_group (fallback to sub-group name)
```

## Schema migration

**File:** `migrations/content_snippets_display_group.sql`

```sql
ALTER TABLE content_snippets ADD COLUMN IF NOT EXISTS display_group text;

-- Backfill: existing cards inherit their sub-group's name as the default display_group,
-- so behaviour is identical for cards Adrian hasn't customised yet.
UPDATE content_snippets cs
SET display_group = sg.name
FROM subgroups sg
WHERE cs.subgroup_id = sg.id
  AND cs.display_group IS NULL;

-- Index for fast section-grouped queries (the swipe app + cards editor lean on this).
CREATE INDEX IF NOT EXISTS idx_content_snippets_section_order
  ON content_snippets (level, topic, display_group, order_index)
  WHERE content_kind = 'worked_example' AND is_published = true;

NOTIFY pgrst, 'reload schema';
```

Apply via `execute_sql`. The backfill guarantees zero behaviour change for any existing card — the sidebar and swipe app will look identical immediately after migration, just driven by a different column.

## How sections work after this ships

**Section identity = the value of `display_group`.** No separate `sections` table; sections are implicit groupings by string equality within `(level, topic)`.

| Operation | What actually happens in SQL |
|---|---|
| Create empty section | UI-only state until a card is created/moved into it (no DB row exists for "empty" sections — they're implicit) |
| Rename section "A" → "B" | `UPDATE content_snippets SET display_group = 'B' WHERE level=... AND topic=... AND display_group = 'A'` |
| Delete section "A" | Refuse if cards exist; else no-op (no row to delete) |
| Move card to section "B" | `UPDATE content_snippets SET display_group = 'B', order_index = (MAX in B) + 1 WHERE id = ...` |
| Reorder cards within section | `UPDATE order_index` for each card in array order |
| Reorder sections themselves | Out of scope for v1 (sections sort alphabetically or by min(order_index) of their cards) |

**Edge case: empty section visibility.** If you create section "Foo" but no card has `display_group = 'Foo'` yet, that section doesn't physically exist in the DB. The UI shows it only as long as the local state remembers it — once the page refreshes without a card in it, the empty section disappears. (Not a bug — just a consequence of sections being implicit. v2 could add a separate `sections_meta` table for empty-section persistence; v1 keeps it simple.)

## Endpoint specs

### `GET /api/admin/cards/sections/list?level=AM&topic=Surds`

Returns the distinct display_group values in that scope, in alphabetical order, with card counts:

```json
{
  "sections": [
    { "name": "Simplifying surds", "card_count": 6 },
    { "name": "Solving surd equations", "card_count": 2 },
    { "name": "Applied surds", "card_count": 3 }
  ]
}
```

Implementation: `SELECT display_group, COUNT(*) FROM content_snippets WHERE level=$1 AND topic=$2 AND content_kind='worked_example' GROUP BY display_group ORDER BY display_group`.

### `POST /api/admin/cards/sections/rename`

Body:
```json
{ "level": "AM", "topic": "Surds", "oldName": "Simplifying surds", "newName": "Surd simplification basics" }
```

Server-side: UPDATE `display_group` from `oldName` → `newName` across all cards in the scope. Validate `newName` is non-empty trimmed string. If `newName` already exists (cards with that value), allow it (merges the two sections — that's fine, the user just "renamed into an existing section").

### `POST /api/admin/cards/sections/delete`

Body:
```json
{ "level": "AM", "topic": "Surds", "name": "Surds Operations" }
```

Server-side: count cards with that `display_group`. If > 0, return 409 with the count: "Section 'Surds Operations' has 4 cards. Move or delete them first." If = 0, return 200 (no-op since the section is implicit).

### `POST /api/admin/cards/sections/move-card`

Body:
```json
{
  "cardId": "uuid",
  "targetSection": "Solving surd equations",
  "sourceOrderedIds": ["uuid1", "uuid2", "uuid3"],
  "destOrderedIds": ["uuid4", "uuid5", "uuid_just_moved"]
}
```

Server-side: UPDATE the moved card's `display_group` to `targetSection`, then recompute `order_index` for both source and destination sections from the arrays. (Same pattern as the `move-card` endpoint already specced in `EDIT_CARDS_ORGANIZE_BRIEFING.md` Feature 1, but now keyed by `display_group` instead of `subgroup_id`.)

### `PATCH /api/admin/cards/[id]` (existing route — extend)

Accept `display_group` in the body. When present, update it. When client sends `display_group: null`, treat as "remove section assignment" (card becomes ungrouped — falls into a "Uncategorised" section in the UI).

## Cards editor UI changes

### List view (`EditCardsClient.tsx`)

**Sidebar grouping switches from sub-group to display_group.** Each section header shows the display_group value with card count. Inside each section, cards appear ordered by `order_index`.

Each card row in the sidebar now shows its **sub-group as a small grey badge** for context — so you can still see at a glance which sub-group a card is labelled with:

```
┌─ Simplifying surds (6) ───────────────────────────┐
│ ⠿ 1.  Simplify √72                  [sg105]  Pub  │
│ ⠿ 2.  Combine √48 + √27            [sg105]  Pub  │
│ ⠿ 3.  Rationalise √5 / √3           [sg106]  Pub  │
│ ⠿ 4.  Rationalise with conjugate    [sg106]  Pub  │
│ ⠿ 5.  ...                                          │
└────────────────────────────────────────────────────┘

┌─ Solving surd equations (2) ──────────────────────┐
│ ⠿ 1.  Solve √(x+2) = x              [sg107]  Pub  │
│ ⠿ 2.  Surd equation with polynomial [sg107]  Pub  │
└────────────────────────────────────────────────────┘
```

**Top-of-list controls:**
- "+ New section" button → modal with text input "Section name"; on submit, adds the name to local UI state; the section appears empty in the sidebar. You can drag cards into it OR create a new card directly in that section.
- "+ New card" button (existing) → modal now includes a **Section dropdown** (with "+ New section…" option at the bottom, same pattern as the existing "+ New sub-group" UI) so a new card lands in the right section from the start.

**Section header controls** (hover-reveal, same pencil/trash pattern as the existing rename UI):
- ✏️ Rename section — inline text input → POST `/api/admin/cards/sections/rename`
- 🗑 Delete section (only when 0 cards) → POST `/api/admin/cards/sections/delete`
- Drag handle on each section to reorder sections (optional v2; v1 alphabetical is fine)

**Cross-section drag** — already specced in the organize brief but now keyed by display_group:
- Sections act as drop zones (id = `section-{display_group}`)
- Section headers also act as drop zones for empty section
- Drop → POST `/api/admin/cards/sections/move-card`
- Optimistic update, revert on server error

### Editor view (`[id]/EditorClient.tsx`)

The single-card editor now shows BOTH fields in the top row, side by side:

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Back to Surds                 Section · Card 1 of 6             │
├────────────────────────────────────────────────────────────────────┤
│  Card title                                                        │
│  [Simplify √72                                                  ]  │
│                                                                    │
│  Section (student-facing)        Sub-group (QB labelling)          │
│  [Simplifying surds         ▾]   [Simplify/combine (sg105) ▾]      │
│                                                                    │
│  Order [1]   ☑ Published                                           │
└────────────────────────────────────────────────────────────────────┘
```

**Section dropdown** — populated from `/api/admin/cards/sections/list` for the current (level, topic). Includes "+ New section…" option at the bottom that expands an inline text input.

**Sub-group dropdown** — existing UI, unchanged. Still admin-only "what does QB call this skill" knob.

Both fields save via the existing PATCH route. Saving display_group moves the card to a different section; saving subgroup_id changes its QB label. They're independent.

## Swipe app changes (`/revise/.../worked-examples`)

**Server query change:** order cards by `(display_group, order_index)` instead of `(subgroup_id, order_index)`. Pass each section's `display_group` value to the SwipeApp component instead of the sub-group name.

```ts
const { data: cards } = await supa
  .from('content_snippets')
  .select('id, subgroup_id, display_group, order_index, card_title, content, content_kind')
  .eq('level', level.toUpperCase())
  .eq('topic', canonicalTopic)
  .eq('content_kind', 'worked_example')
  .in('feature', ['both', 'web'])
  .eq('is_published', true)
  .order('display_group', { ascending: true })
  .order('order_index', { ascending: true });
```

Section header in the swipe app uses the `display_group` value directly. If `display_group` is NULL on a card (shouldn't happen after backfill, but defensive), fall back to the sub-group's name.

**Subgroup filter compatibility:** when the bot Teach Me sends `?subgroup=N`, the swipe page still filters to that sub-group regardless of which display_group those cards are in. The filtered view groups them by display_group. So a sub-skill might span multiple sections — that's fine, just shows them ordered.

## Out of scope for v1

- **Reordering sections themselves** (drag a section above another) — sections sort alphabetically for v1. Probably want a `section_order_index` on a future `sections_meta` table when you outgrow alphabetical.
- **Persisting empty sections** — empty sections are UI-state-only (vanish on refresh). v2 could add a `sections_meta` table to persist them.
- **Section per-sub-group constraints** — a card can be in any section regardless of its sub-group. No enforcement that "sg105 must always be in section X". You're trusted to put cards where they belong.
- **Bulk move** — moving N cards at once. v1 = one drag at a time.

## Relationship to `EDIT_CARDS_ORGANIZE_BRIEFING.md`

This brief **supersedes some features** in the organize brief. Specifically:

| Organize-brief feature | Status after this ships |
|---|---|
| Feature 1: Cross-section card drag (keyed by sub-group) | Replaced by section-based drag (keyed by display_group) |
| Feature 2: Rename sub-group inline | Still useful for QB-labelling renames. Independent of section renames. |
| Feature 3: Delete empty sub-group | Still useful (deletes the sub-group row from `subgroups` for QB cleanup). Different from section delete. |
| Feature 4: Reorder sub-groups | Mostly irrelevant — sub-groups don't drive the sidebar order anymore. Could keep for KB/QB purposes if shipped. |
| Feature 5: Create empty section (= create empty sub-group) | Now means "create a display_group label" — much simpler, no DB row, just adds to UI state |

If features 1, 3, 4, 5 of the organize brief have NOT yet shipped, **skip them** — this brief replaces them. If they have shipped, leave them alone; they still work, just less central to the editor's UX.

Feature 2 (rename sub-group) is still useful and keeps working alongside this brief.

## Acceptance criteria

Before declaring done:

1. **Migration applies cleanly**: `SELECT display_group, COUNT(*) FROM content_snippets WHERE display_group IS NULL` returns 0 after backfill.
2. Open `/admin/edit-cards` → AM → Surds. Sidebar groups cards by display_group (initially showing the same names as sub-groups, because of the backfill).
3. Click ✏️ on a section header → rename "Simplify / combine surd expression" → "Simplifying surds" → save. Refresh. Section now reads "Simplifying surds" with the same cards.
4. SQL check: `SELECT DISTINCT display_group FROM content_snippets WHERE topic='Surds';` returns "Simplifying surds" (not "Simplify / combine surd expression") for those cards. The `subgroups.name` row for sg105 is unchanged.
5. Drag a card from "Rationalise denominator" section to "Simplifying surds" section. Card visibly moves. Refresh — change persists.
6. SQL check: that card's `display_group` is "Simplifying surds", its `subgroup_id` is unchanged.
7. "+ New section" button → name "Test section" → appears in sidebar as empty. Drag a card into it. Refresh. Card lands in "Test section".
8. Move the card back out, leaving "Test section" empty. Click 🗑 → confirmation → section disappears (no DB write since it's implicit and empty).
9. Open a card's editor view. See both "Section" and "Sub-group" dropdowns. Change section via dropdown → save → card moves in the list view. Change sub-group via dropdown → save → card's grey sub-group badge updates, section stays the same.
10. Open `/revise/am/surds/worked-examples`. Cards are grouped by the new section names ("Simplifying surds", etc.), not the original sub-group names.
11. Open `/revise/am/surds/worked-examples?subgroup=107`. Only cards from sg107 appear (their display_group is "Solving surd equations" — section header still shows that).
12. Bot Teach Me on an AM Surds question → routes to a sub-group → swipe URL with `?subgroup=N` still works.
13. AI sidebar still writes/amends/improves cards (unchanged, regression check).

## Build order

1. **Apply migration** (15 min — via execute_sql).
2. **Backend: 4 new section routes + extend PATCH/list** (~1 h)
3. **Cards editor list view: switch grouping, add section controls + cross-section drag** (~1 h)
4. **Cards editor single-card view: add Section dropdown alongside Sub-group dropdown** (~30 min)
5. **Swipe app: change grouping query + section-header rendering** (~30 min)
6. **Acceptance test pass** (~30 min)
7. **Commit + push to main**

Total: ~3 hours with Sonnet 4.6.

## Update `CLAUDE.md`

Add to `Database` section:

```
- `content_snippets.display_group` (text, nullable) — student-facing section name for the swipe app + cards editor sidebar. Independent of `subgroup_id` (which remains for QB labelling). Cards with the same display_group within (level, topic) appear as one section. NULL = falls back to the sub-group's name.
```

Add to the API routes list:

```
- `admin/cards/sections/list/route.ts` — GET distinct display_groups + card counts for a (level, topic)
- `admin/cards/sections/rename/route.ts` — POST rename a display_group across all cards in scope
- `admin/cards/sections/delete/route.ts` — POST delete a section (refuses if non-empty)
- `admin/cards/sections/move-card/route.ts` — POST move card to a different section, recompute order_index
```

## When you're done

1. Commit + push to main.
2. Tell Adrian: "Display group live. On `/admin/edit-cards`, AM → Surds, try renaming a section, dragging cards across sections, and creating a new section. The swipe app now reflects whatever section names you set."
3. Verify the swipe app at `/revise/am/surds/worked-examples` shows the renamed sections.

That's it.
