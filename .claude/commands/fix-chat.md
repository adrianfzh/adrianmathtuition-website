---
description: Diagnose and fix a chat page bug — triages frontend vs backend
---
Fix this chat issue on adrianmathtuition.com: $ARGUMENTS

## Step 1: Is it frontend or backend?

**Frontend (fix here):**
- Page layout/CSS, KaTeX not rendering, image upload broken
- SSE stream not displaying, "Verifying..." stuck, mobile issues

**Backend (needs bot repo fix — the bot repo is at `~/Desktop/adrianmath-telegram-math-bot`; fix it there via its `/fix-bot` command, or output a prompt for it):**
- Wrong AI response, timeout, CORS error, jStat wrong, graph sketching broken

## Step 2: If frontend

1. Read `src/app/chat/page.tsx` — the whole chat UI is this one client component
2. Endpoint: `https://adrianmath-telegram-math-bot.fly.dev/api/chat` (fetch + `res.body.getReader()` streaming, ~line 840)
3. Stream events: `{ chunk }`, `{ verify: true }` (shows "🔄 Verifying..."), `{ done: true }`
4. KaTeX loads via `next/script`; `window.renderMathInElement` must exist before rendering; LaTeX must be valid
5. Image path: file input → base64 → POST body
6. Fix, run the build, commit `fix: <description>`, push (Vercel auto-deploys)
