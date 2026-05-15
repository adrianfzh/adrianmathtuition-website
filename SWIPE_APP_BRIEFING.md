# Worked-Examples Swipe App — Build Briefing

> **Read this first**, then start. Self-contained spec for the `/revise/[level]/[topic-slug]/worked-examples` route. Designed for one fresh Claude Code session in this repo (~1-2 days of focused work).

## What you're building

A mobile-first, TikTok-style swipe-card page that shows students worked examples for a given math sub-topic. Each card is one worked example with a question + step-by-step solution. Students swipe up/down through cards. KaTeX renders the math.

**Route shape:** `/revise/[level]/[topic-slug]/worked-examples`
- Examples that should work after launch:
  - `/revise/am/trigonometry-r-formula/worked-examples`
  - `/revise/am/differentiation-techniques/worked-examples`
  - `/revise/em/numbers-percentages/worked-examples`

**Why it matters:** the Telegram bot's `/revise` command already sends students this URL when they tap "💡 Worked Examples" on a topic menu (see `~/Desktop/adrianmath-telegram-math-bot/handlers/revise.js`, `topicSlug()`). Right now the page 404s. Students start hitting the bot's worked-examples flow, so this is a real blocker.

## Data source

**Table: `content_snippets`** (Supabase, project `nempslbewxtlikfzachi`)

```
id                  uuid (pk)
content_kind        text   — 'worked_example' | 'refresher' | 'formula' | 'tricky_part' | 'tip'
feature             text   — 'both' | 'bot' | 'web'   (filter to 'both' or 'web')
level               text   — 'AM' | 'EM' | 'JC' | 'S1' | 'S2'
topic               text   — canonical topic name e.g. 'Trigonometry (R-Formula)'
subgroup_id         bigint — references subgroups.id (sub-skill grouping)
order_index         int    — sort within a sub-group, asc
card_title          text   — short heading shown on the card
content             text   — markdown + LaTeX (KaTeX delimiters: $...$ inline, $$...$$ block)
source              text   — provenance: 'kb_promotion' | 'manual' | etc.
source_kb_entry_id  uuid   — fk to kb_entries (provenance trail)
is_published        bool   — only show TRUE
```

**Real data exists for sub-group `611`** (AM Trigonometry (R-Formula), "Right-triangle-in-figure → R-form on a geometric length"). Open the harvesting UI in the QB project to see seed cards: `kb_harvesting_viewer.html` → AM → Trigonometry (R-Formula) → sub-group 611.

**Sample card.content shape (what KaTeX will render):**
```markdown
**Question:** Triangles MOP and MPQ with $\angle MOP = \angle MPQ = 90°$, $\angle OMP = \theta$. Line QR is parallel to PO. $MP = 5$, $PQ = 2$.

**(i) Show** $QR = 2\cos\theta + 5\sin\theta$.

**(ii)** Express $QR$ in the form $R\sin(\theta + \alpha)$ where $R > 0$ and $0° < \alpha < 90°$.

**Solution:**
…
```

## Topic slug mapping (CRITICAL — must match the bot exactly)

Both the bot and this page must convert `'Trigonometry (R-Formula)'` to `'trigonometry-r-formula'` identically. Use the same algorithm:

```ts
// src/lib/topic-slug.ts
export function topicSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
// 'Trigonometry (R-Formula)'           → 'trigonometry-r-formula'
// 'Differentiation (Techniques)'       → 'differentiation-techniques'
// 'Numbers (Percentages)'              → 'numbers-percentages'
```

The bot's source of truth is `~/Desktop/adrianmath-telegram-math-bot/handlers/revise.js` line ~191. Mirror that exactly.

## Page route + structure

```
src/app/revise/[level]/[topic]/worked-examples/page.tsx
src/app/revise/[level]/[topic]/worked-examples/SwipeApp.tsx     (client component)
src/lib/topic-slug.ts
src/lib/supabase-public.ts                                       (if not already exists)
```

The page component is server-side: looks up `(level, topic-slug)`, fetches snippets, passes to a client `SwipeApp` component. Snippets are sorted by `subgroup_id`, then `order_index`.

### Server component sketch

```tsx
// src/app/revise/[level]/[topic]/worked-examples/page.tsx
import { createClient } from '@supabase/supabase-js';
import SwipeApp from './SwipeApp';
import { topicSlug } from '@/lib/topic-slug';

const VALID_LEVELS = ['am', 'em', 'jc', 's1', 's2'];

async function findTopicByslug(level: string, slug: string) {
  // Reverse-lookup: find the canonical topic whose slug matches.
  // Pull all distinct topics for this level from subgroups, slug each, match.
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supa
    .from('subgroups')
    .select('topic')
    .eq('level', level.toUpperCase());
  const topics = [...new Set((data || []).map(r => r.topic))];
  return topics.find(t => topicSlug(t) === slug) || null;
}

export default async function Page({ params }: { params: { level: string; topic: string } }) {
  const levelLower = params.level.toLowerCase();
  if (!VALID_LEVELS.includes(levelLower)) return notFound;

  const canonicalTopic = await findTopicByslug(levelLower, params.topic);
  if (!canonicalTopic) return <NotFoundView level={params.level} slug={params.topic} />;

  const supa = createClient(/* ... */);
  const { data: cards } = await supa
    .from('content_snippets')
    .select('id, subgroup_id, order_index, card_title, content, content_kind')
    .eq('level', levelLower.toUpperCase())
    .eq('topic', canonicalTopic)
    .eq('content_kind', 'worked_example')
    .in('feature', ['both', 'web'])
    .eq('is_published', true)
    .order('subgroup_id', { ascending: true })
    .order('order_index', { ascending: true });

  if (!cards || cards.length === 0) {
    return <EmptyView level={params.level} topic={canonicalTopic} />;
  }

  // Also fetch sub-group names to show as section headers / breadcrumbs
  const sgIds = [...new Set(cards.map(c => c.subgroup_id))];
  const { data: sgs } = await supa
    .from('subgroups')
    .select('id, name, description')
    .in('id', sgIds);
  const sgMap = Object.fromEntries((sgs || []).map(s => [s.id, s]));

  return <SwipeApp cards={cards} subgroups={sgMap} level={params.level} topic={canonicalTopic} />;
}
```

