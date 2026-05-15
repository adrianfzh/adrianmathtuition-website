# Swipe App — Polish Pass

> Follow-up to the initial swipe app build. The route is live at `/revise/am/quadratic-functions/worked-examples` but two things need fixing before it ships to students.

## Problem 1 — Swipe doesn't feel like TikTok

Right now the card transitions don't behave like a real swipe stack. Students expect TikTok/Reels-style behaviour:

- **One card fills the entire mobile viewport** (no visible adjacent cards, no scroll bar)
- **Swipe up** → current card slides up off-screen, next card slides up from below to fill the screen, smooth spring animation
- **Swipe down** → reverse: current slides down, previous slides in from above
- **Snap to card boundaries** — never settle in a partial scroll position
- **Page body must NOT scroll** — the gesture is the navigation
- **Velocity-based commit** — a quick flick (high velocity, short distance) should advance just like a slow drag (low velocity, long distance). Use framer-motion's `info.velocity.y` and `info.offset.y` together: commit if `Math.abs(offset) > 100 || Math.abs(velocity) > 500`.
- **Snap-back** — if the user drags but doesn't cross the threshold, the card animates back to centre (don't leave it half-off-screen).

### Implementation

Use framer-motion's `motion.div` with `drag="y"` constrained to vertical, `dragConstraints={{ top: 0, bottom: 0 }}`, `dragElastic={0.2}`. On `onDragEnd`, decide commit vs snap-back based on offset+velocity.

Each card render uses `<motion.div>` with `initial={{ y: enterFromBelow ? '100%' : '-100%' }}`, `animate={{ y: 0 }}`, `exit={{ y: exitToTop ? '-100%' : '100%' }}`, `transition={{ type: 'spring', stiffness: 300, damping: 30 }}`. Use `AnimatePresence` with `mode="popLayout"` or `mode="wait"` to handle enter/exit.

Set `body { overflow: hidden; touch-action: none }` (or scope to the swipe container) so the page doesn't scroll while the user drags. Re-enable scrolling inside the card if its content overflows (rare — most cards fit one screen).

### Acceptance test

On Chrome DevTools mobile view (380px width):
- Open `/revise/am/quadratic-functions/worked-examples`
- Swipe up — next card animates in from below smoothly
- Swipe down — previous card returns from above
- Quick flick advances same as slow drag
- Half-drag snaps back to current card
- No body scrollbar at any point
- Arrow keys (↑/↓) work as desktop fallback

## Problem 2 — Mobile typography is cramped and hard to read

Compare the live swipe app to the standalone demo at `~/Documents/Claude/Projects/AdrianMath/QF_worked_examples_demo.html` — the demo's spacing and typography is far more readable. Mirror that quality on the swipe app.

### Specific changes

**Layout / spacing:**
- Card content has generous padding: at least `24px` left/right, `32px` top/bottom on mobile
- Card content max-width: `min(92vw, 600px)` so text never reaches screen edges
- Vertical centering: card content is centred in the viewport (use flex with `justify-content: center` on the swipe container)
- Card title and body have clear visual gap (~16px between heading and first paragraph)

**Typography:**
- Body text: `16px` minimum (currently looks 14px or smaller). On mobile especially, smaller than 16 hurts.
- Line-height: `1.65` for body paragraphs (currently looks ~1.4)
- Card title: `20-22px`, font-weight 600, color slightly darker than body
- Bold text in body uses `font-weight: 700`, slightly darker color than regular body text
- Sub-skill chip (`📌 ...`) at top: small, soft background colour, padding around it

**Math (KaTeX):**
- Display equations (`$$...$$`) should have visible top/bottom margin (~12px each side)
- Inline equations (`$...$`) should size at `1em` (matching body text), never smaller
- Avoid horizontal scroll on display equations — use `overflow-x: auto` on `.katex-display` containers but only as a fallback; cards should be sized so most equations fit

