# Cards Editor — Build Briefing

> **Read this first**, then start. Self-contained spec for `/admin/edit-cards` — a desktop-first admin tool to CRUD worked-example cards stored in `content_snippets`, with an AI sidebar that lets Adrian vibe-code edits via Claude.

## What you're building

A two-page admin tool inside the existing Next.js website:

1. **List page** at `/admin/edit-cards` — pick level → topic → sub-group, see all cards in order, jump to edit, drag to reorder, add new, delete.
2. **Editor page** at `/admin/edit-cards/[id]` — a single card open for editing. Textarea on the left, live KaTeX preview on the right, AI sidebar on the far right that streams Claude rewrites with diff + accept/reject.

**Desktop-first.** Editing LaTeX on mobile is painful, so optimise for ≥1024px screens. Stay responsive enough to glance at on phone (read-only is fine on mobile — disable the textarea below 768px and show a "Open on desktop to edit" notice).

**Why it matters:** Adrian has hand-curated ~60+ swipe cards across 5 AM topics (Quadratic Functions, Surds, Indices, Logarithms, Quadratic Inequalities) and another 150+ topics to go across AM/EM/JC/S1/S2. Editing via SQL inserts is brutal. He wants the same speed as `/admin/edit-notes` but for cards — including the AI assist.

## Data source

**Table: `content_snippets`** (Supabase, project `nempslbewxtlikfzachi`).

```
id                  uuid (pk)
content_kind        text   — 'worked_example' (v1 scope) | 'refresher' | 'formula' | 'tricky_part' | 'tip'
feature             text   — 'both' | 'bot' | 'web'   (v1 edits 'both' and 'web')
level               text   — 'AM' | 'EM' | 'JC' | 'S1' | 'S2'
topic               text   — canonical topic name e.g. 'Surds'
subgroup_id         bigint — references subgroups.id
order_index         int    — sort within a (level, topic, subgroup_id), asc
card_title          text   — short heading shown on the card (often the worked-example title)
content             text   — markdown + LaTeX (KaTeX delimiters: $...$ inline, $$...$$ block)
                              multi-step equations use $\begin{aligned}...\\...\end{aligned}$
source              text   — provenance: 'kb_promotion' | 'manual_curation_2026_05' | etc.
source_kb_entry_id  uuid   — fk to kb_entries (nullable; provenance trail)
is_published        bool   — only published cards appear on swipe app
created_at          timestamptz
updated_at          timestamptz
```

**Consumer for context:** `src/app/revise/[topic]/[subtopic]/worked-examples/page.tsx` reads from this table. Any edit you save here is visible on next page load of the swipe app (no cache layer).

**Subgroups table** for the dropdown:
```sql
SELECT id, name, description FROM subgroups WHERE level = $1 AND topic = $2 ORDER BY id;
```

## Auth

Cookie-based admin (same 30-day session as all other `/admin/*` pages). Pattern to follow: see `/admin/edit-notes/page.tsx` for the cookie check at the top of the server component.

API routes use `Authorization: Bearer ADMIN_PASSWORD` (same as all other `/api/admin-*` routes). Use `verifyAdminAuth(req)` from `lib/schedule-helpers.ts`.

## Page structure

```
src/app/admin/edit-cards/
    page.tsx                       ← list view (server component)
    EditCardsClient.tsx            ← list view client logic (filters, drag-to-reorder)
    [id]/
        page.tsx                   ← editor view (server component, fetches card)
        EditorClient.tsx           ← editor view client logic (textarea + preview + AI sidebar)
    layout.tsx                     ← optional admin chrome (matches /admin/edit-notes)

src/app/api/admin/cards/
    list/route.ts                  ← GET ?level=AM&topic=Surds&subgroupId=105 → cards[]
    [id]/route.ts                  ← GET / PATCH / DELETE single card
    create/route.ts                ← POST → new card with order_index = max+1 in (level,topic,subgroup_id)
    reorder/route.ts               ← POST {orderedIds: [...]} → rewrites order_index sequentially

src/app/api/edit-cards-ai/route.ts ← clone of edit-notes-ai with card-tuned system prompt
```

## List page (`/admin/edit-cards`)

