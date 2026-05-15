# Refresher Cards — Implementation Brief

**For:** Claude Code, working across 3 repos (`adrianmathtuition-website`, `adrianmath-telegram-math-bot`, Supabase via MCP).

**Goal:** Extend the existing Cards Editor and `/revise` flow so each sub-group can have **Refresher cards** in addition to **Worked Examples**. Both kinds live in the same `content_snippets` table; they're distinguished by the existing `content_kind` column.

**Current state:**
- `content_snippets` rows with `content_kind='worked_example'` power the swipe app at `/revise/{level}/{topic-slug}/worked-examples`.
- The Cards Editor at `/admin/edit-cards/[level]/[topic]/[subgroup]` edits these rows.
- In the bot's `/revise` topic menu, the **🧠 Refresher** button currently shows a "Coming soon!" alert (callback `rv_menu_refresher`).
- All 32 AM topics now have at least one worked example per sub-group (source: `manual_curation_2026_05_kb`). Refresher cards do not yet exist.

**Target state:**
- Same Cards Editor, but each sub-group view shows **two sections**: 🧠 Refresher and 💡 Worked Examples, both editable in one screen.
- Bot's Refresher button sends a URL to a new swipe page filtered to `content_kind='refresher'`.
- Worked Examples button continues to work unchanged.

---

## 1. Database (Supabase)

**No schema migration needed.** `content_snippets.content_kind` is already a free-text column. We add `'refresher'` as a new value.

Sanity check — verify the existing distinct values:
```sql
SELECT content_kind, COUNT(*)
FROM content_snippets
WHERE level = 'AM'
GROUP BY content_kind;
```
Expected: mostly `worked_example`. After this feature ships, also `refresher`.

**No RLS changes** — Cards Editor uses service_role key already.

---

## 2. Website: Cards Editor (`/admin/edit-cards`)

### 2a. API routes — add `kind` filter

The existing routes all assume worked-example cards. Add a `kind` query/body param (defaulting to `worked_example` for backward compat):

- `GET /api/admin/cards/list` — already filters by `(level, topic, subgroupId)`. **Add `kind` param** so the call becomes `?level=AM&topic=Surds&subgroupId=105&kind=refresher`. Filter `content_snippets` by both `content_kind` and the existing criteria.
- `POST /api/admin/cards/create` — body already takes `(level, topic, subgroup_id, content)`. **Add `content_kind` to the body**; default to `'worked_example'`. Auto `order_index` should be max + 1 within the same `(subgroup_id, content_kind)` group, not globally per sub-group.
- `POST /api/admin/cards/reorder` — accepts `orderedIds`. No change needed (reorder works on whichever set of ids is passed). The frontend must only pass IDs from one kind at a time.
- `PATCH/DELETE /api/admin/cards/[id]` — no change.
- `GET /api/admin/cards/sections/list` — used by display_group sidebar. **Add `kind` param** so the section list scopes to one kind at a time. The display_group concept applies per-kind: a sub-group may have refresher cards in one display_group and worked examples in another.

### 2b. Sub-group view — two sections

In `/admin/edit-cards/page.tsx`, after the sub-group is selected and cards are loaded:

- Render **two stacked panels**:
  1. **🧠 Refresher** — collapsible, default expanded. Header: `🧠 Refresher`, count badge, `+ New refresher` button.
  2. **💡 Worked Examples** — same layout. Header: `💡 Worked Examples`, count badge, `+ New worked example` button.
- Within each panel, the existing card-list UI (drag-handle, title, body preview, edit button, delete button) is reused.
- Drag-reorder works **within a panel only** — you can't drag a refresher card into the Worked Examples list (no kind-changing via drag).
- The "Sections" / `display_group` sub-sidebar (if implemented) operates within whichever panel is currently focused.
- "Move card" (between sub-groups) — keep existing behaviour; the moved card retains its `content_kind`.

### 2c. Single-card editor — show kind badge

In `/admin/edit-cards/[id]/page.tsx`:
- Show a small badge near the title: 🧠 Refresher or 💡 Worked Example. Read-only — the card's kind is set at creation and not changed afterwards.
- AI assist sidebar (`edit-cards-ai` SSE endpoint) — pass `content_kind` so the AI prompt can adapt its advice (a refresher card is shorter, formula/tip-focused; a worked example walks through a full problem). Add a one-line system-prompt instruction switch keyed on this.

### 2d. UX details

- The header strip at the top of the sub-group view stays the same: "Level / Topic / Sub-group" breadcrumb + total card count (now sums both kinds).
- Empty state per panel: "No refresher cards yet — click + to create one." / "No worked examples yet — click + to create one."
- Save status indicator — unchanged.

---

## 3. Website: Swipe App (new refresher route)

**Pattern choice:** Add a parallel route `/revise/[topic]/[subtopic]/refresher/page.tsx` that mirrors `worked-examples/page.tsx`. Cleaner URLs, separate page titles, easy SEO.

(Reject the `?kind=` query-param approach — students bookmarking the URL should see "Refresher" in the path.)

### 3a. New route file

Create `src/app/revise/[topic]/[subtopic]/refresher/page.tsx` and `src/app/revise/[topic]/[subtopic]/refresher/SwipeApp.tsx` (or reuse the existing `SwipeApp` component with a `kind` prop).

The route is `/revise/{level}/{topic-slug}/refresher`. Example: `/revise/am/differentiation-techniques/refresher`.

