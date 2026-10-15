# SPEC — Student Notes Portal (Fumadocs shell)

> Written 2026-08-04 for hand-off to an **Opus 5 session**. Read this whole file,
> then build **Phase 1 only** and stop for Adrian's review. Repo policies
> (auto-push to dev, alias, tests) are in `CLAUDE.md` and apply as usual.

## Goal

Adrian saw docs.unsloth.ai (GitBook) and wants that reading experience for his
students' notes: left sidebar tree, clean typography, search, prev/next,
mobile drawer, dark mode — **inside this Next.js site**, using **Fumadocs**
(fumadocs-ui + fumadocs-core), NOT hosted GitBook.

## Content inventory — verified live 2026-08-04, do not trust older docs

The math Supabase project (`NEXT_PUBLIC_SUPABASE_URL` in `.env.local` — parse
env with `dotenv`, values carry escaped `\n`, see CLAUDE.md env warning):

| Table | Rows | Role |
|---|---|---|
| `content_snippets` | 742 | Worked-example swipe cards. THE content for Phase 1. Organized by `subgroup_id` → `subgroups` (level, topic, name, sort) and `display_group` (student-facing section name, falls back to sub-group name). Markdown + KaTeX. |
| `subgroups` / `sections_meta` | — | The tree structure `/revise` already uses. |
| `topic_cards` | 3 (AM drafts) | 1-page topic summary cards (`content_md`, `status` draft/approved). Render when present. |
| `lesson_concepts` | — | Topic → concept checklists (not rendered in Phase 1). |

⚠ **`lesson_content` NO LONGER EXISTS** (dropped in the 2026-07 learning-units
pivot; PostgREST suggests `lesson_concepts`). Older docs/CLAUDE.md references
are stale. Schema-check any table before coding against it (probe with
`select=*&limit=1` using the service key).

Also existing, for later phases: Dropbox PDF notes (`docs/KIOSK.md`), the
interactive tools at `public/tools/*.html` (`docs/TOOLS.md`).

## Phase 1 — the shell, one level end-to-end (THIS hand-off)

1. **Route: `/notes`** (new). Do NOT touch `/revise` — it stays as-is until
   Adrian decides to retire it.
2. **Fumadocs setup**: check the CURRENT Fumadocs docs (fumadocs.dev) for the
   Next.js App-Router install — do not trust training memory for its API. Our
   content is in Supabase, not MDX files, so use fumadocs-ui's layout
   (`DocsLayout`, page tree, TOC) with a **custom page tree built at request
   time** from `subgroups`/`content_snippets` — not the fumadocs-mdx build-time
   source. If fighting fumadocs-core's source API costs more than an hour,
   fall back to composing fumadocs-ui components around our own tree — the
   UX is the deliverable, not the plumbing.
3. **Tree**: Level (AM first) → Topic → one page per sub-group. Page body =
   that sub-group's snippets in order, sections split by `display_group`,
   each snippet rendered with the SAME markdown+KaTeX renderer the
   worked-examples page uses (find it under `src/app/revise/…/worked-examples/`
   and reuse/extract it — do not write a new KaTeX pipeline).
4. **Topic cards**: if the (level, topic) has a `topic_cards` row, render its
   `content_md` at the top of the topic index page; drafts get a DRAFT badge.
5. **Auth**: behind the ADMIN cookie for now (`ensureAdminSession` client
   pattern, same as `/admin/mark`). Student auth is Phase 3 — do not wire the
   portal login. Because it's admin-only, NO health-check entry yet (policy
   kicks in when it becomes student-facing).
6. **Search**: simple client-side filter over the tree (titles + topic names).
   Full-text search is Phase 2 — don't build it now.
7. **Done when**: `/notes` renders the full AM tree with correct KaTeX on an
   iPad-width viewport, sidebar + TOC + prev/next work, build + 313 tests
   pass, pushed to dev, `adrianmath-dev.vercel.app` re-aliased. Stop and
   report for Adrian's review.

## Phase 2 (LATER — not this hand-off)

All levels; embedded interactive tools (iframe `public/tools/*.html` inline in
matching topic pages); real search; per-page "🖨 print practice at the kiosk"
deep links; quiz components.