**Layout (desktop):**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Cards editor                                       + New card      │
├─────────────────────────────────────────────────────────────────────┤
│  Level: [AM ▾]   Topic: [Surds ▾]   Sub-group: [All ▾]              │
│  Filter: [☐ Show unpublished only]                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Surds (11 cards across 4 sub-groups)                               │
│                                                                     │
│  ▸ sg105 · Simplifying surds (3 cards)                              │
│    ⠿  1. Simplify √72                          ✓ Pub    [Edit]      │
│    ⠿  2. Combine √48 + √27                     ✓ Pub    [Edit]      │
│    ⠿  3. Simplify nested surds                 ✓ Pub    [Edit]      │
│                                                                     │
│  ▸ sg106 · Rationalising denominators (2 cards)                     │
│    ...                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Level dropdown → AM / EM / JC / S1 / S2 (sourced from a static list, matches `canonical_topics.json`).
- Topic dropdown → populated from `SELECT DISTINCT topic FROM subgroups WHERE level=$1 ORDER BY topic`. (Don't ship the JSON file — read live from DB so new topics auto-appear.)
- Sub-group dropdown → `SELECT id, name FROM subgroups WHERE level=$1 AND topic=$2`. "All" is the default.
- Cards grouped under their sub-group with a small header showing `sg{id} · {name} ({count} cards)`.
- Each card row shows: drag handle (⠿), order number, `card_title`, pub status pill, Edit button.
- Drag-to-reorder **within a sub-group only** (cross-sub-group drags rejected). Uses `@dnd-kit/core` — the same library `/admin/schedule` already uses.
- "+ New card" opens a small modal: pick sub-group, type title (optional), click Create → POST `/api/admin/cards/create` → redirect to `/admin/edit-cards/[id]`.
- URL state: `?level=AM&topic=Surds&subgroup=105` — selecting filters updates the URL so the page is bookmarkable / shareable.
- Last filter values persisted to `localStorage` (key: `edit_cards_filters`) so refreshes don't reset.

**Empty state per scope:**
- No topic picked: "Pick a level and topic to start editing."
- Picked topic with 0 cards: "No cards yet for Surds. + Create the first one."

## Editor page (`/admin/edit-cards/[id]`)

**Layout (desktop, 3-column ≥1280px; 2-column 1024–1280px with AI sidebar collapsible):**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Surds       sg105 · Simplifying surds · Card 1 of 3               │
│                                                              [Save] [Saved✓]  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Card title                                                                  │
│  [Simplify √72                                                            ]  │
│                                                                              │
│  Sub-group  [Simplifying surds (sg105) ▾]     Order  [1]   ☑ Published      │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────┬──────────────────────────────┐  ┌──────┐  │
│  │  Markdown + LaTeX            │   Live preview               │  │ AI   │  │
│  │                              │                              │  │ side │  │
│  │  **Question:** Simplify √72  │   Question: Simplify √72     │  │      │  │
│  │                              │                              │  │ [..] │  │
│  │  **Step 1.** Factor out      │   Step 1. Factor out the     │  │      │  │
│  │  the largest square:         │   largest square:            │  │      │  │
│  │  $\begin{aligned}            │   √72 = √(36 × 2)            │  │      │  │
│  │  \sqrt{72} &= \sqrt{36       │       = 6√2                  │  │      │  │
│  │  \times 2}\\                 │                              │  │      │  │
│  │  &= 6\sqrt{2}                │                              │  │      │  │
│  │  \end{aligned}$              │                              │  │      │  │
│  │                              │                              │  │      │  │
│  └──────────────────────────────┴──────────────────────────────┘  └──────┘  │
│                                                                              │
│  [Delete card]              Prev card ← →  Next card                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Behaviour:**
- **Card title** — plain text input, top of page.
- **Sub-group dropdown + Order + Published** — secondary controls in a single row. Changing sub-group moves the card; reorder if needed.
- **Markdown textarea** — left half of body. Monospace font (`font-mono`), reasonable padding, line numbers off (KaTeX errors will surface in preview). Tab key inserts 2 spaces, not focus-shift.
- **Live preview** — right half, renders with the same `react-markdown` + `remark-math` + `rehype-katex` pipeline as the swipe app. Use the **same KaTeX config** as `SwipeApp.tsx` (`{ strict: false, trust: true, output: 'htmlAndMathml' }`) so what you see here matches what students see. Re-render is debounced 200ms.
- **AI sidebar** — see next section.
- **Save** — `PATCH /api/admin/cards/[id]` with the diff (title, content, subgroup_id, order_index, is_published). Auto-save on 800ms debounce; button shows `Saving…` → `Saved ✓`. Cmd+S also saves immediately.
- **Prev / Next** — navigate to neighbouring card within the same sub-group, ordered by `order_index`. Wraps at edges.
- **Delete** — confirmation modal ("Delete this card? This cannot be undone.") → `DELETE /api/admin/cards/[id]` → redirect to list.
- **Unsaved-changes guard** — if title/content changed and user hits Back or Prev/Next, prompt "Discard unsaved changes?" (only if NOT auto-saving — if auto-save is succeeding, this never triggers).

**Mobile / tablet:**
- ≥1280px: 3-column (textarea, preview, AI sidebar).
- 1024–1280px: 2-column (textarea + preview) with AI sidebar collapsible behind a button on the top-right.
- <1024px: stacked. Show a banner: "Cards are easier to edit on desktop. You can still preview here but the textarea is read-only." Make the textarea actually `readOnly`.

## AI sidebar (the "vibe code" piece)

**Pattern to copy:** `/admin/edit-notes` already does this for revision notes via `/api/edit-notes-ai`. The card AI should follow the same UX: prompt → SSE stream → diff → accept/reject. Build a sibling endpoint `/api/edit-cards-ai`.

**Sidebar layout:**

```
┌────────────────────────────┐
│  ✨ AI assist              │
├────────────────────────────┤
│  Quick actions             │
│  ┌──────────────────────┐  │
│  │ Make clearer         │  │
│  │ Shorten ~30%         │  │
│  │ Add pitfall note     │  │
│  │ Add common-mistake   │  │
│  │ Add a sanity check   │  │
│  │ Tighten algebra      │  │
│  │ Use a fresh example  │  │
│  │ Add a why-this-works │  │
│  └──────────────────────┘  │
├────────────────────────────┤
│  Or describe a change:     │
│  ┌──────────────────────┐  │
│  │                      │  │
│  │                      │  │
│  └──────────────────────┘  │
│         [Send to AI ▸]     │
├────────────────────────────┤
│  Diff preview              │
│  (appears after AI runs)   │
│                            │
│  [Accept]  [Reject]        │
└────────────────────────────┘
```

**Quick action buttons** (each sends a canned instruction):

| Button | Instruction sent |
|---|---|
| Make clearer | "Rewrite for clarity. Same content, same answer, but cleaner phrasing and tighter step transitions." |
| Shorten ~30% | "Shorten by roughly 30%. Drop filler, keep every algebra step, keep the worked answer." |
| Add pitfall note | "At the end, add a brief 'Common pitfall:' line warning about the most likely student error in this kind of question." |
| Add common-mistake | "Add a short '⚠ Watch out:' aside near the relevant step where students typically slip up." |
| Add a sanity check | "Add a short final 'Check:' step that substitutes the answer back / verifies dimensions / spot-checks the result." |
| Tighten algebra | "Tighten the algebra steps — combine micro-steps that students can do in one line, but keep enough scaffolding that the logic is followable." |
| Use a fresh example | "Same sub-skill, different numbers and surface. Don't reuse the same coefficients/values. Rewrite the whole card with a new example." |
| Add a why-this-works | "Add one sentence at the top explaining *why* this method works, before diving into steps." |

**Free-form prompt** — multi-line textarea. Examples Adrian might type:
- "Split this into two cards — first for the technique, second for an example"
- "Use $\\begin{aligned}` for the steps, current version has inline equations"
- "Make this sound less robotic. More like talking to a friend."
- "The denominator should be $\\sqrt{5} + 1$ not $\\sqrt{5} - 1$. Fix it."

**Endpoint:** `POST /api/edit-cards-ai`

**Request body:**
```ts
{
  instruction: string;          // free-form OR canned (button) text
  currentTitle: string;
  currentContent: string;
  level: string;                // 'AM' etc — for context in prompt
  topic: string;                // canonical name
  subgroupName: string;         // sub-skill name from subgroups.name
  subgroupDescription?: string; // from subgroups.description (helps the AI scope)
  password: string;             // ADMIN_PASSWORD, same as edit-notes-ai
}
```

**System prompt** (use this verbatim — Adrian iterated on this):

```
You are editing ONE swipe-app worked-example card for a Singapore math student.

Cards are bite-sized — typically 120-220 words. They appear one-at-a-time in a TikTok-style vertical swipe interface and render via react-markdown + remark-math + rehype-katex with strict=false, trust=true.

OUTPUT RULES — ABSOLUTELY CRITICAL
- Return ONLY the updated card content body. No preamble, no postamble, no commentary.
- Do NOT include the card_title — that's edited separately.
- Do NOT wrap your output in markdown code fences.
- Do NOT include "Updated card:" or "Here's the rewrite:" or any framing.

FORMATTING CONVENTIONS
- Math: $inline$ for inline, $$display$$ for block.
- Multi-step equations MUST use $\begin{aligned}...\\...\end{aligned}$ so they render left-aligned on the = sign. Each line ends with \\.
- Bold labels: **Question:**, **Step 1.**, **Step 2.**, **Solution:**, **Check:**, **Common pitfall:**, **⚠ Watch out:** — pick whichever fit the card's structure.
- Address the student in second person ("you can simplify...", "you'll notice...").
- Use Singapore syllabus methods and notation. No US-isms.

CONTENT RULES
- Preserve the mathematical correctness exactly unless the instruction explicitly says to fix an error.
- Preserve the worked example's numeric values unless the instruction says to change them.
- Keep the same sub-skill scope — don't drift the card into a different concept.
- If the instruction asks for a fresh example, fully rewrite the card with new numbers/setup but the same sub-skill.

CONTEXT YOU'RE GIVEN
- Level (AM/EM/JC/S1/S2), topic, sub-group name, sub-group description — use these to keep the card scoped.

If the instruction is impossible or self-contradictory, return the current content unchanged.
```

**User message format** (build per request):

```
Level: ${level}
Topic: ${topic}
Sub-group: ${subgroupName}
Sub-group scope: ${subgroupDescription ?? '—'}

Current card title: ${currentTitle}

Current card content:
```
${currentContent}
```

Instruction: ${instruction}
```

**SSE response** — chunk by chunk, exactly like `edit-notes-ai`. Final `{ done: true }` event.

**Diff preview UI:**
- After the stream completes, show side-by-side or unified diff (your call — Adrian prefers unified for cards since they're short).
- Two buttons: `Accept` (replaces textarea content with AI version, doesn't auto-save — Adrian still hits Save) and `Reject` (clears the diff, keeps original).
- Suggest `diff-match-patch` or similar npm lib. Don't overengineer — a simple line-by-line green/red is fine for v1.

**Model:** `claude-opus-4-6` (same as `edit-notes-ai`). Not Sonnet — Adrian wants the highest-quality edits for content that students will see.

**Max tokens:** 4000 (cards are short — 16k is overkill and costs more).

## Routes spec

### `GET /api/admin/cards/list`
Query params: `level`, `topic`, `subgroupId?`, `publishedOnly?`

Returns:
```ts
{
  cards: Array<{
    id: string;
    subgroup_id: number;
    order_index: number;
    card_title: string;
    is_published: boolean;
    content_length: number;     // char count, for the list row
    updated_at: string;
  }>;
  subgroups: Array<{ id: number; name: string; description: string; card_count: number }>;
}
```

### `GET /api/admin/cards/[id]`
Returns the full card row including `content`.

### `PATCH /api/admin/cards/[id]`
Body: any subset of `{ card_title, content, subgroup_id, order_index, is_published }`. Always sets `updated_at = now()`.

### `DELETE /api/admin/cards/[id]`
Hard delete. No soft-delete in v1.

### `POST /api/admin/cards/create`
Body: `{ level, topic, subgroup_id, card_title?, content? }`. Computes `order_index = (SELECT COALESCE(MAX(order_index), 0) + 1 FROM content_snippets WHERE level=$ AND topic=$ AND subgroup_id=$)`. Defaults: `content_kind='worked_example'`, `feature='both'`, `is_published=false`, `source='manual_admin_editor'`.

### `POST /api/admin/cards/reorder`
Body: `{ orderedIds: string[] }`. Rewrites `order_index` 1..N in array order. All ids must belong to the same `(level, topic, subgroup_id)` — server validates and rejects 400 otherwise.

### `POST /api/edit-cards-ai`
SSE stream. See AI sidebar section.

## Visual / UX guidelines

- **Match `/admin/edit-notes` chrome** — same navbar, same back-link pattern, same colour palette (Tailwind `slate` for chrome, `blue-600` for primary action, `red-600` for destructive). Adrian likes the existing admin pages — don't re-skin.
- **Tailwind utility classes only** — no new component library.
- **No emojis on the chrome** — Adrian dislikes emoji-heavy admin UIs. ✨ next to "AI assist" header is the only one.
- **Buttons:** primary = `bg-blue-600 text-white`, secondary = `border border-slate-300`, destructive = `bg-red-600 text-white`.
- **Pills:** `Pub` = `bg-green-100 text-green-800`, `Draft` = `bg-slate-100 text-slate-600`.

## Gotchas & edge cases

- **execute_sql backslash collapsing** is irrelevant here — you're writing through the supabase-js client which handles escaping correctly. But test with content containing `\frac`, `\sqrt`, `\begin{aligned}` to confirm what comes back from `GET /api/admin/cards/[id]` matches what was written.
- **`subgroup_id` belongs to a (level, topic)** — when the user moves a card to a different sub-group, validate the new sub-group is in the same `(level, topic)` server-side. Cross-topic moves are out of scope.
- **`order_index` collisions** are possible if two reorders race. v1: last write wins — don't transaction-wrap, but do recompute server-side from the array order.
- **Cards may have `source_kb_entry_id` set** — if so, show a small "🔗 Linked to KB entry" badge in the editor (read-only — no editing the link in v1). This is for provenance trail when Adrian later sees a card and wants to know which KB entry seeded it.
- **`is_published=false` cards are hidden from students** — but you can still preview them in the editor. The list shows them with a `Draft` pill. The "show unpublished only" filter is for finding drafts.
- **`feature` is always `'both'` in v1** — don't expose this control in the UI yet. Default new cards to `'both'`. Future iteration may add per-card "publish to bot only" toggle.
- **Auto-save throttling:** if the user types fast, debounce 800ms. If they keep typing past the debounce, queue one save, drop the rest. Don't blast PATCH requests.
- **KaTeX render errors** in preview should show inline (KaTeX's own error rendering) — don't catch and hide. Adrian needs to see broken LaTeX as he types.

## Out of scope for v1 (don't build these)

- Multi-card bulk operations (select N cards, AI-rewrite all) — Adrian asked, then decided to skip until v1 ships.
- Image upload to cards — none of his current cards have images.
- Version history / undo across saves — `updated_at` is fine for now.
- `content_kind` other than `worked_example` — schema supports it, but no UI for `refresher`, `formula`, `tricky_part`, `tip`. Add later.
- Mobile editing — read-only on mobile, full editor only on ≥1024px.
- A "preview as student" mode that shows the card in swipe-app chrome — nice-to-have for v2.

## Acceptance criteria (deploy gate)

Before Adrian sees this, you must verify:

1. `/admin/edit-cards` loads, shows correct cards for AM → Surds.
2. Editing card content and saving → reload the page → content persists.
3. Drag-reorder within a sub-group → save persists across reloads.
4. "+ New card" → creates a card → redirects to editor → saving works.
5. Delete card → confirmation modal → deletes → returns to list.
6. AI sidebar quick-action ("Make clearer") on a real card → streams → diff appears → Accept replaces textarea content.
7. Free-form AI prompt works the same way.
8. KaTeX preview correctly renders `$\begin{aligned}\sqrt{72} &= \sqrt{36 \times 2}\\ &= 6\sqrt{2}\end{aligned}$`.
9. Edit a card → swipe app at `/revise/am/surds/worked-examples` shows the new content on next refresh.
10. Cookie auth: opening `/admin/edit-cards` while logged out redirects to `/admin` login.
11. API routes reject calls without `Authorization: Bearer ADMIN_PASSWORD` with 401.
12. Mobile (390px wide): list page is usable, editor shows "open on desktop" notice with read-only preview.

## File-by-file scaffolding

Recommended order to build:

1. `src/app/api/admin/cards/list/route.ts` — get something working end-to-end fastest.
2. `src/app/api/admin/cards/[id]/route.ts` — GET, PATCH, DELETE.
3. `src/app/admin/edit-cards/page.tsx` + `EditCardsClient.tsx` — list view with filters, no drag yet, no create yet.
4. `src/app/admin/edit-cards/[id]/page.tsx` + `EditorClient.tsx` — single-card editor, no AI yet.
5. `src/app/api/admin/cards/create/route.ts` + UI hookup.
6. `src/app/api/admin/cards/reorder/route.ts` + drag UI.
7. `src/app/api/edit-cards-ai/route.ts` — clone `edit-notes-ai`, swap system prompt.
8. AI sidebar UI in `EditorClient.tsx` — quick actions, free-form, diff, accept/reject.
9. Polish: auto-save indicator, unsaved-changes guard, Prev/Next nav, mobile read-only.
10. Run through acceptance criteria.

## When you're done

1. Commit + push to main (Vercel auto-deploys).
2. Tell Adrian: "Editor live at https://www.adrianmathtuition.com/admin/edit-cards. Try editing one of the Surds cards."
3. Update `CLAUDE.md` with a new section under `## Key Pages` and `## API Routes` for the new routes.

That's it. ~1 day of focused work. Ship it.
