---
description: Diagnose and fix a chat page bug — triages frontend vs backend
---
Fix this chat issue on adrianmathtuition.com: $ARGUMENTS

## Step 1: Is it frontend or backend?

**Frontend (fix here):**
- Page layout/CSS, KaTeX not rendering, image upload broken
- SSE stream not displaying, "Verifying..." stuck, mobile issues

**Backend (needs bot repo fix — output a Claude Code prompt for bot repo instead):**
- Wrong AI response, timeout, CORS error, jStat wrong, graph sketching broken

## Step 2: If frontend
1. Read `chat.html` — find the relevant section
2. SSE events: `{ chunk }`, `{ verify: true }`, `{ done: true }`
3. API endpoint: `https://adrianmath-bot.fly.dev/api/chat`
4. KaTeX CDN must be loaded, LaTeX must be valid
5. Image: `handleFile()` → base64 → POST body
6. Fix, commit `fix: <description>`, push (Vercel auto-deploys)