**Background / colours:**
- Card background: `#FFFFFF` or warm off-white `#FFFCF7`
- Page background behind the card: subtle warm cream `#F5EFE2` (matches your tuition site's brand)
- Body text: `#2C2C2C` (not pure black — softer)
- Sub-skill chip background: `#EAF2F8` with text `#2980B9` (matches the harvesting UI's chip style)
- Card title: `#2C3E50`

**Visual hierarchy:**
- Top of card: small sub-skill chip (e.g. `📌 Vertex Form & Turning Point`) — only on the FIRST card of each new sub-skill, omit otherwise
- Below: card title (one line if possible)
- Below: card body
- Bottom of card: progress indicator (`3 / 22` or dots), small, low contrast

**Use the standalone demo as the reference.** Open it side-by-side with the swipe app on the same mobile viewport. The visual quality should match.

### Acceptance test

- Mobile viewport (380px) — text is comfortable to read at arm's length
- A typical card (e.g. Card 13 "Find α² + β² using identity") fits one screen without internal scroll
- KaTeX renders crisp, not cramped against card edges
- Background colour is warm cream, not stark white
- Sub-skill chip appears on first card of each sub-skill section, missing on subsequent
- Compare with `QF_worked_examples_demo.html` — quality should match or exceed

## Reference: the standalone demo

`~/Documents/Claude/Projects/AdrianMath/QF_worked_examples_demo.html`

This is the visual quality bar. Open it on your phone and on your laptop, compare to the live swipe app, and close the gap. The demo is a vertical scroll, not swipe — but the typography, spacing, colour palette, and card structure are exactly what we want on the swipe app.

## Out of scope (don't add)

- Don't add interactivity inside cards (no buttons, no taps)
- Don't add pull-to-refresh
- Don't add social actions (like, share)
- Don't add login or progress tracking
- Don't add a "back to topic" button (browser back works)
- Keep the desktop experience as a vertical scroll list (the responsive split we discussed earlier) — these polish changes apply to mobile only

## Problem 3 — Swipe-down triggers browser pull-to-refresh

When the user swipes DOWN to go to the previous card, mobile Safari/Chrome interprets it as pull-to-refresh and reloads the page instead. This breaks the previous-card gesture entirely.

**Fix:**

```css
/* On the swipe container or body */
html, body {
  overscroll-behavior-y: contain;  /* blocks pull-to-refresh */
  overscroll-behavior-x: contain;
}

.swipe-container {
  touch-action: none;              /* page doesn't scroll, gesture handler takes over */
  overscroll-behavior: none;
}
```

Apply `overscroll-behavior-y: contain` (or `none`) on the html/body element. This prevents the browser from interpreting the downward gesture as a refresh trigger.

Also confirm `touch-action: none` is set on the actual draggable card element (or its parent) so Safari doesn't intercept the touch.

**Test:** swipe down from card 3 — should go to card 2, NOT trigger a page reload.

## Problem 4 — Multi-step equations render as one running line

When LaTeX contains chains like `y = ... = ... = ...`, the swipe app currently renders them on a single line that wraps unpredictably. Cards 2, 3, 5, 6, 7, 8, 13, 16, 20 all have this issue.

The CONTENT side fix (using `\begin{aligned}` with `&=` markers) is being applied to the database directly. Your job: confirm the swipe app's KaTeX renders `\begin{aligned}...\end{aligned}` blocks correctly inside `$$...$$` display math.

KaTeX supports `aligned` natively. If it doesn't render properly, check that `auto-render`'s delimiter list includes `$$` for display mode AND `trust: true` is set (or that the KaTeX version is recent enough — 0.16+).

**Test card after content update:** Card 3 "Sketch from completed square form" should show the equation chain as three left-aligned lines with `=` signs vertically aligned, not one wrapping line.

## Problem 5 — Add an "Ask" button (inline chat, no overlay)

Students reading worked examples will have follow-up questions ("why factor out 2?", "what if a was negative?", "how do I know which identity to use?"). Add a small chat button so they can ask without leaving the swipe app.

### UX spec — INLINE pattern (NOT a modal overlay)

The button must NEVER cover the card with a panel that obscures it. Use a transformer pattern: the button morphs into a thin input bar at the bottom, and AI responses appear in a small scrollable strip ABOVE the input but BELOW the bottom of the card.

**Initial state — cute mascot pill button:**
- Fixed position, bottom-right of viewport
- **Pill shape** (rounded oval), ~106-122px wide × **48px tall** (10% taller than the previous 44px spec)
- Border-radius: `24px` (full pill, matching the new height)
- Background: warm orange `#E67E22` or your tuition brand colour
- Content: mascot icon + "Ask" text, with playful styling
- Safe-area padding: `bottom: max(16px, env(safe-area-inset-bottom) + 10px); right: max(16px, env(safe-area-inset-right) + 12px)`
- Shadow: `0 4px 14px rgba(230,126,34,0.35)` (warm-tinted, not grey)

**Mascot — use 🤖 robot emoji.**

Renders consistently as a friendly square robot face with antenna across iOS, Android, and modern browsers. Cute, on-tone for an AI tutor (literally a robot), and instantly recognisable. Replace with a proper SVG mascot in v2 if you want an Adrian-branded character later.

Other options if you want to swap later: 🤓 nerd face, 👾 alien monster (retro game vibe), or a custom SVG. For v1 ship with 🤖.

**Subtle character touch:**
- On idle, the mascot has a faint wiggle every ~6 seconds (small rotation: -3deg → +3deg → 0, 400ms total). Adds personality without being annoying.
- Pause the wiggle once the user has interacted with the button at least once (don't keep nagging).

**Replace any earlier mention of `🦉 Ask` in this brief — final mascot is `🤖 Ask`.**

**On tap → fast morph into bottom input bar:**
- The pill button animates from its corner position into a full-width bar at the bottom
- **Animation: ~180ms ease-out for expansion** (snappy, not slow). Use framer-motion `layout` prop OR explicit `width` + `x` + `y` animation with `transition={{ type: 'spring', stiffness: 400, damping: 35 }}` for natural physics
- Mascot icon stays on the LEFT of the bar (acts as a brand anchor — visual continuity with the button it morphed from)
- During the morph: "Ask" label fades out (60ms), input placeholder "Type your question…" fades in (60ms, slight delay)
- Final state: `[ 🤖 ][ Type your question…              ][ Send → ][ ✕ ]` — mascot left, input centre, send icon, close X far right
- **Bar shape: rounded rectangle**, border-radius `24px` (matches the pill's roundness)
- **Bar height: 62px** (10% taller than the previous 56px) — still does NOT cover the card
- Input field auto-focuses, keyboard pops up
- When keyboard is open, the bar stays glued to just above the keyboard (`bottom: env(keyboard-inset-height, 0)` or use visual-viewport API)

**On ✕ → fast morph back into pill button:**
- **Animation: ~150ms ease-in** (even faster than the open — closing should feel decisive)
- Bar contracts back to pill width, slides back to corner
- Input/send/✕ fade out (40ms), "Ask" label fades in (40ms with delay)
- Mascot stays visible throughout the entire morph (anchor)
- After morph completes, conversation strip (if any) is dismissed too

**Speed targets:**
- Open: 180ms total perceived motion
- Close: 150ms total
- No "lag" before the animation starts — tap → motion begins within 16ms (one frame)
- Use `will-change: transform, width` on the morphing element to give the browser a hint
- Avoid `useState` re-renders during the animation — use refs + `useAnimation` controls if needed

**On send → response area appears ABOVE the input bar:**
- A scrollable strip slides into view between the card and the input bar
- **Max height: 35% of viewport** (≈ 280px on a typical phone). This is the absolute cap — don't grow beyond this.
- Background: subtle warm cream so it's distinct from the card
- Shows the user's question (right-aligned bubble) and AI response (left-aligned, with KaTeX)
- Auto-scrolls to bottom as response streams in
- The card above is REDUCED in height to accommodate (card stays fully visible, just shorter)
- If response is long, the strip stays at max-height and scrolls internally

**Multiple Q&A turns:**
- Stay in the conversation strip — older messages scroll up
- Conversation persists while the user is on the same card
- Closing (tap ✕) discards the conversation and resets to pill button
- Swiping to a new card resets the conversation (each card = fresh chat context)

### Wire to existing /api/chat (Fly.io bot)

The bot's chat endpoint exists at `https://adrianmath-telegram-math-bot.fly.dev/api/chat` and streams via SSE (already used by the website's `/chat` page).

When the user sends a message, POST to that endpoint with:
```json
{
  "message": "<user's question>",
  "context": "Student is reading the worked example titled '<card_title>'. The card content was:\n\n<card.content>\n\nThe student is asking the question above in the context of this worked example.",
  "level": "AM"   // pass the level from the URL params so the bot uses the right system prompt
}
```

Stream the response chunks into the response strip as they arrive (SSE).

If the bot's `/api/chat` doesn't accept a `context` field today, that's the only backend change needed: in `handlers/webchat.js`, prepend `context` to the prompt if present. Claude Code should add that as part of this build.

### Wire to existing /api/chat (Fly.io bot)

The bot's chat endpoint exists at `https://adrianmath-telegram-math-bot.fly.dev/api/chat` and streams via SSE (already used by the website's `/chat` page).

When the user sends a message, POST to that endpoint with:
```json
{
  "message": "<user's question>",
  "context": "Student is reading the worked example titled '<card_title>'. The card content was:\n\n<card.content>\n\nThe student is asking the question above in the context of this worked example.",
  "level": "AM"   // pass the level from the URL params so the bot uses the right system prompt
}
```

Stream the response chunks into the message thread as they arrive (Server-Sent Events).

If the bot's `/api/chat` doesn't accept a `context` field today, that's the only backend change needed: in `handlers/webchat.js`, prepend `context` to the prompt if present. Claude Code should add that as part of this build.

### Persistence (v1: none)

- No login required
- No conversation history saved
- Each card open = fresh chat (or the panel state persists in-session until the user navigates away)
- Don't try to track which questions students ask — that's a v2 feature when you have the Student Portal

### Why this matters

- Lowers friction from "I'm stuck" → "I got an answer"
- Doesn't require students to switch app to Telegram
- The bot's per-level system prompts (AM/EM/JC) handle level-appropriate explanations automatically
- Ties the swipe app to your AI tutoring layer end-to-end

### Out of scope

- No voice input (v2)
- No image upload (v2 — let students photograph their working)
- No "save this answer" — students can screenshot
- No per-student conversation history — Student Portal will handle that later

### Acceptance test

1. Open the swipe app on mobile, see the chat FAB at bottom-right
2. Tap it — panel slides up smoothly, takes ~75% height
3. Type a question about the current card → response streams in with KaTeX rendering
4. Swipe the panel down → it slides away
5. Swipe to a different card → tap FAB → new chat panel, fresh context (the new card's content)

## Problem 6 — `\begin{aligned}` blocks render as raw LaTeX text

After the database content was updated to use `$$\begin{aligned} … \end{aligned}$$` for multi-step equations, the swipe app shows the raw LaTeX as plain text (`y &= 2\left[x^2 - 5x + …`) instead of rendering as math. This is a markdown-pipeline issue, NOT a content issue.

The card content is correct — verify by querying:
```sql
SELECT content FROM content_snippets 
WHERE subgroup_id = 823 AND order_index = 2;
```

### Likely root causes

1. **`react-markdown`'s default block parser doesn't recognise `$$` followed immediately by content** as block-level math. The `$$` markers may need to be on their own lines with blank lines around them. Confirm `remarkMath` is configured with `singleDollarTextMath: true` AND that the math plugin order is `[remarkMath, ...]` BEFORE rehype-katex.
2. **Markdown is escaping `\\` (the LaTeX line break) to `\`**, breaking the aligned environment. Inside `$$...$$`, content should be passed verbatim to KaTeX, but if the math plugin isn't intercepting properly, the markdown parser eats the backslashes first.
3. **KaTeX's `aligned` environment requires `trust: true`** in the rehype-katex config, OR the macro must be explicitly enabled.

### Fix steps

In whatever component renders the card body (probably `SwipeApp.tsx`):

```tsx
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

<ReactMarkdown
  remarkPlugins={[remarkMath, remarkGfm]}
  rehypePlugins={[[rehypeKatex, { 
    strict: false,           // tolerate aligned, gather, etc.
    trust: true,             // required for some environments
    throwOnError: false,
    output: 'htmlAndMathml',
    macros: {
      '\\tfrac': '\\frac',   // in case some KaTeX builds don't have \tfrac
    },
  }]]}
>
  {card.content}
</ReactMarkdown>
```

### Verify the fix

Visit card 2 ("Complete the square (a ≠ 1)") on the live URL after deploying. The Solution should show three properly-rendered display equations:

```
y = 2(x² - 5x) - 18

       y = 2[x² - 5x + 25/4 - 25/4] - 18
         = 2[(x - 5/2)² - 25/4] - 18

       y = 2(x - 5/2)² - 25/2 - 18
         = 2(x - 5/2)² - 61/2
```

— with proper math formatting (italic variables, real fraction bars, vertically aligned `=`), NOT the raw `\begin{aligned}` text.

Test cards: 823 #2, #3 · 824 #1, #2 · 825 #1, #2 · 826 #1 · 828 #2, #5 · 830 #1.

### Fallback if `aligned` truly can't be made to work

If after trying the above the `aligned` environment still won't render, fall back to multiple separate `$$...$$` blocks (one equation per block). This loses `=` alignment but guarantees rendering. Tell me before doing this — I'd rather make `aligned` work because the visual quality is much better.

## Problem 7 — Page indicator dots: scrollable + tappable

The dot strip between the up/down chevrons currently shows ~6 dots and isn't interactive. With 22 cards in the topic, students need:
1. **A way to see all 22 dots** — horizontally scrollable strip
2. **A way to jump to any card** — tap a dot to navigate
3. **Visual indication of where they are** — current dot is bigger/filled

### UX spec

**Layout:**
- Horizontal strip between the up (▲) and down (▼) chevrons
- Container: `display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 8px; padding: 0 12px;`
- Dots: `width: 8px; height: 8px; border-radius: 50%; background: rgba(0,0,0,0.2); flex-shrink: 0;`
- Active dot: `width: 12px; height: 12px; background: #E67E22` (your brand orange)
- Hide scrollbar visually (`scrollbar-width: none; -webkit-scrollbar { display: none }`) — looks cleaner

**Auto-centring:**
- When the user swipes to a new card, the dot strip auto-scrolls so the active dot is centred in view (`element.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })`)
- This way the current dot is always visible no matter how many cards exist

**Tap to jump:**
- Each dot has `onClick={() => goToCard(index)}`
- Smooth animation when jumping (use the existing card transition, but trigger via index change rather than swipe)
- After jump completes, the dot strip re-centres on the new active dot

**Sub-group section breaks:**
- Add a thin vertical separator (1px tall × 12px height, light grey) between dots that belong to different sub-groups
- This helps students see chunking: "these 4 dots are Vertex Form, then a separator, then 2 dots for Real-World Modelling, etc."
- Simple to compute: walk through `cards`, insert a `<span class="sg-divider"/>` between consecutive cards where `cards[i].subgroup_id !== cards[i-1].subgroup_id`

### Touch / hit-target

- Dots are visually 8×8px but tap target should be 24×24px (Apple HIG / Material both recommend 44px ideally, but 24 is acceptable for inline indicators when adjacent dots are 8px apart). Wrap each dot in a `<button>` with `padding: 8px 4px; background: transparent; border: 0;` to extend the hit area without changing visual size.

### Spacing between down chevron (▼) and Ask button

The down chevron currently sits too close to the Ask button — looks visually cramped. Increase the gap between them: add `margin-right: 16px` to the chevron group (or `gap: 16px` on the parent flex container holding `[chevrons + dots]` and `[Ask button]`). Both elements should breathe independently — the eye should clearly see them as two separate clusters.

### Optional polish (nice-to-have)

- **Long-press preview:** holding a dot for 400ms shows a small tooltip with the card title (`Card 7: Show always positive`). Helps students locate specific topics. Skip for v1 if it adds complexity.

### Acceptance test

1. Open swipe app on mobile, see dots strip between chevrons
2. With 22 cards, dots overflow horizontally — strip scrolls, current dot is centred
3. Tap a dot 3 positions to the right → app jumps to that card with smooth animation, dot strip re-centres
4. Sub-group boundaries visible as thin vertical separators between dot groups
5. Hit target generous enough to tap reliably with thumb

## Problem 8 — iOS Safari auto-zooms when typing in the Ask input

When the user taps the input field to type a question, iOS Safari zooms in slightly. The card content above appears too large and clipped. Safari does this automatically when an input element has `font-size < 16px`, and it doesn't zoom back out gracefully.

**Fix:**

Set the chat input's font-size to **at least 16px**:

```css
.ask-input,
input[type="text"].chat-input,
textarea.chat-input {
  font-size: 16px;     /* prevents iOS zoom-on-focus */
  line-height: 1.4;
}
```

If 16px feels too large for your design, you can also set `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` to globally prevent zoom, but the per-input font-size approach is gentler (still allows pinch-zoom on the page itself if the user wants it).

**Acceptance test:** open swipe app on iPhone, tap the Ask input, type a character — page should NOT zoom in. The card should remain at the same size it was before tapping.

## Problem 9 — Bot answers don't use the card's technique

When a student asks a question while reading a card, the bot should answer **using the technique demonstrated on the card first**, then optionally mention alternative methods.

Example failure observed: student on Card 1 ("Complete the square (a = 1)") asked "How to find minimum?" The bot answered with calculus (`dy/dx = 0`) — which is correct AM material but NOT the technique on this card. The card teaches "complete the square → vertex form `a(x - h)² + k` → read minimum point as `(h, k)`." That's what the bot should have led with.

Two possible root causes — Claude Code should diagnose and fix both:

### (a) Verify the card content is being sent as `context`

In the swipe app's chat send handler, log the request payload before posting. The POST to `https://adrianmath-telegram-math-bot.fly.dev/api/chat` should include:

```json
{
  "message": "How to find minimum?",
  "context": "Student is reading the worked example titled 'Complete the square (a = 1)'. The card content was:\n\n**Question:** Express y = x² - 4x in the form a(x - h)² + k...\n[full card content]\n\nThe student is asking the question above in the context of this worked example.",
  "level": "AM"
}
```

If `context` is empty or missing, fix the swipe app's chat send code to include the current card's `card_title` and `content` fields.

### (b) Verify the bot uses the context to scope its answer

In `~/Desktop/adrianmath-telegram-math-bot/handlers/webchat.js`, the `/api/chat` handler needs to:

1. Read the incoming `context` field from the request body
2. If present, **prepend** an instruction to the system prompt or wrap the user message with explicit guidance like:

```
You are helping a student who is currently reading a specific worked example. 
The card content is:
---
{context}
---

The student's question: {message}

CRITICAL: Answer using the technique demonstrated in the card FIRST. If the card 
shows completing the square, lead with that approach. Only mention alternative 
techniques (e.g. calculus, factorisation) AFTER you've explained the card's 
method, and only if relevant. Do NOT default to your general curriculum knowledge 
when the card has a specific approach the student is trying to learn.
```

3. The instruction must be in the actual system message sent to Claude/Sonnet, not just appended to the user content. Otherwise it gets ignored amongst the conversation flow.

### Acceptance test

1. Open Card 1 ("Complete the square (a = 1)") on the swipe app
2. Tap Ask, type "How do I find the minimum point?"
3. Bot should respond by first explaining the **completing-the-square method shown on the card** (e.g. "From the card, you've already converted y = x² - 4x to y = (x-2)² - 4. The minimum is at (h, k) = (2, -4) — read directly from the vertex form a(x-h)² + k.")
4. Optionally: "Alternative methods: you can also use calculus (dy/dx = 0) or symmetry (axis of symmetry at x = -b/2a). For this AM topic, completing the square is the expected method."
5. Repeat on Card 14 ("Find α³ + β³ using identity") with question "How do I compute α³ + β³?" — bot should lead with the identity `(α+β)³ - 3αβ(α+β)` from the card, NOT with "expand by hand" or "solve for α and β individually."

## Once it works

Commit + push. Vercel auto-deploys. Then I'll test on my phone.