## Phase 3 (LATER)

Student login (portal auth), health-check entry, analytics per page, possible
`/revise` retirement.

## Hard rules

- Reuse the existing KaTeX/markdown render path — a second math pipeline is a
  bug factory.
- `content_snippets.display_group` semantics are documented in CLAUDE.md's
  Database section — NULL falls back to sub-group name.
- No new Airtable/Supabase columns in Phase 1.
- One session in this repo at a time — check `git status` + recent pushes
  before starting (parallel-session collisions happened 2026-08-04).

## Skill layout — one topic organised (15 Oct 2026, Adrian: "okay go ahead")

**Where things stand:** ONE sample topic done — **A Math · Quadratic Functions**
(`/notes/am/quadratic-functions`), waiting for Adrian to read it on his phone.
**Do not lay out another topic until he says yes to the sample.** Notes are still
closed to students (`NOTES_OPEN_TO_STUDENTS = false`).

Why: the notes were closed on 29 Aug 2026 because they did not read as one
organised set — headings in internal cluster words ("Coefficient Recovery from
Geometric Conditions"), long descriptions written for the question filer, a
"pitfall" mixed in as an example, examples filed under the wrong skill.

**The fixed order, every skill (= one sub-group), every topic:**
1. **Heading** — the sub-group `name`, in a student's words.
2. **One line** under it — what the skill is (the `skill_idea` row's `card_title`).
   It replaces the sub-group `description` on /notes (that column stays as it is:
   the question filer reads it).
3. **Key idea** box — the formula / rule, one idea a line (`content_kind 'skill_idea'`).
4. **Worked examples**, easiest first (`order_index`). Each one: **Question:** →
   **Solution:** one step a line → a bold **Answer:** line last. An optional
   **Check:** after it. No mark codes, no "Key formula" inside an example (that is
   the Key idea), no ⚠️ inside an example (that is the mistake).
5. **Common mistake** box — what goes wrong, then what to do (`'skill_mistake'`).

Skills are in **learning order** (`subgroups.order_index` 1..n): the basic
technique first, then what builds on it.

**Where it lives.** All in Supabase `content_snippets`, filed by `subgroup_id`;
`display_group` is cleared (NULL falls back to the skill name, so no second set of
headings). `'skill_idea'` / `'skill_mistake'` rows are `feature 'web'` — the /revise
swipe decks read only `worked_example` / `recall_card`, so they never see them.
Reader: `lib/notes-skill.ts` (pure/tested) → `getTopicPage` / `getSubgroupPage`
(`lib/notes-data.ts`) → `SkillIdea` / `SkillMistake` in `app/notes/[[...slug]]/page.tsx`.
Renderer net for topics not yet laid out: an example whose last block is a lone
`$$\boxed{…}$$` shows it as a bold **Answer:** line (`ensureAnswerLine`).

**How to lay out the next topic (after Adrian's yes):**
1. Read the topic's sub-groups and every published example (and its recall cards
   for the key ideas).
2. Write `scripts/notes-layout/topics/<level>-<topic>.mjs` — copy the Quadratic
   Functions file's shape. Every published example must be placed in a skill or
   listed in `unpublish` (the script refuses otherwise). Move a misfiled example
   to the right skill; a skill with no example gets a new one (`key`).
3. Check every answer by computer (`scripts/notes-layout/check-quadratic-functions.py`
   is the pattern; `/usr/bin/python3` has sympy).
4. `node scripts/notes-layout/apply.mjs <name>` (dry run), then `--write` — it saves
   every row it touches to `_backups/notes-layout-<name>-<time>.json` first (the
   rollback) and is safe to re-run.
5. Look at the page at phone width (admin cookie), then tell Adrian.

What the sample changed (Quadratic Functions): 9 skills in learning order; 4
renamed (Word problems: greatest or least value · Finding unknown constants from
the curve · Line of symmetry and reflecting the curve · Sum and product of roots);
the six sum-and-product examples moved out of "finding constants" into their own
skill; the discriminant example moved out of "line meets curve"; 2 new examples
for "finding constants"; the "line meets curve" example now finds the length AB;
the min-value pitfall became skill 1's Common mistake (row unpublished, kept).
