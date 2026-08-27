---
name: kiosk
description: MANDATORY before touching /kiosk, /api/kiosk/* (pair, print-log, topics, notes, worksheet), /admin/notes, the Dropbox notes/revision/practice/prelim PDF library, or the bot worksheet endpoint /api/bot/worksheet. Routes you to the area runbook before any code is written.
---

# Kiosk & notes library — read the runbook first

**Read [`docs/KIOSK.md`](../../../docs/KIOSK.md) in full before writing or
editing any kiosk/notes code.** That file is the source of truth — this skill
only routes you there and pins the traps:

- **Kiosk students authenticate via signed HMAC token** (`x-kiosk-student`) —
  never a cookie, never the admin path.
- **Worksheet draws must go through `lib/kiosk-pool` + `lib/kiosk-draw`** (the
  deterministic daily draw + eligibility gate). Both the kiosk and
  `/api/bot/worksheet` share it so worked solutions and originating-school
  metadata can never leak. Never hand-roll a question pick.
- Dropbox access uses the refresh-token flow (`DROPBOX_APP_KEY/SECRET/
  REFRESH_TOKEN`); listing routes are `/api/admin-notes` with
  `?level=&kind=notes|revision|practice|prelim`.