### Client SwipeApp component — UX requirements

- **Mobile-first.** Optimised for vertical phones (~380px wide). Desktop should still be usable but prioritise mobile.
- **One card at a time, full screen.** Card content is centered vertically with comfortable padding.
- **Swipe up = next card. Swipe down = previous card.** On desktop also support arrow keys (↑/↓) and click on visible up/down chevrons.
- **Card stack visual.** Faintly show the next card peeking from below, similar to TikTok's stack feel.
- **Progress indicator.** Bottom of screen: small dots or `3 / 7`. Tap a dot to jump.
- **Sub-group section header** on the first card of each sub-group: small chip showing `📌 {sub-group name}`. Subsequent cards in the same sub-group don't show it.
- **Card title** in display font, slightly smaller than a page title.
- **Card body** uses `react-markdown` + `rehype-katex` + `remark-math`:

```tsx
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

<ReactMarkdown
  remarkPlugins={[remarkMath]}
  rehypePlugins={[rehypeKatex]}
>{card.content}</ReactMarkdown>
```

- **Solutions are inline.** The card markdown contains both the question and the solution. Don't split them — students see the full worked example on one card, scrollable inside the card if it overflows.
- **First-time-user hint.** First card shows a faint "swipe up ↑" hint at the bottom that fades after the first swipe.
- **No login required.** Public-facing. Anonymous students can land here from a Telegram message.

### Empty / not-found views

- **Slug doesn't match a topic:** show "We couldn't find that topic. Try the index" with a link to `/revise`.
- **Topic exists but no worked-examples yet:** show "Worked examples for `{Topic}` are still being written. Coming soon." with a link back to `/revise/[level]`.

## Tech choices

- **Swipe library:** `framer-motion` is already heavy enough to justify itself; use its `motion.div` with `drag="y"` and `dragConstraints` to detect swipes. Threshold of ~80px or velocity > 500 to commit to next/prev. Fall back to keyboard arrows.
- **No state management lib needed** — `useState` + `useRef` is enough.
- **No localStorage.** v1 doesn't remember position (Anonymous users; bot link goes straight to topic).

## Don't do (out of scope for v1)

- ❌ Login / progress tracking
- ❌ "Save card" / favourites
- ❌ Sharing / deep links to a specific card
- ❌ Comments or feedback
- ❌ Multi-content-kind cards (refresher/tip etc.) — only `worked_example` for v1
- ❌ Search within the page
- ❌ Loading next topic when current finishes — just show a "↩ Back to {Topic}" CTA on the last card

## Env vars expected

Already in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` (= `https://nempslbewxtlikfzachi.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

If `NEXT_PUBLIC_SUPABASE_ANON_KEY` isn't set yet for public-anon reads, add it from the Supabase dashboard. The anon key is safe to expose.

## Test data — what to use during build

Sub-group `611` (AM Trigonometry (R-Formula), "R-form on a geometric length") has 7 worked-example cards. Use this URL for dev:

```
http://localhost:3000/revise/am/trigonometry-r-formula/worked-examples
```

You should see 7 cards swipe-able. If you see 0 cards, check:
1. The Supabase env vars are loaded
2. `topicSlug('Trigonometry (R-Formula)')` returns `'trigonometry-r-formula'`
3. The query filters `feature in ('both','web')` and `is_published = true`

## Once it works for sub-group 611

The harvesting UI (`AdrianMath/kb_harvesting_viewer.html`) is what populates `content_snippets` for other sub-groups. Adrian will use that to seed more topics. The page should automatically pick them up — no code change needed per topic.

## Sync after build

When this lands, update `~/Desktop/adrianmathtuition-website/CLAUDE.md` "Key Pages" section with:

```
- `revise/[level]/[topic]/worked-examples/page.tsx` — TikTok-style swipe cards over content_snippets
```

And add a note in the bot project's CLAUDE.md confirming the URL pattern is now live so future sessions know `/revise` worked-examples links don't 404 anymore.

## File checklist for this build

- [ ] `src/lib/topic-slug.ts` — `topicSlug()` exported
- [ ] `src/lib/topic-slug.test.ts` — at least 5 unit tests covering parens, slashes, multiple spaces, leading/trailing dashes
- [ ] `src/app/revise/[level]/[topic]/worked-examples/page.tsx` — server component fetcher
- [ ] `src/app/revise/[level]/[topic]/worked-examples/SwipeApp.tsx` — client swipe UI
- [ ] `package.json` — add `framer-motion`, `react-markdown`, `remark-math`, `rehype-katex`, `katex` if not present
- [ ] Test against sub-group 611 manually on mobile viewport (Chrome DevTools 380px width)

## Optional polish (after MVP works)

- **Per-sub-group "section card"** between sub-groups: a thin transition card showing `Up next: {next sub-group name}` with a small description.
- **Tap-to-reveal solution** if the card stem is short (delays the answer until tap). Default: show the full card.
- **Direction arrows on desktop.** Visible chevrons at top/bottom centre.
- **Reduce-motion accessibility:** if `prefers-reduced-motion: reduce`, fall back to instant card swap (no slide animation).
