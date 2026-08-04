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