### 3b. Behaviour

Identical to the worked-examples swipe page, except:
- Supabase query filters `content_kind='refresher'`.
- Page heading reads "Refresher — {topic name}" instead of "Worked Examples — {topic name}".
- The "Practice this concept" CTA at the end remains the same (still points to the /revise bot flow or `/practice/[sg]`).
- The `?subgroup={id}` filter still works — used by Teach Me from the bot.

### 3c. Empty state

If a sub-group has no refresher card yet (likely common at launch), show:
> "No refresher card for this sub-group yet. Try worked examples instead."
> [📚 Open Worked Examples]

This avoids dead ends as Adrian backfills refresher content.

### 3d. Same SVG/rehype-raw rendering

The new SwipeApp must include the same `rehype-raw` plugin chain so SVG diagrams render. Currently the worked-examples SwipeApp has this (already pushed by Adrian); make sure the refresher SwipeApp imports the same pipeline.

---

## 4. Bot: `/revise` Refresher button

In `handlers/revise.js`, find the `rv_menu_refresher` callback handler (currently triggers `answerCallbackQuery` with `show_alert=true`, "Coming soon!"). Replace with:

```js
// Send the refresher URL for this topic, then re-show the topic menu.
const url = `${process.env.WEBSITE_BASE_URL}/revise/${level.toLowerCase()}/${topicSlug(topic)}/refresher`;
await bot.sendMessage(chatId,
  `🧠 *Refresher: ${topic}*\n\n${url}`,
  { parse_mode: 'Markdown' }
);
// Then re-show the topic menu (Practice / Worked Examples / Refresher / Different topic / Done)
return showTopicMenu(bot, chatId, topic, level);
```

Pattern matches the existing `rv_menu_examples` handler (which sends the worked-examples URL + re-shows menu). Copy that flow.

The button label `🧠 Refresher (coming soon)` should be updated to just `🧠 Refresher` in the topic menu rendering.

---

## 5. Bot: Teach Me hook (optional)

The Teach Me feature (`handlers/teach.js`) sends `/worked-examples?subgroup={id}` URLs. **No change needed in this iteration** — Teach Me continues to point at worked examples by default.

Future improvement (not in scope): a Teach Me follow-up button "Just give me the formula" that links to the refresher route — useful when a student already understands the steps but blanks on a specific identity.

---

## 6. Acceptance criteria

After implementation, verify by hand:

1. **Editor**: Open `/admin/edit-cards`, pick AM > Surds > sg105 (or any sub-group with existing worked examples). Both sections render. Worked Examples section shows the existing cards. Refresher section is empty.
2. **Create**: Click `+ New refresher`. The card editor opens with a 🧠 Refresher badge. Save a short card like "Surd = irrational root; `a√b` form requires `b` square-free." See it appear in the Refresher list.
3. **Bot**: In Telegram, run `/revise` → pick Surds → tap 🧠 Refresher. Receive a URL like `https://adrianmathtuition.com/revise/am/surds/refresher`.
4. **Swipe app**: Open that URL. See the refresher card you just created. Confirm it renders KaTeX / inline SVG correctly.
5. **Empty fallback**: Pick a different sub-group with no refresher card yet. See the "No refresher card for this sub-group yet" empty state with link back to worked examples.
6. **Backward compat**: Worked Examples button in the bot still works and sends the existing URL. The existing 299 worked-example cards are unaffected.

---

## 7. Implementation order (suggested)

1. **Supabase** — verify no migration needed (just a docstring update in `content_snippets` referencing the new `refresher` value if you have such a doc).
2. **Website API routes** — add `kind` filter to `list`, `create`, `sections/list`.
3. **Website Cards Editor UI** — split sub-group view into two sections.
4. **Website swipe app** — new `/refresher` route + SwipeApp variant.
5. **Bot** — replace `rv_menu_refresher` placeholder with real URL send + re-show menu.
6. **Manual test** — create one refresher card per AM topic to bootstrap (Adrian will do this in chat sessions afterwards).

---

## 8. Open question for Adrian

- **Display_group section sidebar**: should refresher cards be grouped under display_groups like worked examples are, or just a flat list (one per sub-group, no sectioning needed)? Default to "flat list, no display_group sidebar for refresher" until Adrian explicitly needs it — keeps the UI simpler at launch.

---

## File-level summary

**adrianmathtuition-website:**
- `src/app/api/admin/cards/list/route.ts` — add `kind` filter
- `src/app/api/admin/cards/create/route.ts` — add `content_kind` to body, default `worked_example`
- `src/app/api/admin/cards/sections/list/route.ts` — add `kind` filter
- `src/app/api/edit-cards-ai/route.ts` — accept `content_kind`, branch prompt
- `src/app/admin/edit-cards/page.tsx` — split sub-group view into two sections
- `src/app/admin/edit-cards/[id]/page.tsx` — show kind badge
- `src/app/revise/[topic]/[subtopic]/refresher/page.tsx` — NEW
- `src/app/revise/[topic]/[subtopic]/refresher/SwipeApp.tsx` — NEW (or share component with worked-examples)

**adrianmath-telegram-math-bot:**
- `handlers/revise.js` — replace `rv_menu_refresher` handler, update menu button label

**No CLAUDE.md updates needed** — these are additive changes inside existing patterns. Touch `CLAUDE.md` only if you decide to mention the new refresher route in the "/revise flow" section.
