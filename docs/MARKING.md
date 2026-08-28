# AI Marking — detailed docs

> Split out of `CLAUDE.md` on 2026-08-04. **MANDATORY reading before touching
> `/admin/mark-paper`, `/admin/mark` (batch), any `mark-paper-*`/`mark-batch/*`
> route, `render-marking`, the annotate overlay, or the bot's marking pipeline
> touchpoints.** Nearly every paragraph here is a fixed bug — treat it as a
> contract. Root policies: [`../CLAUDE.md`](../CLAUDE.md).

## /admin/mark-paper — the marking page in use

Upload the student's working (+ optionally the question paper PDF) → `/api/admin/mark-paper`, a thin proxy to the Fly bot, where the model and all marking logic live (`ai/paper-marker.js` — Opus 5 since 2026-07-28; the page's dropdown is only a label). **Working may be photos OR a scanned PDF** — see below. **Teacher's red pen is the default mark style on every surface** — the bot safelists `style` and falls through to `'teacher'`, a Telegram photo needs a `classic` caption to opt back into pill badges, and this page initialises to `'teacher'`. A new marking surface that defaults to `'classic'` makes the same paper come back looking like a different product.

- **Both PDFs build AUTOMATICALLY after marking (2026-08-19)** — `applyMarkResponse` calls `generateBoth(...)` with the marking handed over *directly* (state set in the same tick isn't readable yet), so marking a paper and having the marked copy is one action. ⚡ Generate both stays, as the rebuild button (e.g. after ✏️ Annotate). Not awaited: a paper that marked fine must never report a PDF problem as a marking failure.
- **"PDF generation — images: Failed to fetch · full: Failed to fetch" (fixed 2026-08-19)** — was never the server. Both builds returned 200 (images 21s, full **110s** on Isabelle's 30-question prelim); the browser was giving up on a connection held open that long, which a backgrounded tab or the iPad's other Split View pane is enough to cause, and `phase:'link-pdf'` fired CLIENT-side *after* the response — so a dropped connection threw away a PDF already built and uploaded, with `pdf_url` and `photos_pdf_url` both left empty on the run. Three changes, in order of what actually matters:
  1. **`/api/admin/mark-paper-pdf` links its own output** (`runId` in the body → Supabase `paper_marking_runs`, direct, before responding). Work can no longer be lost. Column mapping is `lib/marked-pdf-column.ts`, shared and unit-tested — sending the images copy to `pdf_url` would silently overwrite the full marked script and nothing would look wrong until Adrian opened it in front of a parent. The bot's `linkPdf` is the other writer; keep them in step.
  2. **The page recovers instead of failing**: `buildPdf` reads the run's URL for that half *before* starting (so a recovered link can't be last build's copy), and on a NETWORK failure polls the run for up to 4 min. An *answered* error (`err.answered = true`) still fails fast — waiting for a 500 would be waiting forever.
  3. **Speed, which shrinks the window**: the two halves now run at once, and each question's typeset sheet renders 4-at-a-time in the route (`RENDER_CONCURRENCY`, `p-limit`) — it's nearly all waiting on fonts + KaTeX over `networkidle0`, not CPU. Measured on the same 30-question run: **131s sequential → 17s warm / 70s cold.** `vercel.json` gives the route `memory: 3008` for the extra tabs.
- **PDF buttons (2026-07-30): ⚡ Generate both** starts images and full TOGETHER (was sequential until 2026-08-19) — the 🖼 link is clickable the moment it exists, in seconds, while 📄 still typesets; halves fail independently. `marked` is a labelled LIST (run history re-offers BOTH stored PDFs). **📤 send/save row** under the buttons (the "no amendments needed" fast path): `⬇ Download for WhatsApp` streams the PDF via `/api/admin/mark-paper-download` with a clean filename (Adrian drags it from Downloads into his PERSONAL WhatsApp on the Mac — bot-sent WhatsApp is deliberately NOT built, the business number's 24h window makes it unreliable); `✉️ Email PDF` posts `/api/admin/mark-paper-send` (Resend, same suppression-check-after-send guard as invoices, sender `marking@adrianmathtuition.com`) with a student picker + address prefill (GET `?studentId=`) and a "remember" checkbox that PATCHes **`Student Email`** (typecast) — **that field doesn't exist yet** (metadata create 403'd; Adrian must add it, type email, to Students) and the route degrades to `emailSaved:false` + hint until he does. Both routes gate URLs through `isOurBlobUrl()` (`lib/blob-url.ts`, unit-tested) so they can't be used as an authenticated open proxy.
- **Filename = `Student — Paper name — 30 Jul 2026.pdf`** (2026-07-30): an editable "Paper name" input in the send row feeds the filename AND the email subject; the run's auto `worksheet (N photos)` label never reaches either (*"worksheet — 86-94 does not seem helpful"*), and the score is filename-free (it's on the PDF's total strip). **History-row suffixes (2026-08-10):** 🖼 Images ↗ downloads under the BARE name — no "images" in it (Adrian: *"remove images from it"* — it's the copy he hands out); 📄 PDF ↗ carries `— full —` so the two stay distinguishable in Downloads; ✍️ keeps `— annotated —`. Same split the bot's queue delivery already used (`name.pdf` / `name (full).pdf`; since 2026-08-13 the queue's files are `Student — name.pdf` when the run is student-tagged — see the queue bullet below).
- **Notability round trip (option B, 2026-07-30):** `✍️ Upload annotated` (or drag the PDF anywhere onto the send panel — iPad Split View drag from Notability works) uploads via `/api/admin/mark-paper-annotated-token` client tokens (Notability exports run 5–20MB, past the body cap), then links to the run via `phase:'link-pdf', kind:'annotated'` → `paper_marking_runs.annotated_pdf_url` (column added 2026-07-30; the bot's `linkPdf`/load/stats carry it). **Send-row preference: ✍️ annotated > 🖼 images > first** — once Adrian's pen is on a copy, that copy IS the paper. History rows show `✍️ Annotated ↗`.
- **Option A (in-browser Pencil annotation) is spec'd AND built** — see [`../SPEC-ANNOTATE.md`](../SPEC-ANNOTATE.md) and the ✏️ Annotate section at the bottom of this file.
- **iPad share-sheet inbox** (2026-07-31): iPadOS keeps websites out of the share sheet and WhatsApp's iPad app can't drag documents out, so a **Shortcut** ("✍️ Mark paper", recipe rendered in a one-time-setup `<details>` on the page) POSTs the shared PDF/photo with **`MARK_INBOX_TOKEN`** (dedicated Bearer token, minted 2026-07-31, scoped to inbox-upload only — the share-sheet automation never holds the admin password; page calls ride the admin session). **Uploads go to the BOT — `https://adrianmath-telegram-math-bot.fly.dev/api/mark-inbox` (express.raw to 60mb, Fly secret `MARK_INBOX_TOKEN`) — because Vercel hard-caps request bodies at 4.5MB at the PLATFORM level, before any handler runs**: Adrian's first real share (a 4.6MB CamScanner PDF) came back "Request Entity Too Large" from the Vercel route, and **`vercel.json` memory bumps do NOT lift that cap** (an earlier note here claimed they did — they don't; `mark-batch`'s big uploads survive because they CHUNK via `upload-chunk`). The Vercel `/api/admin/mark-paper-inbox` route keeps GET (list, `?setup=1` returns the token for the recipe), DELETE (consume), and a small-file POST that accepts both multipart AND raw bodies (magic-byte sniffed — Shortcuts' Content-Type varies by source app). Files land in Blob under `mark-paper/inbox/` (no DB — GET `list()`s the prefix), surface as a "📥 From your iPad" banner atop the mark page (re-checked on tab focus — the share happens in the OTHER Split View pane) with **→ Working / → Question paper / ✕** (attach = fetch → File → the same `onPickWorking`/`setPdf` path as the picker, then DELETE consumes it). Raw uploads have no filename (Apple sends none) — they arrive as `shared.pdf`/`shared.jpg`. The Shortcut's notification body should be the **Contents of URL** variable so it shows the server's real answer, not unconditional success.
- **🌙 Marking queue (2026-08-04):** the Queue-for-marking button uploads originals
  + paper PDF, saves the paper (save-paper) and tags it via `phase:'enqueue'`
  (`result_json.queue` = model/style/queued_at/attempts); a 30s bot worker marks
  queued papers ONE at a time from stored files (remarkRun fills in place),
  Telegrams Adrian each result, retries once, then parks with `failed_at` + an
  alert. Attachments clear after queueing so the next paper goes straight in.
  History rows show 🌙 queued / ⚠ queue failed states (stats select carries
  `queued_at`/`queue_failed` via JSON-path aliases). Worker is drain-aware.
  **The worker runs on PROD ONLY** — staging shares the same Supabase table, so
  its worker is guarded off (`FLY_APP_NAME` ends in `-staging` → not started;
  2026-08-06). Before the guard, staging and prod raced the non-atomic claim:
  the loser's remark overwrote the winner's finished row back to pending
  mid-build, which is why some queued runs "lost" their 🖼 images PDF and
  Telegram messages arrived from the staging bot.
- **🌙 Queue markings ride the Message Batches API (2026-08-26):** the queue worker's
  per-photo marking reads go through Anthropic's Batches API for the flat **50% token
  discount** (~$2.24 → ~$1.15 per average 15.6-photo run; ~$80-100/month at Aug pace).
  Verified before building: `code_execution_20250825` runs inside batch requests (live
  docs + an end-to-end probe, 2026-08-26), and the caching + batch discounts stack.
  Executor is bot `ai/mark-batch.js`; `markPhotoDirect` takes an injectable `exec` and
  ONLY `processMarkingQueue` passes the batch one (`remarkRun` grew an opts param) — the
  interactive ▶ Mark path (`phase:'remark'`/`'direct'`) is untouched and synchronous.
  Load-bearing details: **`warmPdfCache` stays a REGULAR request** (batches can't
  pre-warm — `max_tokens` must be ≥1 — and the batch reads then hit the 1h entry it
  wrote at 0.1×·0.5); batch params come from the same `buildMarkParams` as sync calls
  (byte-identical prefix or the cache entry is missed); every batch failure
  (create rejected / request errored / results unfetchable / not ended in 90 min) falls
  back to the sync call per photo, EXCEPT deploy drain, where the batch cancels itself
  and rejects with `err.fatalMarking` — `markPaperDirect` rethrows that so an aborted
  run fails the queue attempt cleanly instead of DELIVERING an all-blank paper. Retry
  reads/rescue/answer-key stay sync (they land post-batch). `finalizeUsage` prices the
  batched buckets at 50%, so the Telegram cost line shows the real spend. A queued
  paper now takes ~10-60 min instead of ~2 (papers process one at a time behind
  `_queueBusy`, so a deep queue can stretch hours — fine overnight, by design).
  **Kill switch: `MARK_QUEUE_BATCH=0`** on Fly reverts to the sync fan-out, no deploy.
- **🌙 Discount labeling + ⚡ Mark now (2026-08-26, same day — Adrian: "put it clearly as
  queue markings at 50% discount … mention roughly when … allow for a queue marking that
  does it immediately"):** `enqueue` returns `{position, etaMinutes:[lo,hi], batchDiscount}`
  (`lib/queue-pick.js` `queueEta` — batch ≈ 10–60 min × position, sync 2–6 × position,
  mark-now 2–8) and the mark-paper page says both in the queue confirmation; queued history
  rows read "🌙 queued (~50% batch discount) — marks in ~10–60 min". The doorbell's cost
  line carries the route receipt: `$1.15 (50% batch)` or `(⚡ marked now, full price)`.
  **⚡ Mark now** is a per-run button on queued rows → bot `phase:'mark-now'` = re-enqueue
  with `queue.mark_now: true` (attempts reset deliberately): the worker picks flagged
  papers FIRST (`pickNextQueued`, tested) and marks them with `batchMarking: false` —
  full-price sync fan-out, ~2–8 min once the worker is free (an in-flight batch paper
  still finishes first; `_queueBusy` is serial), delivery unchanged. It is per-run — the
  global `MARK_QUEUE_BATCH=0` kill switch is a different lever. Triage deliberately has
  no queue UI: it lists only runs WITH results, and queued runs have none yet.
- **🌙 No vision, no claim (2026-08-19):** before claiming (and paying for) a paper,
  the queue worker runs `visionPreflight()` (bot `ai/photo-overlay.js`) — a cheap
  Gemini text ping through the overlay's own model ladder. If it fails, the paper
  STAYS queued with attempts unburned (⏸-paused Telegram at most hourly, ▶️-resumed
  note on recovery). Adrian's rule: **a marked PDF whose ticks fell to the margin
  panel is not a deliverable.** The night the Gemini spend cap tripped, three papers
  shipped all-margin and every one was re-marked at full price. Belt-and-braces:
  `tickQuality()` checks the finished run's `annotated_photos[].method`, and 30%+
  margin pages puts a ⚠️ re-mark nudge in the result Telegram (a page or two of
  margin on dense photos is normal and stays silent).
- **💻 Plan-billed Mac marker (2026-08-26):** Adrian's split, agreed 26 Aug 2026 —
  **hand-ins (portal `/app/submit` + Telegram `/handin`) ALWAYS mark on the API
  path, untouched; Adrian's OWN queued papers may instead be marked by a headless
  Claude Code job on his Mac at $0 API (plan usage).** How it works:
  - **Policy lives in bot `lib/queue-pick.js` (pure, tested) — never re-derive it
    in a route.** A non-hand-in, non-⚡ queued paper waits out `EXTERNAL_GRACE_MS`
    (12 min) reserved for the Mac before the Fly worker takes it; the Mac (launchd
    `com.adrianmath.planmarking`, every 5 min) claims via `phase:'external-next'`,
    which stamps `result_json.queue.external_claim {by, at, attempts}` with a
    **conditional update** (queue generation unchanged since read — the
    staging-vs-prod claim race, relearned). The lease is 10 min,
    **heartbeat-refreshed** (`external-heartbeat`) while the Mac marks.
  - **FALLBACK IS THE LAW: a stale or released claim puts the row straight back on
    the Fly worker's API path** (Mac asleep, plan cap hit, job dead, >2 external
    attempts). A queued paper can never stall on this feature; worst case is the
    grace + lease (~20 min) of added latency. Kill switches:
    `MARK_QUEUE_EXTERNAL_GRACE_MS=0` on Fly restores pre-Mac behaviour exactly;
    `launchctl unload ~/Library/LaunchAgents/com.adrianmath.planmarking.plist`
    stops the Mac side.
  - **Marks logic is never re-implemented.** The Mac session fetches the marking
    prompts from the DEPLOYED bot itself (`phase:'external-prompts'` returns
    `DIRECT_MARK_SYSTEM`/`STANDALONE_MARK_SYSTEM` verbatim — zero drift), rebuilds
    each stored photo at ≤1280px (same copy `remarkRun` feeds the API), performs
    the read in-session, and posts raw per-photo JSON to
    `phase:'external-marking-result'` (`BOT_INTERNAL_SECRET`-authed like every
    phase; the Mac reaches it through the site's `/api/admin/mark-paper` proxy
    with the admin bearer). The bot injects the reads via `markPhotoDirect`'s
    `exec` seam (`ai/external-reads.js` — the same seam the Message Batches
    executor uses) so parse → `normalizeAttempt` → annotation → totals grounding →
    `logMarkingRun` → `announceQueuedResult`/`deliverQueuedRun` are **byte-identical**
    to a queue marking. A missing/unreadable photo read falls through to a real
    API call — page-level safety net. Spread expansion (`expandSpreads`) is
    skipped on external reads (indices must match what the Mac saw; intake-time
    spread-split covers the common case).
  - **Receipts:** the queue Telegram says `(💻 plan-billed — marked on the Mac)`;
    `cost_usd` then only carries bot-side extras (fall-through retries, rescue,
    answer-key check). `usage.external` + `externalReads` ride the run row.
  - **Superseded submits are dropped, never double-delivered**: the result phase
    validates the claim is still the caller's and the run still unmarked; a
    timed-out result POST retried after the bot finished answers
    `{superseded:true}`, which the Mac treats as success.
  - **Mac-side files:** `scripts/plan-marking/` (WORKER_PROMPT.md = the session
    runbook; run.sh = launchd wrapper — peek-first so an empty queue costs one
    curl, PID lock, 85-min watchdog, releases a dead session's claim;
    install.sh copies everything into `~/.adrianmath_marker/` — the job runs the
    COPIES because the shared checkout flips branches under peer sessions).
    Debug entry: the `plan-marking` skill. Logs: `~/.adrianmath_marker/plan-marking.log`.
- **⚠ Never upload the school's solutions with a script (2026-08-19):** everything
  in the upload is marked as the student's work — the marker (Claude) works answers
  out itself and reads no scheme. Alexis's SJC P2 upload included 16 pages of typed
  P1+P2 solutions and scored 227/258: the printed answer key was "marked" near-
  perfect on top of her 90-mark paper. Repair pattern (proven that night): back up
  the row, trim `result_json.source.photos` to the student pages (stash the rest in
  `source.removed_answer_key_photos`), set `results: []` + a fresh `queue` key, null
  `total_awarded`/`total_max`/`num_questions` — the worker re-marks it in place.
  Two later safety layers (both bot-side): `page_kind` classification on every
  marking read (2026-08-24 — an answer_key/question_paper/blank/cover page returns
  zero attempts, keeps its place in the PDF as a clean unbannered page, and never
  triggers the retry/rescue passes), and the **🔑 answer-key cross-check** below.
- **🔑 Answer-key cross-check — verification, never marking (2026-08-26):** when a
  scanned-in PRINTED key page is detected (`page_kind: 'answer_key'`), the bot runs
  ONE extra model call after marking (`ai/answer-key.js` + the hook in
  `markPaperDirect`): read the key, compare it against the final answers the marker
  accepted as its own ground truth, and flag disagreements — `review_recommended` +
  a "Answer key disagrees — key: …; marking accepted: …" entry in that question's
  `review_reasons` (flows into `/admin/mark/triage` untouched) plus a ⚠️ paper-level
  `review` note. **Marks are NEVER changed** — printed keys carry misprints, so the
  key flags for Adrian's decision; the Alexis rule (nothing printed is ever marked)
  stands. Result lands in `result_json` only via the flagged rows + review note; the
  check summary also rides the response as `answer_key_check`. Born from linjie's
  EM set-3 P2 (26 Aug 2026): the marker anchored on the student's setups in Q7(d)
  and Q7(g) and awarded 4 marks for wrong answers while the key page in the same
  upload carried 2765 m² and 4.2° — confident-and-wrong misses that flag-only
  triage cannot see. Same incident also added an anti-anchoring SOLVE step + a
  "SETUP BEFORE ARITHMETIC" severity rule to both marking prompts (commit to your
  own answer before reading the student's method; code-exec verifies arithmetic,
  never which givens belong in the formula), and a **blank-page pre-gate**: a
  success-empty `detectInkSpan` read skips the Opus call entirely (a detector error
  keeps the full read path — losing a real page is worse than one wasted read).
- **🌙 A queued paper arrives FINISHED (2026-08-06):** after the queue worker
  marks a run, `deliverQueuedRun` (bot `handlers/webchat.js`) builds BOTH PDFs
  via the site's `/api/admin/mark-paper-pdf` (photos first, then full — neither
  costs a model call), `linkPdf`s them onto the run, files the images PDF into
  Dropbox via `/api/admin/mark-paper-dropbox`, and the Telegram alert carries
  the images PDF as a **document attachment** (`notifyQueue` fetches ≤45MB and
  `sendDocument`s; any failure degrades to the plain link). Every step is
  best-effort — a delivery hiccup never re-marks the paper. Since 2026-08-13
  the completion message is hand-in-aware: a portal submission arrives as
  `📬 <student> handed in "<name>" — marked a/m` with a Release nudge (it
  replaced the submit-time doorbell — see the /app/submit section below), and
  the ⚠ failed-twice alert names the student too. **Delivered files prefix the
  student** whenever the run is tagged (2026-08-13, "prefix the student's
  name"): Telegram attachment `Kieran Lai — Submitted 13 Aug.pdf`, Dropbox
  `2026-08-13 Kieran Lai — Submitted 13 Aug.pdf` — the send row's convention;
  bare default names collided when two students submitted the same day. The
  message TEXT keeps the bare paper name (it already says who).
- **📁 To Dropbox (2026-08-06):** `/api/admin/mark-paper-dropbox` (admin auth,
  60s) fetches a run PDF **from our Blob store only** (`isOurBlobUrl` gate — an
  open URL would make an authenticated write-proxy into Adrian's Dropbox) and
  uploads to `Apps/AdrianMathNotes/Marked Papers/YYYY-MM-DD <name>.pdf` — flat,
  no month subfolders since 2026-08-14 (Adrian's ask; was `Marked
  papers/YYYY-MM/…` — old month folders were left in place). SGT date,
  `autorename` on collisions. First WRITE path in `lib/dropbox.ts`
  (`uploadFile`; `Dropbox-API-Arg` is ASCII-escaped — the header rejects raw
  Unicode). Path + filename come from `lib/dropbox-paper-path.ts` (tested), NOT
  inline in the route — the auto-save below has to compute the same string. The
  mark page's 📁 button next to ⬇ Download uses it too. ⚠ The
  Dropbox refresh token must carry `files.content.write` — the token on Vercel
  predated that scope and failed `missing_scope` until swapped 2026-08-06 (probe
  with a REAL write: Dropbox validates the path header BEFORE the scope gate, so
  an invalid-path 400 proves nothing about scopes).
- **The images PDF files ITSELF into Dropbox (2026-08-19):** Adrian's ask — "can
  the save action be done automatically? once the image pdf is generated?" The
  moment `generateBoth`'s photos half resolves, `autoFileToDropbox` posts it to
  the same route; not awaited, so the full PDF never queues behind an upload and
  a Dropbox failure reports itself next to the 📁 button, never in the red error
  banner (the marked copy is safe in the run either way). Filename comes from a
  `useEffect`-fed ref, not the render closure — the save fires minutes after ▶
  Mark, and the closure's `paperName` is the pre-marking one.
  ⚠ **Dedupe is keyed on the RUN, never the filename.** The obvious guard —
  "skip if a file with this name already exists today" — is WRONG here: Adrian
  really does mark several papers under one name on one day (three "isabelle …
  Set 2 P2" on 2026-08-12), and it would file the first and silently drop the
  rest. A run's FIRST save is `mode:add` + `autorename`, so a new paper never
  clobbers another's file (one-file-per-run overwrites are the next bullet).
  A failed save drops back out of the set (⚡ rebuild = retry) and `markFromStored`
  deletes its own key so a 🔁 Re-mark files the newer copy.
  Filenames are almost always paper-name-only: 51 of 53 runs carry no tagged
  student, because Adrian already types the name into the paper name ("isabelle
  EM SJC PRELIM P1 2024") — so the automatic name matches what the button would
  have produced anyway. The ✍️ annotated copy is still filed by hand: it is his
  own edit and he may make more.
- **One Dropbox file per RUN (2026-08-19):** every Dropbox save now carries the
  `runId`. First save for a run = `add`+`autorename` as before, but the landed
  path (`path_lower`) is recorded in `paper_marking_runs.dropbox_path`; every
  LATER save for that run uploads `mode:'overwrite'` to that exact path. So 📁
  after ✏️ Annotate (or after any rebuild/rename) REPLACES the auto-filed copy
  instead of stacking `… (1).pdf` siblings — Adrian's expectation. Same-name
  same-day papers stay safe: different runs record different autorenamed paths.
  Passers of runId: send-row 📁, `autoFileToDropbox`, history-row 📁, and the
  bot's `deliverQueuedRun`. A save without runId behaves exactly as before.
  **Manual taps confirm before replacing (2026-08-20):** when a recorded file
  exists and the body lacks `confirmOverwrite`, the route answers 409
  `{needsConfirm, existing}` and the page shows a Replace? dialog before
  retrying — a stray 📁 tap can't silently replace a hand-annotated copy.
  Automatic refiles (`autoFileToDropbox`, the bot worker) send
  `confirmOverwrite:true` and stay silent. First-ever saves never prompt.
- **✓ Checked (2026-08-19):** `paper_marking_runs.checked_at` separates "I've
  been through this marked copy" from "the AI finished". Set automatically by
  (a) an annotated PDF linking onto the run — bot `linkPdf` kind `annotated`,
  which covers BOTH the Notability upload and the in-browser ✏️ Annotate save;
  (b) a delivered ✉️ email (`mark-paper-send`); (c) the send-row ⬇ Download —
  its href alone carries `&run=` (history/library view links stay silent; the
  download route AWAITS the update because a fire-and-forget write can be
  killed once the response starts streaming). Manual override lives in
  `/admin/papers`: POST `{runId, checked:boolean}`, a "Not checked yet" filter
  chip, an `unchecked` stat, a green ✓ Checked button per row (tap the badge to
  undo). Semantics agreed with Adrian 2026-08-19: sending strongly implies
  vetting, so send counts as checked.
- **Multi-PDF drop chooser (2026-08-19):** dropping 2+ PDFs into Student
  working used to silently merge them into one giant script. Now they park in
  `pendingPdfs` and a card asks: **Queue N papers separately** (each PDF
  rasterizes → spread-splits → uploads → `save-paper` named from its filename →
  `enqueue`, sequentially, via `queueFilesAsPaper` — the extracted core 🌙
  Queue also uses) · **Combine into one paper** (the old append behaviour, for
  one script scanned as several files) · Cancel. Loose photos in the same drop
  still attach immediately either way.
- **Duplicate-marking guard (2026-08-26):** ▶ Mark, 🌙 Queue and the multi-PDF
  "Queue N separately" flow confirm before spending money when the loaded
  history (`phase:'stats'`) has a run with the SAME paper name (case-insensitive,
  trimmed) from the last 3 days — "You marked 'X' on <date> — mark it again?
  (~$2.30)". August 2026 had ≥$25 of the same paper marked 2–5× out of a $164
  marking bill. `confirmDuplicateMark` in the page; client-side only, no new
  API. Deliberately NOT gated: the portal hand-in auto-queue (server-side, must
  stay silent), 🔁 Re-mark (has its own confirm — its images-attached path calls
  `markPaper({skipDupGuard:true})`), the history-row ▶ Mark on a ⏳ row
  (finishing a saved paper, not duplicating), and bare ⏳ rows never trigger a
  match (nothing was paid for yet — only marked or currently-queued runs count).
  In the multi-PDF flow the confirms all fire up front at tap time; a declined
  paper is skipped and named in the queue note, the rest queue as normal.
- **Paper name is editable everywhere (2026-08-06):** a name input sits above
  Mark/Queue (placeholder = working-file name), the send row keeps its input,
  and history rows' names click into an inline rename (Enter saves, Esc
  cancels). All of them persist via `phase:'rename'` (bot updates
  `paper_marking_runs.paper_name`, 120-char cap) so the queue's Telegram/Dropbox
  delivery uses the same name Adrian typed.
- **⬇ Practice DOCX (2026-08-04):** the practice panel's DOCX button posts
  `phase:'practice-docx'`; the bot renders the list to a house-style Word file
  (pandoc in the Docker image + `assets/worksheet-reference.docx` carrying the
  create-worksheet styles — TNR 9.5, typeset equations, orange right-aligned
  [Ans: …]) and stores the Blob URL in `result_json.practice.docx_url` (repeat
  clicks free). Download rides mark-paper-download (content-type pass-through).
- **Deploy drain (bot, 2026-08-04):** fly kill_timeout 300 + `lib/drain.js` —
  deploys wait for in-flight markings; long phases 503 with a clear message
  while draining. Deploy-killed 502s are history.
- **⏳ Saved papers (2026-08-03, same day):** the uploads are SAVED as a run row
  BEFORE marking starts (`phase:'save-paper'` → row with `result_json.source`
  only, `total_max` null = the pending signal) and the marking FILLS that row
  (`runId` on the direct body → `logMarkingRun` update-in-place; unknown id falls
  back to insert). A 502'd marking therefore leaves "⏳ uploaded — not marked
  yet" in history with a ▶ Mark button (`phase:'remark'`, which fills a
  never-marked row in place instead of duplicating it) — retrying is one tap,
  never a re-upload. Born from deploy-killed markings: the bot restarts on every
  fly deploy and in-flight 2-min markings die as 502s, including from OTHER
  concurrent Claude sessions deploying the bot.
- **Big-paper auto-fallback (2026-08-13):** `phase:'direct'` inlines every page's
  base64 into one JSON body, and Vercel 413s bodies over 4.5MB at the edge — a
  25-page phone-photographed prelim (camera pages ≈ 2× scan bytes at 1280px) hit
  it; 24-page desktop papers had been squeaking under. `markPaper()` now sizes
  the body first (`lib/mark-payload.ts`, unit-tested): over 3.5MB (1MB headroom)
  AND the just-saved pending row is COMPLETE (`canMarkFromStored`: pendingId +
  every original in Blob + every page browser-decoded + paper PDF uploaded if
  attached) → it sends `phase:'remark'` on that row instead — the exact marking
  ▶ Mark runs, no photo payload at all. Any hole in the saved row keeps the
  inline path as the safety net so a lossy marking can never silently replace
  the full one.
- **History-row 📁 Dropbox + 🗑 Delete (2026-08-13):** every Recent-marked-papers
  row gets the send row's To Dropbox (best copy: annotated → images → full; name
  `Student — Paper`, the route prepends the SGT date) plus a delete with
  confirm. Delete = `DELETE /api/admin/papers?id=` — removes the Supabase row
  first, then best-effort `del()`s every Blob URL found by sweeping the
  serialised row (`isOurBlobUrl`-filtered), so originals/annotated pages/PDFs go
  too. No FK references `paper_marking_runs` (checked 2026-08-13). Released runs
  are deletable — the confirm warns they vanish from the student's portal.
- **🔁 Re-mark (2026-08-03):** every marking now stores its INPUTS on the run —
  photo originals (the ≤1400px upload-skip is gone: every photo's original goes to
  Blob) + the question-paper PDF (new `type=paper` token flavour; the marking call
  still reads the body's base64, the URL is storage-only) — as
  `result_json.source` (`buildRunSource` in the bot, blob-URLs only, tested).
  The results panel's 🔁 Re-mark button (confirm dialog — full marking cost) posts
  `phase:'remark'`: the bot refetches the stored files, rebuilds ~1280px marking
  copies server-side (cost parity with a fresh mark), re-marks with the originals
  as hi-res pen bases, and logs a NEW run carrying the paper name + student link
  (the old run stays). Runs from before 3 Aug have no source → clear error telling
  Adrian to re-attach. With photos still in the picker, the button just calls
  markPaper() — fresher bytes, same result.
- **📝 Practice questions (2026-08-03, OPT-IN by request — never runs by default):**
  after marking, a `📝 Practice questions (N wrong)` button (shown only when ≥1
  question scored below max) posts `phase:'practice'` through the proxy; the bot
  (`ai/practice-questions.js`) builds ONE question per below-max question —
  embedding-matched from the Supabase QB first (`searchSimilarQuestions`, level-
  mapped from the run's `level_detected`), model-generated (code-exec-verified)
  only when no candidate fits — and **"Math In Real World Context" questions are
  excluded in both paths** (Adrian's rule: practice the raw skill, not the story).
  The list persists in `paper_marking_runs.result_json.practice`, so re-click and
  run reload show the stored list instead of paying for another call.
- **Exact-form deduction (2026-08-10):** `MARK_SEVERITY_RULES` (bot `ai/paper-marker.js`, shared by the direct AND standalone prompts) docks 1 mark when a final answer whose exact value is a **TERMINATING decimal** is written further-rounded — the cover page instructs exact-or-3-s.f. (The trigger was 10.375 km rounded to "10.4" scoring 1/1 with just a *"leave exact if possible"* comment.) **Terminating decimals ONLY** (Adrian, same day: *"should not include surd or π-multiple"*): surd/π/non-terminating answers are fine at 3 s.f. — the marker must never demand surd or π form — and nothing is penalised where the question fixes the accuracy (2 d.p., money to the cent, angles to 1 d.p.).
- **✂️ Two-page spreads split at intake (2026-08-12):** `onPickImages` runs every picked photo (and every PDF-raster page, and every inbox attach — they all funnel through it) through `splitFileIfSpread` (`lib/spread-split.ts`, pure geometry unit-tested): landscape past `w > h·1.15` is cut into left/right halves at FULL resolution (3%-of-width gutter overlap each side) BEFORE the 1280px marking copy and 2600px hi-res original are made. Fixes BOTH spread problems at once: printed size (one wide PDF page fit one A4 sheet → each exam page ~A5; split halves each print full-page) and annotation grounding (a spread shrunk to 1280 gave each page ~640px → measured 10/10 margin-fallback correlation with low-res intake). A green `✂️ Split N…` receipt line shows under the drop zone. The same splitter runs on `/app/submit`, so student hand-ins get the same hygiene.
- **📏 Paper totals are GROUNDED, not counted (2026-08-14):** the red `PAPER TOTAL x / y`
  denominator used to be the sum of the model's per-question `total_max` guesses, which was
  wrong most of the time on Adrian's compiled sets — a skipped-blank question never enters
  the sum (Eva's Set 3 P1: Q6 skipped → /89 instead of /90), and pages missing their printed
  `[n]` bracket get a different guess every run (Isabelle's Set 2 P2 marked 5× → 87, 92, 92,
  95, 96). Grounding lives in the bot's **`ai/paper-totals.js`** (pure, unit-tested) and runs
  inside `markPaperDirect` BEFORE return — it must, because the badge is baked into the PDF
  at assembly and triage can't redraw it. Precedence: **(1) the "out of ___" box** next to
  Paper name (sent as `totalMax` on `save-paper` + `direct`; persisted as
  `result_json.total_max_override` so ▶ Mark/🔁 Re-mark/🌙 queue re-ground the same way —
  admin page only, deliberately NOT on `/app/submit`: students rarely know official totals
  and a wrong override always wins); **(2) the known-paper registry** matched on paper name
  (EM/AM prelim/practice set+paper names → 90, JC/H2 → 100) — applied only when the counted
  sum lands within **0.75×–1.10×** of the official total, so a 3-question partial hand-in
  named "Set 3 P1" stays counted; **(3) the counted sum**, exactly as before. `totals`
  becomes `{awarded, max, counted_max, max_source: 'override'|'registry'|'counted'}` —
  awarded is NEVER grounded (93/90 on the badge is honest over-award surfacing). On grounded
  runs, integer gaps in the detected question numbers are reported as
  `result_json.unattempted_questions` ("Not attempted: Q6" — in the queue Telegram message,
  the results panel, and run reload); ungrounded runs keep the list empty because gaps there
  just mean unsubmitted pages. The queue Telegram also carries a mismatch receipt
  (`⚠️ Question marks summed to 89 — used the official total (90)`), and the results header
  shows the same note. **Notes / worksheets / homework never ground (2026-08-22):** a
  name containing `notes`, `worksheet`, `homework`/`hw`, `tutorial`, `topical`, `revision`
  or `lecture` returns no official total even when it also says `jc1`/`practice` —
  "adele jc1 apgp notes practice" was a 21-page notes doc whose Practice 1–4 sets she dipped
  into; `jc1`+`practice` grounded its 75 counted marks to /100 and the review banner said
  "25 marks went ungraded" on a paper with nothing missing. Separate from that false
  alarm, a question on such a hand-in can legitimately show `question_found:false` — the
  student's copy of the notes was a different version from the PDF uploaded (her Practice
  3 Q3 was a GP/AP question; the uploaded PDF's Practice 3 Q3 is the integer-sets one), so
  the marker marks it from the working alone and says so. Not a marker miss.
- **Runs link to their student** (2026-07-30): picking a student in the send row silently fires `phase:'set-student'` (bot store → `student_id`/`student_name` on `paper_marking_runs`, indexed; last pick wins). The organizing principle is the same as Lessons/Invoices — a link to the Airtable Student record, NOT per-student Blob folders (Blob is the shelf, the DB row is the index card). `phase:'by-student'` returns one student's runs; `/admin/students/[id]` renders them in a **Marked papers** section (overview tab, ✍️/🖼/📄 links). History rows show the tagged name. Runs marked before 2026-07-30 are untagged until re-loaded and re-picked.

## /admin/mark/triage — flagged-only review + the release gate (2026-08-11)

The screen that makes AI marking safe to hand back at scale. **Nothing Adrian uploads
himself reaches a student until he taps Release** — that tap is the trust gate (locked
decision 2 in [`../HANDOFF-MARKING-LOOP.md`](../HANDOFF-MARKING-LOOP.md); do NOT un-gate
student-facing marking on Telegram). **Portal hand-ins are the one exception since
2026-08-21** (Adrian: "auto-release after bot finishes marking"): the bot's queue worker
calls `{action:'release', runId, auto:true}` right after `deliverQueuedRun` links the
PDFs. `auto` (a) refuses any run without `result_json.portal_submission`, (b) skips the
`isReleasable` flag gate — flags stay in result_json for the record, (c) stamps
`released_via:'auto:portal|telegram|none'` so history shows it was automatic, and (d)
runs the same student nudge + post-release enrichment as a manual release. Bot-side,
`tickQuality().degraded` (margin ticks) is the hard stop — such a paper keeps the old
"release from triage" nudge so Adrian re-marks it first. A student's own hand-in
therefore no longer appears in triage at all unless its ticks were degraded or the
release call failed.

- **It shows flagged questions only.** The bot's marker already writes
  `review_recommended` + `review_reasons[]` per question in `result_json.results[]`
  (question not found, uncertain match, marker uncertainty note, low marking
  confidence). Triage renders *those*; the confident majority is released untouched
  and never opened. Measured on the live backlog (14 days, 2026-08-11): **607
  questions across 30 unreleased scripts → 174 flagged, 433 auto-skipped.** The 71%
  is the whole point of the screen.
- **Logic lives in [`../src/lib/mark-triage.ts`](../src/lib/mark-triage.ts)** (pure,
  non-mutating, 26 unit tests) — `extractFlagged`, `applyAgree`, `applyOverride`,
  `recomputeTotals`, `isReleasable`, `pendingCount`. Marks arithmetic must never be
  re-implemented in the route or the component (repo testing policy). Non-mutating is
  deliberate: callers read-modify-write `result_json`, and an in-place edit would leave
  a half-written object behind on a failed write.
- **Grounded totals survive triage (2026-08-14).** When the bot grounded the paper's
  denominator (`totals.max_source` of `'registry'`/`'override'` — see the 📏 bullet in the
  mark-paper section), `recomputeTotals` re-sums **awarded only** and keeps the grounded
  max, and `replaceResult` spreads the prior totals first so `counted_max`/`max_source`
  survive the rewrite. Without this, the first Agree/Override on Eva's run would have put
  the guess-sum /89 right back on a badge the bot had already corrected to /90. Runs with
  `max_source: 'counted'` (or no `max_source` at all — every pre-grounding run) behave
  byte-identically to before.
- **Agree / Override.** Both stamp `triage_reviewed: true` so the row drops off and
  can't re-appear on the next load. Override also writes `triage_override
  {awarded, previous, note, at}`, clamped to `[0, total_max]`, and **keeps the first
  `previous`** across repeated edits — that's the AI's original mark, unrecoverable
  the moment a second edit overwrites it. Overriding an already-released run 409s:
  released marks are final.
- ⚠ **An override corrects the RECORD, not the annotated PDF.** The PDF is drawn once
  at marking time by the bot's `deliverQueuedRun`; nothing on this screen can redraw
  it. `total_awarded` (score chip, `/admin/students/[id]`, the bleed table) reflects the
  override while the PDF the student opens still shows the AI's original red pen. Say
  the correction out loud — the release nudge carries the note.
- **Release** (`action:'release'`, single or batch) resolves the recipient
  portal → Airtable (`portal_accounts.telegram_chat_id` first, then the Student
  record's `Student Telegram ID`), sends the portal link when
  `NEXT_PUBLIC_PORTAL_ENABLED`, else the annotated PDF as a Telegram document, else a
  plain "ready" nudge. It then stamps `released_at` + `released_via` **whether or not a
  nudge landed** — the release IS Adrian's decision, and a student with no Telegram
  must not sit in the queue forever. `released_via: 'none'` is the record that this one
  needs a physical hand-back.
- **Only ~2 of 43 runs carry `student_id`** (2026-08-11) — a run is tagged only when
  Adrian picks a student in the mark-paper send row. Untagged runs can be triaged and
  released but have nobody to notify; they land as `via: 'none'`. Tag at send time to
  close that gap.
- **Runs still in the queue are skipped** — the GET filters on
  `Array.isArray(result_json.results)`. A queued run has no results yet, and showing it
  as "0 flagged, ready to release" would invite releasing nothing.
- **Discoverability:** a purple attention card on `/admin` (hidden at zero flags, from
  `/api/admin-stats` → `triage {flagged, readyToRelease}`) **plus** a permanent
  🔍 Triage marking launcher tile, so the screen is reachable when the count is zero.
- **Health check:** `mark-triage` probes `paper_marking_runs?select=id,released_at` —
  without that column every marked script silently re-enters the queue forever.

## /admin/papers — the marked-script library (2026-08-12)

Every marked script in one filterable list. Built for the two things the mark-paper
page can't do: **pull up an old script during a lesson** (its history list reaches
back only a handful of runs, so going through last month's paper meant re-marking
it), and **tag the backlog**.

- **Reads Supabase directly**, not through the bot. `/api/admin/mark-paper` is a pure
  proxy to Fly, and its `phase:'by-student'` is useless here — 41 of 43 runs carry no
  `student_id`, so a by-student view would show an empty page. The website already has
  service-role access to `paper_marking_runs`, so `/api/admin/papers` queries it
  itself and no bot deploy is involved.
- **Tagging is the point.** An untagged run reaches neither `/admin/students/[id]`
  nor a parent report — it is marking that exists but counts for nothing. Every row
  carries an inline `StudentPicker`; POST `{runId, studentId|null}` writes
  `student_id` **and re-resolves `student_name` from Airtable server-side** (the name
  is denormalised into the row and shows up in triage, so a stale or mistyped one
  would outlive whatever screen produced it). Passing `studentId: null` untags.
- **Runs with no `result_json.results` array are dropped** (same rule as triage): a
  run with no stored marking is a failed or still-queued attempt, and listing it as
  0/0 reads as a paper the student scored nothing on.
- **Topic chips are weakest-first**, from `aggregateTopicBleed` — the same function
  behind the bleed table, so the chips and the reports agree. The API returns up to
  `MAX_TOPICS_PER_RUN = 8`; the row shows 3 and expands.
- **✍️ Annotate deep-links** to `/admin/mark-paper?run=<id>&annotate=1`. The
  mark-paper mount effect reads `?run=` and calls `loadRun` (or `annotateRun` when
  `annotate=1`), so the library hands the run to the page that already knows how to
  open it. ⚠ Both go through the bot proxy, so this leg **cannot be exercised on
  `localhost`** — `BOT_BASE_URL`/`BOT_INTERNAL_SECRET` are Preview/Production-scoped
  and a local load 503s with "bot not configured". Verify it on the preview URL.
- Filters: student, "Needs tagging", "Not checked yet", Clear. Default view is
  everything — filtering by student first would have shown an empty list and read
  as broken.
- **Bulk ✓ + delete (2026-08-21, Adrian's ask):** "✓ Mark all N as checked" in the
  filter row sweeps every *visible* unchecked run (POST `{runIds, checked}` — one
  Supabase `.in()` update, so it composes with the filters: filter to a student
  first and "all" means theirs). Each row also has a 🗑 at the far right → same
  `DELETE /api/admin/papers?id=` as mark-paper's history rows (row + every Blob
  file). Both are two-tap: the armed state ("Tap again…" / "Delete for good?")
  auto-disarms after 4s, and that client confirm is the only delete guard — the
  API asks no questions.

## /app/marking — where the student reads their own marks (2026-08-12)

The student-facing end of the loop, and the destination the release nudge has
always pointed at. `mark-triage`'s `deliver()` has sent `…/app/marking` since the
release gate shipped — **the page did not exist until now**, so the moment
`NEXT_PUBLIC_PORTAL_ENABLED` flipped on, every released paper would have sent a
student to a 404. `timed('portal-marking', …)` in `/api/health-check` now asserts
that route is not a 404 precisely because nothing on Adrian's side goes red when
a student taps a dead link.

- **Two invariants, both enforced twice.** `page.tsx` queries with
  `.eq('student_id', …).not('released_at', 'is', null)`, and
  `buildStudentMarking()` re-applies the release filter on its own input. Adrian's
  review is the trust gate on AI marking (HANDOFF-MARKING-LOOP.md, locked decision
  2); one forgotten `.not(...)` in a future query must not be the only thing
  between a student and an unreviewed mark. There is a test for exactly that.
- **No triage internals reach the student.** `review_recommended`,
  `match_confidence`, `marking_confidence` and the override note are Adrian's
  working notes about how far to trust the machine — a student reading "marking
  confidence: low" learns nothing about their maths. A test JSON-stringifies the
  whole output and asserts none of those strings appear.
- **`paper_marking_runs` has no per-student RLS policy.** The page reads with the
  service key, so the `student_id` filter *is* the access control — it must never
  be driven by anything the client can set. It comes from `currentStudent()`.
- **Stored totals win over `result_json`.** A triage override writes
  `total_awarded`/`total_max` on the row but cannot redraw the already-rendered
  annotated PDF (see the ⚠ in `lib/mark-triage.ts`). So the score the student sees
  is Adrian's corrected one while the red pen on the PDF is still the AI's
  original. That gap is real; it is why an override note is meant to be said out
  loud.
- **Per question it shows only parts that actually lost marks.** Some markers write
  `error_summary: "no errors"` on a correct part; printed under a heading called
  "where you lost marks" that reads as a criticism of a right answer.
- **"Work on next" uses the same thresholds as the parent report** (≥4 marks
  behind a topic, <75%, top 3, via `aggregateTopicBleed`). Deliberate: the student
  and their parent must never be shown two different focus lists.
- Logic lives in `src/lib/portal-marking.ts` + `.test.ts` (repo policy: marks logic
  never inline in a route or component). The page is a server component and uses
  `<details>` for the per-paper breakdown so opening it ships no client JS.
- ⚠ **Not verifiable on `localhost`**: `SUPABASE_SECRET_KEY` is a Sensitive Vercel
  var, so `vercel env pull` writes `[SENSITIVE]` and the query cannot run locally.
  Unauthenticated it 307s to `/login` (that much is checkable anywhere); the
  rendered page needs a preview/prod session on a student account with a released,
  tagged run.

## Revise-concepts bridge — dropped questions → swipe cards (2026-08-21)

At release time, one model call maps each dropped-marks question to the ONE
worked-example sub-group the student should revise; `/app/marking` renders it as
a "📚 Revise: {concept} ›" chip under the question, deep-linking into the
`/revise/{level}/{topic}/worked-examples?subgroup={id}` swipe player. **Fail-soft
is the design rule: a missing chip is fine, a wrong or dead link is not** — a
mapping failure must never block or delay a release.

- **Logic lives in [`../src/lib/revise-map.ts`](../src/lib/revise-map.ts)** (pure parts
  unit-tested; `buildReviseBlock` is the I/O orchestrator, one `claude-opus-4-8`
  call per paper). Stored as `result_json.revise = {level, items:[{for, subgroup_id,
  name, topic}], mapped_at}`. Chip parsing/URL building is `reviseLinks()` in
  `portal-marking.ts` — it re-validates everything (level shape, integer id,
  non-empty name/topic) so a malformed stored block degrades to no chip.
- **Fires from triage release** — `queuePostReleaseEnrichment()` in
  `/api/admin/mark-triage/route.ts`, inside `after()`. Sequencing matters: the
  revise loop finishes ALL its result_json writes before any bot practice call
  fires, because both sides read-merge-write the same JSON column. Idempotent:
  skips when `rj.revise` already exists. Only dropped-marks runs enter the queue.
- **Two grounding rules keep links honest.** (1) Candidates are only sub-groups
  with published web-visible worked-example cards (`content_snippets` level +
  `content_kind='worked_example'` + `is_published` + feature both/web) — a chip
  can't land on a "coming soon" page. (2) The model picks from that list by id;
  `parseMapperResponse` drops hallucinated ids, unknown question numbers, dupes.
  ⚠ It also strips a leading `Q` from the model's `for` — the prompt renders
  questions as "Q10", and opus echoes that prefix back despite instructions;
  before the strip, every item was silently rejected and the whole run mapped null.
- **`level_detected` is free text and NOISY** — real AM papers carry per-question
  labels like "A-Level H2 / JC1 (or Additional Maths)". `classifyLevelString`
  classifies each question independently (subject markers A-Math/E-Math outrank
  level markers H2/JC; both-subjects labels cast no vote), then
  `detectBankLevel` majority-votes the paper; ties → null → no mapping.
- **Partial coverage is correct behaviour, not a bug.** AM has cards for all 31
  topics; EM covers only 6 Algebra topics; JC is sparse. Dry-run 2026-08-21: AM
  paper mapped 4/4 (including two judged-by-the-error wins — a "circles" question
  whose real slip was shoelace area mapped to the shoelace card); EM paper mapped
  3/11 and correctly declined bearings/vectors/kinematics rather than stretching.
- Chips show only on questions that lost marks, only for the student's own
  released papers (the block rides inside result_json, so all /app/marking
  access rules apply unchanged). A stale mapping naming a full-marks question is
  ignored at render time.

## /app/submit — student paper hand-ins (2026-08-12)

The door IN from the student side: photograph the worked paper on a phone →
auto spread-split + ≤2600px downscale (`lib/spread-split.ts`, same hygiene as
Adrian's own intake) → straight-to-Blob via client token → one POST files it.

- **A submission IS a saved run.** `/api/portal/submit` calls the bot's
  `phase:'save-paper'` + `phase:'set-student'`, so it lands as the same
  "⏳ uploaded — not marked yet" row Adrian's own uploads make: visible in
  /admin/mark-paper history with ▶ Mark, counted by the hub's ⏳ card, marked
  by the existing remark machinery. Nothing new to mark FROM — only a new door
  in. **The release gate is untouched**: it reaches `/app/marking` only when
  Adrian releases it in triage.
- **Hand-ins auto-mark (2026-08-13, Adrian: "auto-mark hand-ins").** Right after
  the stamp, the submit route calls the bot's `phase:'enqueue'` (defaults
  opus/teacher — the same 🌙 queue Adrian's own button feeds), so a portal
  submission marks itself. **No doorbell on the happy path**: the queue worker's
  finished-marking Telegram IS the doorbell now — `📬 <student> handed in
  "<name>" — marked a/m`, 🖼 images PDF attached, plus a Release-in-
  `/admin/mark/triage` nudge. The old `📬 <name> submitted… tap ▶ Mark` text
  survives only as the fallback when the enqueue call itself fails (a saved
  hand-in must never sit silent). Enqueue runs AFTER the `portal_submission`
  stamp so the worker can't claim the run mid-read-merge-write.
- **Hand-ins auto-RELEASE too (2026-08-21).** Once the worker has marked and
  linked the PDFs, it calls the triage route with `auto:true` (see the triage
  section) — the student's Telegram nudge goes out and `/app/marking` shows the
  paper within minutes of hand-in, no Adrian tap. The completion Telegram now
  ends `✅ Released to <student> — Telegram sent` (or `…no Telegram linked, so
  tell them it's up`), and only falls back to the "release from triage" line
  when ticks were degraded or the release call failed.
- **Marking-only beta for students (2026-08-21, `lib/portal-beta.ts`
  `MARKING_ONLY_BETA=true`):** a student session sees ONLY Home / Submit / Marked
  (+ Settings). Practice, Learn, Notes, Reference are hidden from nav + dashboard
  and their routes redirect to `/app` (client pages gated via a sibling server
  `layout.tsx`); `/app/marking`'s "Work on next" chips render as plain pills.
  Adrian's admin cookie in the same browser sees the full portal. Portal APIs
  (`/api/portal/practice*`) are NOT 403'd — unreachable from the UI only.
- **Ownership is the pathname.** `/api/portal/submit-token` (portal session
  only — Adrian tests as his own student account) pins uploads under
  `mark-paper/portal/<studentId>/…`; the submit route accepts only our-Blob
  URLs under the CALLER'S OWN prefix, and the student id comes from the
  session, never the body. Rate brake: 3 portal submissions / 10 min / student
  (counted via the `result_json->>portal_submission` stamp).
- **`result_json.portal_submission: true`** is stamped site-side right after
  creation — it is what lets `/app/marking`'s "With Mr Fong" strip list the
  student's own pending hand-ins (name + date + pages, never a mark) without
  ever surfacing papers Adrian uploaded himself and chose not to release.
  **The bot preserves it through the pending-row fill** (2026-08-13):
  `logMarkingRun` rebuilds `result_json` from scratch when the queue worker's
  remark fills the ⏳ row, which used to WIPE the flag the moment marking landed
  — emptying the student's "With Mr Fong" strip pre-release and un-counting the
  run from the 3/10min rate brake. `remarkRun` now passes
  `extra.portalSubmission` through (latent since /app/submit shipped; surfaced
  by auto-queue, where every hand-in gets marked within minutes).
- Health check: `timed('portal-submit', …)` asserts the token route answers
  401 unauthenticated (route alive + auth gate up).
- ⚠ Same localhost caveat as /app/marking: the full flow needs a preview/prod
  student session; locally only the 401/redirect gates are checkable.

## /admin/mark-paper — scanned-PDF working (client-side rasterisation)

Adrian can drop the student's working in as **a scanned PDF** instead of phone photos.
The PDF never reaches the server as a PDF: `pdfToPageImages()` in
`src/app/admin/mark-paper/page.tsx` rasterises it **in the browser** to one JPEG per
page and feeds those into the ordinary photo path, so marking → Gemini bounding boxes →
red-pen overlay → assembled PDF are all untouched (annotation needs a raster). Doing it
client-side also keeps a fat scan off Vercel's 4.5 MB request-body ceiling.

**Resolution chain (fixed 2 Aug 2026 — "marked pages are blurred"):** the model reads a
≤1280px JPEG-0.72 copy (`fileToUpload` — keeps the JSON body small, model cost
unchanged), but the bot composites its red pen onto whatever base it has, so every
marked page + every PDF built from them used to inherit ~1280px (~110 DPI on A4). Now
`markPaper()` ALSO uploads each photo to Blob at ≤2600px (`uploadOriginal` /
`fileToHiresBlob`, client token `type=original` on `mark-paper-annotated-token` — the
one flavour with no runId, since the run doesn't exist yet) and sends `originalUrl` per
image; the bot fetches it in parallel with the marking call and re-renders the SAME
overlay SVG onto it via viewBox scaling (`ai/hires-original.js` + `createAnnotatedImage`
in the bot — placement math stays in small-copy coordinates). `pdfToPageImages` renders
at ≤2600px for the same reason (the page images ARE the originals for a scanned PDF).
Every step is best-effort: a failed original upload/fetch/aspect-check falls back to
annotating the small copy. Don't "optimise" the originals away, and don't make marking
read them — the split (small copy to the model, big copy to the pen) is the point.

Three non-obvious details, each a bug if changed:

- **`intent: 'print'` on `page.render()`** — the default `'display'` intent paces the
  paint loop with `requestAnimationFrame`, which a hidden or backgrounded tab never
  fires: the render promise then never settles and the conversion hangs on page 1 with
  no error and nothing in the console. `'print'` paces with timers.
- **`disableFontFace: true`** on `getDocument` — glyphs draw as paths; the page is only
  ever rasterised, so document-level `@font-face` machinery is pure risk.
- **White fill before rendering** — PDF pages have no background of their own, and JPEG
  turns the transparent paper black, so the marker would see nothing.

The worker is a **vendored copy at `public/pdf.worker.min.mjs`**, not a bundled import.
pdf.js refuses to run when worker and API versions differ, and `npm update pdfjs-dist`
would leave the copy behind — breaking PDF uploads at runtime with nothing failing at
build time. `src/lib/pdf-worker-asset.test.ts` pins the pair; when it fails the fix is
`cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`.

## Marked-PDF assembly — page order + LaTeX repair

The marked PDF (`/api/admin/mark-paper-pdf`) interleaves each **annotated photo** with the
**typeset transcript sheets for that photo** — photo 1, its transcripts, photo 2, its
transcripts, … (changed 2026-07-28; transcripts used to be a block at the very end).

**Two PDF buttons, two products** (`mode` on the route): **📄 Generate full PDF** =
annotated photos **+** the typeset transcript sheets interleaved behind each photo (the
route renders one PNG per question through Puppeteer — the slow path). **🖼️ Generate
images PDF** (`mode:'photos'`) = the annotated original photos ONLY, no typeset pages,
no Puppeteer — a few seconds, and the closest thing to a hand-marked script. With a
single photo the full mode returns a PNG (`kind:'image'`) instead of a PDF.

### Photo vs transcript — who says what (2026-07-29)

The two surfaces look overlapping but are not interchangeable, and the division below is
load-bearing: **the photo is the only surface that exists in BOTH PDF modes.** 🖼 images-only
has no transcript at all, so anything shown only on a transcript is something a student may
never receive.

| | **Annotated photo** (bot, `ai/annotate.js`) | **Transcript sheet** (site, `marking-template.html`) |
|---|---|---|
| What it is | the marked script — his own paper, red pen on it | a legible re-write of his working |
| Carries | boxed `awarded/max` per part · one-line `error_summary` per part below max · ticks/crosses · footer "Marker's notes" · **in 🖼 mode only: the worked solution** (the circled page total was REMOVED 2026-08-20 — per-part boxes are the marks; bot `2f40f20`) | every line of his working re-typeset with ✓/✗ · the corrected line inline · struck wrong answer + the right one · "Where you went wrong" paragraph · **the worked solution** |
| Says | what each part scored, and WHY a mark was lost | what the answer WAS |
| Granularity | per PART | per LINE |
| In 🖼 images-only mode | ✅ | ❌ absent |
| Legible when the handwriting isn't | no | yes — that is the whole point |

- **"Marker's notes" is not a duplicate of the transcript — it is the OVERFLOW of the photo's
  own margin.** A part's score box and `error_summary` are written beside the working when
  `findSpot` finds room; when it doesn't (crowded scan, part Gemini couldn't locate), that same
  text spills to the strip under the page rather than being dropped. Sparse Marker's notes =
  the margins had room. A long one = a dense page, not a second opinion.
- **The comments go on the PHOTO, the worked solution goes on the TRANSCRIPT** — Adrian's
  call, 2026-07-29: *"there is no need for comments to be on both, so the comments are on the
  actual image/pdf, as well as why student's working is wrong, then the correct solution on
  transcript."* The rule is **once per document, not once per system**: a 📄 full PDF has a
  transcript sheet behind every photo, so the photo omits the solution; a 🖼 images-only PDF
  has no transcript anywhere, so its photos must carry it or the answer is nowhere. (First
  cut suppressed it on the photo unconditionally — which silently emptied 🖼, the button
  Adrian actually presses: 5 of the 6 sample PDFs he sent were images-only.)
  - **Two renders, one grounding pass.** `annotateToBuffer` composites the SAME Gemini
    `annotations` object twice — `buffer` without the 🖼-only footer content,
    `bufferWithSolutions` with it — and `annotateAndUpload` puts both to Blob (`-sol`
    suffix; the timestamp alone can collide on parallel puts). Gemini runs once; the twin
    costs one sharp pass. **Don't "simplify" it into two `annotateToBuffer` calls** — that
    doubles the vision spend on every photo of every paper. What the twin carries beyond the
    plain copy is the **worked solutions** in the footer. (From 2026-07-30 to 2026-08-13 it
    also carried per-question "Where you went wrong" paragraphs — `feedbackEntry`, removed at
    Adrian's call once the side notes were raised to print size: on a one-error question the
    pinned per-part note and the paragraph said nearly the same thing. The transcript sheet
    still renders the paragraph — the 📄 full PDF is unchanged.) The twin is null when the
    solutions list is empty (no wrong final answers → the two images would be identical), and
    on the last-resort margin rung, which has no footer strip.
  - `annotated_photos[]` therefore carries `{ photo_index, url, url_with_solutions, method }`.
    **Which one goes in is `pickAnnotatedPhotoUrl()` (`lib/annotated-photo-source.ts`,
    unit-tested), not an inline ternary in the route** — it is silent in both directions: the
    plain copy in 🖼 mode answers nothing, the twin in 📄 mode answers twice. `url` is the
    fallback everywhere (twin absent, upload failed, or a run marked before 2026-07-29), and
    the route re-fetches `url` if the twin 404s out of Blob.
  - The photo's footer keeps its `solutions` capability for exactly this reason — it is the
    same strip that carries the `question_found` notices and the Marker's-notes spill.
  - The Telegram flow is unaffected — it renders overlay and transcription in parallel and
    sends the transcription first, so its photo passes no solutions (it is the 📄 case). If
    BOTH renderers fail, `structuredMarkingToText` still writes `📖 Correct solution:` into
    the plain-text message: with no picture at all, that text is the only thing that arrives,
    so it does NOT adopt the split.
  - **A THIRD surface must answer the same question before it ships: does a student holding
    only this document learn what the answer was?** If yes it omits the solution, if no it
    carries it. Neither answer is "always".
- Adrian, seeing both for the first time: *"what's really the difference between Marker's notes
  and the transcript? seems duplicated, but each has it's good points"* — keep both, keep the
  split above.
- **The marker's comments on the photo are 0.85× the score-box size, floor 12px** (changed
  2026-07-30; they briefly matched the boxes per Adrian 2026-07-29, but at that size whole
  notes rarely fit a dense page's holes and nearly everything spilled to the footer — Adrian:
  *"make the fonts smaller for corrected lines?"*). Still ONE source: `ai/annotate.js` derives
  `cFs` from `_marginScoreGeom('0/0', mFs).fs`, and `lineH` + the leader-curve threshold
  follow from it.
- **Pages are rotated upright BEFORE marking** (2026-07-30). EXIF rotation only covers phone
  photos; a CamScanner page scanned upside down is upside down in its pixels — it was marked
  inverted with weak tick grounding and stapled inverted into both PDFs. `ensureUpright` in
  `ai/paper-marker.js` runs one tiny vision call per photo (`detectRotation`/`parseRotation`
  in `ai/photo-overlay.js`, unit-tested); only exactly 90/180/270 rotates, anything else
  means leave-the-page-alone — a wrong guess rotates a GOOD page. Failures fall back to the
  unrotated photo.
  - **Every rotation is verified before it ships** (2026-08-20). The detector hallucinated
    270° on an UPRIGHT page (Sophie p8) and the good page was marked sideways — so after
    rotating, `ensureUpright` re-runs `detectRotation` on the rotated copy: a successful
    check that still reports non-zero means the original guess was wrong, and the rotation
    is **refused entirely** (page marked as-is). A failed confirm call keeps the rotation
    (the pre-gate behaviour). Telemetry: `rot_refused: <deg>` / `rot_check: 'unconfirmed'`
    per page in `annotation_debug`.
- **A successful line pass can still leave parts unboxed — on spreads, a region-only
  recovery re-looks per half** (2026-07-30). A null part region sends that part's score and
  diagnosis straight to Marker's notes without placement ever being attempted (the Q5(a)(i)
  case: acres of white space, note still in the footer). On a landscape image, teacher style
  re-asks for just the missing parts per half at full resolution; `applyRecoveredRegions`
  (pure, unit-tested) fills ONLY null bboxes — located regions are never second-guessed,
  invented keys ignored.

**One feedback comment per attempt, not two** (2026-07-29). The marking JSON used to
carry `summary.body_markdown` (rendered on the sheet) *and* `overall_comment` (printed
raw in the results table) — the same judgement written twice, so the wording drifted
between the two surfaces. The bot now asks for `summary` only, spec'd Unicode-only (no
LaTeX), and derives `overall_comment` from it via `plainFromMarkdown()`
(`ai/plain-text.js` in the bot, unit-tested). **Don't add a second free-text summary
field** — a new surface strips the one that exists.

- Order lives in `lib/marked-pdf-order.ts` (`orderMarkedPages`, unit-tested), not in the
  route. Sheets are bucketed by **`photo_index`**, which the mark-paper page must keep
  sending in its `results[]` payload — drop it and every transcript falls to the back
  again (orphans and index-less sheets are appended, never lost).
- **No cover page — the paper total rides on the first marked page** (2026-07-29, Adrian:
  "don't have to put the first page"). `mark-paper-pdf` grows page 1 by a `stripHeight()`
  header band (`addPage([w, h + strip])`, image still drawn at `y: 0`) and stamps a boxed
  red `PAPER TOTAL  x / y` at the **left** of it, student/date muted at the right. (Left
  was originally chosen to keep clear of the bot's hand-circled top-right **page** total;
  that circled total was removed 2026-08-20 — bot `2f40f20` — but the left placement
  stays.) The strip flag is set *before* drawing so a throw can't slide it onto
  page 2, and the single-photo `kind:'image'` path is untouched (one page, one total).
- **Every page is laid out at `PAGE_W = 595` pt, height proportional** — pages used to be
  sized to their own pixel dimensions, so a typeset transcript came out visibly bigger
  than the photo it explained ("why is the transcript larger than the marked page
  itself?", Adrian 2026-07-29). Uniform WIDTH, not uniform A4: letterboxing a landscape
  two-page CamScanner spread into portrait would shrink the working to a band adrift in
  white space.
- **Tall transcript sheets are PAGINATED to A4 at assembly (2026-08-26):** a typeset
  sheet taller than ~1.1 A4 pages is sliced into A4-height chunks BEFORE embedding —
  "fit to page" printing was shrinking a long solution to unreadable. The cut row is
  the whitest raster row near each ideal cut (`lib/pdf-paginate.ts` — `chooseCutRows`
  pure + unit-tested, `sliceTallPng` the sharp wrapper), never mid-text-line, never in
  the top 55% of a chunk. Photo pages are NEVER sliced (cutting a student's page in
  half is worse than any shrink), and any slice failure keeps the tall page.
- **Solution steps share an equals column (2026-08-26):** `lib/solution-align.ts`
  (unit-tested) merges runs of ≥2 equation steps into one `$\begin{aligned}…$` line,
  applied in `render-marking.ts` AFTER `repairMarkingLatex` (alignment decides on
  top-level `=` signs repair may have just un-mangled) — the transcript twin of the
  bot pen footer's `groupAlignedTex`, same qualification rules (whole-line single
  `$…$` run, no `\text{}` LHS, LHS ≤ 26 chars, chains > 34 chars split per equals).
  **Change the numbers in BOTH places or neither.** The template's `STEP_RE` never
  splits inside a block — aligned rows separate on `\\`, the splitter only on `\n`.
- **Branched solutions render as side-by-side case columns (2026-08-26):**
  `correct.solution_branches` (`{before_latex, cases:[{case, steps_latex}],
  after_latex}` — the bot prompt fills it ONLY for genuine 2-3-way case splits: trig
  factorisations, ± roots) renders on the transcript as case columns solving
  downward, the way a student writes `tan x = 1 | tan x = −2`. Gate: ≥2 usable
  cases, else the linear fallback — and `full_solution_latex` is spec'd to stay
  COMPLETE on its own precisely so old renderers/deploy skew never lose steps. The
  photo footer + Telegram text flatten branches into "Case …:" headers via
  `flattenBranches` (bot `ai/solution-entry.js`, tested). `repairMarkingLatex`
  repairs all four branch fields. Related prompt rules (same day): trig solutions
  state the sign→quadrant step with ASTC lettering and keep `x = a or x = b` on one
  line; a new **`astc` margin-diagram kind #9** (bot `ai/margin-diagram.js`,
  `validateAstc` tested) draws the quadrant cross with ticks — quadrants are DERIVED
  from the `{ratio, sign}` conditions, and a contradicting claim kills the figure,
  same philosophy as the other eight kinds.
- **Fonts: the transcript needs explicit symbol fallbacks** — `marking-template.html`
  loads Noto Sans Math + Noto Sans Symbols 2 and lists them *after* Caveat / Crimson Pro /
  JetBrains Mono in every `--font-*` stack. None of the three primaries has `∠ ≅ △ ∴`, and
  the serverless Chromium has almost no system fonts behind them, so plain-text fields
  rendered those as tofu boxes (LaTeX is fine — KaTeX draws its own glyphs). Per-character
  fallback means the Notos only ever supply the missing glyph.
- **`.final-answer` is a flex row whose children need `min-width: 0`** — a flex item
  defaults to `min-width: auto`, so the value collapsed to min-content and a long answer
  wrapped ONE WORD PER LINE in a tall narrow column. The `Answer` label is `flex: 0 0 auto`
  + `nowrap`; the value is `flex: 1 1 auto` + `min-width: 0` + `overflow-wrap: anywhere`.
- **ONE type size for the whole transcript — `--fs-body` (15px)** (2026-07-29, Adrian:
  "all fonts same size in transcript"). The question prompt, the working, the red-pen
  corrections, the answer and the feedback paragraph all read from that variable; only
  scores and label chips keep their own size (circled question number, `[n marks]`,
  the mark total, the score badge, and `--fs-label` 11px mono for `QUESTION`/`ANSWER`).
  **A new transcript element gets `var(--fs-body)`, not a number** — the sheet used to
  span 15–20px and the blocks visibly disagreed about how big the paper was.
  - **`.katex` is pinned to `1.06em`.** KaTeX's own default is `1.21em`, calibrated
    against a 16px UI font; left alone it made every typeset working line a size
    larger than the prose beside it, which is most of what "different sizes" looked
    like. 1.06em keeps maths a hair up (smaller x-height) without reading as bigger.
  - **The question prompt is differentiated by treatment, not by size** — a mono
    `QUESTION` chip (`::before`), the italic, a solid tint and a dark left rule. It is
    the same size as the working by request, so nothing else may carry that job.
- **The final answer is TYPESET, from `student_final_answer.value_latex`** (2026-07-29).
  It was the last raw LaTeX on the sheet — a plain `23.5\text{ g}` on the one line a
  student reads first. `mathify()` adds `$…$` only when the value looks like maths
  (contains `\ ^ _ {`), so a bare `60 g` stays prose instead of being set in math italic;
  the row is built with `textContent` + `data-plain` like the working lines, never
  `innerHTML`.
- **Everything crossed out is PAINTED, not `text-decoration: line-through`** — a wrong
  final answer (`.wrong-answer`) and a working line the student struck through himself
  (`.work-line.struck .line-text`) share one `linear-gradient` stripe rule.
  `text-decoration` does not propagate into KaTeX's inline-block boxes, so the moment
  either was typeset the strike simply vanished and only the fade was left.
  - **The host must be INLINE**, which is why a working line's text sits in a
    `<span class="line-text">` inside the `.line-content` block rather than directly in
    it. An inline box's background is sized from the font, so the stripe lands at strike
    height instead of halfway down a tall fraction, and `box-decoration-break: clone`
    repaints it on every wrapped fragment (without `clone`, one stripe spans the whole
    box). `data-plain` rides on that span too, so the plain-text fallback swap keeps
    the strike. A block host gets one stripe through the middle of the whole box —
    don't move the rule back up.
- **`lib/latex-repair.ts` (`repairLatex` / `repairMarkingLatex`, unit-tested)** runs in
  `render-marking.ts` before KaTeX ever sees the payload. The model's JSON escaping is
  unreliable in both directions within a single paper — `frac{1}{2}` (backslash dropped,
  renders as the letters f-r-a-c) and `\\frac` (doubled, renders as an error) — so the lib
  collapses over-escapes and restores dropped backslashes on a known command list,
  masking `\text{…}` spans so English prose isn't mangled.
- Two more render-side rules that were each a live bug: the payload is injected with a
  **function** replacement (`template.replace(ph, () => json)`) because a string
  replacement expands `$&`/`` $` ``/`$'`/`$1` in a payload that is wall-to-wall `$…$`
  maths; and line content is set with **`textContent`, never `innerHTML`**, because an
  ordinary `$\frac{d^2v}{dx^2}<0$` otherwise opens an HTML tag at the `<` and swallows
  the rest of the line. KaTeX auto-render walks text nodes, so `textContent` is enough.
- Every line carries `data-plain`; after auto-render, any element that errored
  (`.katex-error`) **or was skipped entirely** (no `.katex`, still showing `$`/`\cmd`)
  is replaced by its plain transcription. A reader never sees raw LaTeX. The sweep
  selects on `[data-plain]`, not `.line-content[data-plain]` — the answer spans opt in
  the same way, and so should anything typeset in future.
- No AI attribution anywhere on the sheet — header and footer read "AdrianMath"
  (Adrian's call, 2026-07-28).

**Prompt caching on the question paper (bot, `ai/paper-marker.js`)** — the PDF carries a
1h `cache_control`, but every photo is marked in PARALLEL, so they all raced to *write*
the same prefix: N writes at 2× input price, zero reads — worse than no caching.
`warmPdfCache()` now prefills the entry with one tiny `max_tokens: 1024` call before the
fan-out (skipped for a single photo; failures are logged and ignored). The cached prefix
is **`tools → system → messages`**, so the warm-up must use the same model, the same
code-exec tool, the same system prompt and the same leading `pdfBlock` as
`markPhotoDirect` — change any one of them and the marking calls miss the entry the
warm-up just paid to write. Thinking config is part of that too: it's shared via
`streamOpus`, so don't give the warm-up its own.

Tick/cross rendering on the photos themselves lives in the **bot** (`ai/annotate.js`):
marks are drawn just past `bbox.x2`, centred on the glyph's own optical centre, at
`~0.95 × fontSize`. The old code anchored on `annotationX + fontSize` with a glyph that
extended up-and-right of its anchor, which put marks ~130 px out in the margin.

### Margin layer — the score and the reason, beside the working (bot, 2026-07-29)

Ticks alone don't tell a parent anything. On top of the line marks the overlay now writes,
on the ORIGINAL photo: a **boxed `awarded/max` in the right margin** aligned to the top of
each part's working, and — for parts that dropped marks only — the part's **one-line
`error_summary` placed in real white space** with a leader curve to the crossed step.
Ticks/crosses stay, but they're decoration; the box and the sentence are the product.

- **Side strip (bot `ai/annotate.js`, 2026-08-12): the comment ladder is in-page white
  space → manufactured right margin → footer.** When a part's note fits nowhere on a
  dense page, the canvas now grows a cream strip (26% of width) to the RIGHT and the
  note is written there — captioned (`Q1(a): …`), level with its part, leadered back
  into the page — instead of dropping to the footer. Adrian: *"write the mistakes at
  the side of their working… there are usually no space"* — so the space is
  manufactured rather than shrinking the pen below legibility (that was tried
  30 Jul: 0.85× was the floor). Single-column photos only (on a two-up scan the strip
  is the facing page's margin — those spill to the footer as before, and client-side
  spread-split makes them rare anyway); notes that overflow the strip's height still
  footer. Hi-res composites extend by the same fraction through the existing viewBox
  mapping. Footer lines may now run the widened canvas.
- **One leader arrow per landing spot (2026-08-20, Adrian: "double arrows pointing at
  the same place… it is messy").** Leader endpoints claim a spot in a shared registry
  (`claimLeaderSpot`, 28px radius, first drawn wins) — in-page notes draw before the
  strip, so the nearest note keeps its arrow and a strip note aiming at the same error
  goes quietly arrowless. Targeting also improved: `crossedStep` matching loosened from
  strict containment to ±8px overlap, topmost cross first, so the endpoint lands ON the
  crossed step rather than merely near it.
- **Ruled foolscap: ticks hug the WRITING, arrows land on the MISTAKE (2026-08-23,
  Adrian, Nicole's JC2 practice set: "the marking ticks are on the right again" / "can
  it point at the mistake itself?").** The occupancy grid now carries a second layer,
  `writing` — dark pixels with printed rules masked out (`ruleMask` in
  `ai/whitespace.js`: runs that are long *and thin*, horizontal + vertical, plus a
  fragment pass on the rule's own rows; `writingRaw` is the undilated copy). On ruled
  paper every row's rule runs to the page edge, so the placement layer (which keeps
  rules, so notes never land on one) put every tick in the far margin. `_rightmostInkX`
  scans `writingRaw`, counts only grid rows overlapping the band by ≥ half a cell (a
  bbox overshooting the next line by 2px used to pull that line's first stroke in), and
  given the step's own `{x1,x2}` stops at the first ~5%-of-page gap past `x2` — so a
  part written on the LEFT of a line whose right half holds another part (Nicole's (d)
  beside (c); too few lines for the column detector) is marked after its own writing.
  Leaders: `aimLeader(ink, cross, from)` (pure, tested) resolves the arrowhead from
  the note's position — from the left → start of the expression; level on the right →
  the shaft ARCS over/under the ✗ (`leader(..., via)` control point) and lands a
  quarter-line INSIDE the last symbol; above/below → comes down/up onto the line, a
  quarter-line in (a head stopping at the bbox edge reads as the neighbouring line on
  tight ruling). Strip notes now sit level with the CROSSED line, not the part's top,
  so the hop is short and never slants across the lines (and ticks) in between.
- **The leader is part of the placement: a spot pays per line of writing its arrow
  would cross (2026-08-23, Nicole p.4).** `findSpot` scored on distance alone, so when
  the only free block was the page TOP and the mistake sat at the BOTTOM (blank
  first-derivative table), the note parked above the question and its leader plunged
  through nine lines of her answer. `leaderCrossings` (`ai/whitespace.js`, pure,
  tested) walks the straight spot→anchor line over `writingRaw` (undilated, rules
  excluded — printed rules never count) and counts *runs* of ink, stopping 2 cells
  short of the anchor so the step's own ink is free. `findSpot` takes `crossWeight`
  (added per run, comments use 6) and `maxCross` (hard cutoff): single-column pages
  use `MAX_LEADER_CROSSINGS = 2` in `ai/annotate.js`, so a note whose leader would
  cross three+ lines is no in-page spot at all and goes to the side strip level with
  the step. Two-up scans keep the penalty but not the cutoff — their fallback is the
  footer, further from the mistake than any leader. Score boxes have no leader and are
  untouched. Checked on Nicole's actual hires original (page top → strip beside the
  table); the bot's `tmp/render-nicole-p4.js` fixture is the template for re-checking
  a real page when the stored run has no bboxes (`result_json.results` never does).
- **A part's in-page band reaches its whole territory (2026-08-13, Adrian: "extend the
  band").** The search band for a note used to stop a fixed ~6–8 lines below the part's
  working, so a page with a big empty gap under the working still wrote its note in the
  strip. Now the band extends down to where the NEXT part starts in the same column
  (minus 2 lines, so a note never reads as the next question's) — or the page bottom for
  the last part. `findSpot` still prefers the spot nearest the working, so the far reach
  only gets used when everything beside the working is ink; the strip triggers only on
  genuinely edge-to-edge-full pages.

- **Placement is arithmetic, not vibes** — `ai/whitespace.js` (pure, no sharp, 20 tests)
  thresholds the page to an ink/no-ink grid, dilates by a cell, and searches a summed-area
  table for the nearest free window to the anchor. It counts **dark pixels, never averages
  brightness** (a thin printed rule is a few dark pixels in a bright cell — an average calls
  it empty and the comment lands on the rule). `occupy()` claims every rectangle it uses,
  including the ticks already placed and the top-right corner reserved for the page total,
  so two comments on a page with one big blank area can't stack in the same hole.
  **Nothing is ever drawn over working** — a null occupancy grid means "place nothing",
  never "the page is empty".
- **`findSpot` takes hard `colMin/colMax/rowMin/rowMax` bounds, and the anchor is the
  part's own `bbox.x2` — never the image's right margin** (fixed 2026-07-29). A CamScanner
  two-page spread is ONE image, so its right margin belongs to the *right-hand* page: every
  part's score box landed there in a stack, far from the working it scored, which is what
  Adrian read as "a lot of duplicate marks". The score box now searches a band beside its
  own part (≈0.4%–19% of page width right of `x2`), relaxing through two wider bands before
  giving up; comments search a ≈30% band around the part's vertical extent at three
  wrap widths (26/16/34 chars) — **whole note or nothing**, never a mid-sentence clip.
  The LAST band of each drops the horizontal bound but keeps the vertical one: anywhere on
  the page **at the right height** still reads as this part's, and `findSpot` takes the spot
  nearest the anchor, so it only reaches across when the near margin is genuinely full.
  Without that band a crowded margin sent perfectly placeable boxes to the footer.
- **Every band is a fraction of the part's own COLUMN, never of the image** (fixed
  2026-07-29 — the second half of the same bug). Bounding each box beside its own working
  was necessary but not sufficient: the *unit* was still the image, and on a two-up scan one
  physical page is only ~40% of the image width, so a "tight 19%" band is half a page wide
  and crosses the gutter. Q7(c)'s `1/3` and Q7(d)'s `0/2` were written in the FACING page's
  margin beside Q8 — Adrian: *"the marks 1/3, 3/3, .. placement does not seem accurate"*.
  `pageColumns()` (`ai/whitespace.js`, unit-tested) projects the part bboxes onto the x axis
  and merges overlaps — two physical sheets give two intervals, an ordinary photo gives
  exactly one — and `columnBoundsFor()` returns how far left/right that part may be written,
  **splitting the gutter down the middle**. Fewer than two columns ⇒ full width ⇒ byte-for-byte
  the old behaviour for single-page photos (there is a regression test pinning exactly that).
  Even the last-resort band is clamped to the column: reaching across a gutter is never an
  improvement on the footer strip.
- **EVERY score box is captioned with its part key, `Q` and all** — `Q6(a) 2/2` (2026-07-29).
  It used to be captioned only on the attempts that had drifted, and the caption stripped the
  leading `Q`, so one page came back with `6 2/2`, a bare `1/1` and `(c) 2/2` — Adrian:
  *"sometimes marks are written, sometimes not written. And 6 2/2 is misleading, perhaps
  Q6 2/2"*. A page that captions some boxes and not others reads as two different markers, and
  a bare `2/2` beside one column of a two-up scan belongs to whichever question the reader
  guesses. **Nothing is written uncaptioned to save space**: a box that fits nowhere goes to
  the footer strip, which prints its key beside the score anyway.
  - **The caption is what we KNOW, never what we guessed** (2026-07-29). A part's number is
    taken from its own attempt (`qTag()`), and **nothing is borrowed from a neighbour**:
    `parts` is the whole PHOTO's parts — one contiguous run per attempt, every part stamped
    with that attempt's number (`paper-marker.js`: `{...pt, question: a.question_number}`) —
    so a neighbour carrying a number is by construction a *different question*. The earlier
    "borrow the first number in the array" rule captioned an unmatched attempt `Q3(b) #2`,
    filing a score under a question the student never answered. A null number is information
    (the MATCH step found no printed question), so the key falls back to the part label
    alone — `(b) 3/3` — and the per-question rung likewise stopped keying `Q${index}`, which
    numbered boxes by their position in the photo's list rather than the paper's.
  - **In teacher style the score is written ONCE, by the margin layer.** The per-question
    rung used to put the score in the annotation's `text` too, and a part-marks score renders
    as a `comment` whose text IS the score — so a boxed `Q1 4/5` came back with a bare
    unboxed `4/5` beside it, reading as two different marks for one question. Classic style
    has no margin layer, so there the annotation stays the only place it can go.
  - **The first placement band is level with the part's FIRST line** (`top - 0.6·boxH` →
    `top + 1.2·boxH`). The band below it reaches 40% of the part's height, which on the
    per-question rung — where a "part" region is a whole question — is most of a page: fine
    as a fallback, wrong as a first choice. The point of a margin score is that the eye
    travels straight left from it to the work it scored.
  - **Box geometry is `_marginScoreGeom(text, fs)` — reserve and draw share it**, like
    `_teacherScoreGeom`, and it measures with `textWidth` from `ai/font-metrics.js`. The old
    flat 0.56 em/char guess reserved a box nearly twice Patrick Hand's real width, so adding
    the caption pushed boxes out of margins a bare `2/2` had fitted easily.
  - Bands widen to fit the caption (`max(colW × frac, boxW × 1.2)`) but are still clamped to
    the part's own column — a fixed fraction of a narrow two-up column is less than the label,
    so a purely fractional reach would send every captioned box to the footer.
- **The red-pen redesign (2026-08-26, all four options picked off the "Red Pen
  Options" mock artifact; teacher style only, display-only — no marks arithmetic
  anywhere):**
  1. **Score rail** — every part's score box goes in ONE column down the right edge
     of the part's own COLUMN (never the image's edge: a two-up scan's right margin
     belongs to the facing page), level with the TOP of its part — the printed
     question line where the page has one (Adrian: "can the mark sit level with the
     question itself? easy to see"). Boxes STACK when parts crowd (`railBottoms`
     per column); occupancy still rules — an inked rail spot nudges down, then
     slides up to half a box left, then falls to the footer as before. This
     REPLACED the five-band white-space hunt that scattered boxes over dense pages;
     do not resurrect scattered placement as a "smarter" fallback.
  2. **Two-colour ink** — verdicts/scores/ticks stay `TEACHER_RED`; the teaching
     layer (in-page diagnosis notes, side-strip notes, ✱ study notes, their
     leaders, the correction text beside a cross, inline worked solutions, margin
     figures) writes `TEACH_BLUE`. The footer strip stays red on purpose — it is
     the overflow area, and a two-colour footer read as a third voice.
  3. **Quiet full marks** — a full-marks box recedes (0.87× size, 0.6× ink) so the
     eye lands on the parts that lost marks. Reserve and draw share the geometry.
  4. **SEAB codes** — the prompt produces per-part codes (`parts[].scheme`) AND
     per-line tags (`lines[].scheme_code`, the line where each mark is decided).
     `ai/line-codes.js` (pure, tested) picks the surface per attempt,
     ALL-OR-NOTHING: tags that reconcile exactly with the parts' schemes ride the
     ticks (`✓ M1`, small and raised, Kimi's placement — Adrian: "shouldn't the
     B1 M1 part be beside the ticks?") and the box drops to score-only; anything
     less keeps every code on the box as a second line (`schemeCodes()` in
     `ai/annotate.js`, token-validated; a spilled score carries them to the footer
     as `1/2 · M1 A0`). Half-and-half — some codes on ticks, the rest on the box —
     is the one output it refuses: it reads as two markers.
  Classic style has no margin layer — untouched throughout.
- **The 26 Aug calibration batch (bot `b4b4222`)** — fourteen rules from Adrian's
  page-by-page review of linjie's marked P1: generous-'correct'/stingy-'neutral'
  verdicts (tickless sound working was 'neutral' by drift); a PRINTED-MATHS PARSE
  GUARD (radical/bracket extent read from the paper's typesetting; a student answer
  exactly matching an alternate parse flags low-confidence instead of teaching the
  marker's parse as fact); geometry reasons recalibrated (only NAMED properties need
  the bracketed quote — basic angle arithmetic never costs a mark); pedagogic notes
  (corrections DERIVE with computed values); per-feature sketch crosses + shape
  quality assessable + Venn diagrams marked per placed number; bearing-figure nudge;
  **green-pen correction detection, FLAG-FIRST** (`correction_pass` on the attempt →
  triage flag "marked as submitted X/m; original ink would score Y/m" — marks
  unchanged until the detection proves reliable); ≈ joins the equals-alignment
  column (bot `pen-math` + site `lib/solution-align.ts` — mirrored, change both or
  neither); inline blank-space solutions try three shrinking fits before the footer;
  **tick coverage** measured per page (`annotation_debug[].coverage {wanted,placed}`)
  with a review note naming thin pages as a grounding symptom (re-shoot/re-mark),
  never skipped marking. Same evening (bot `37db976`): **margin-diagram kind 10,
  `construction`** — perpendicular/angle bisectors drawn dashed WITH compass arcs;
  the marked equidistant point is COMPUTED (intersection of the first two perp
  bisectors, parallel refused, third-bisector concurrency checked; test pins the
  circumcentre of A(0,0) B(8,0) C(3,5) at exactly (4,1)) — and the Venn rule
  refined: individual crosses on wrong placements only, ONE generic tick when the
  whole diagram is correct.
- **A WORKING-ONLY page is marked against a reconstruction, and must say so** (2026-07-29).
  With no question paper attached, the bot uses `STANDALONE_MARK_SYSTEM` — "the printed
  question and the working are BOTH on this page". A continuation sheet or graph paper has
  no printed question at all, so the model reconstructs the task from the working and marks
  against that; the per-part `max` is then **its own allocation, not the paper's**. That is
  a fine thing to do and an unacceptable thing to do silently: `match_confidence` was tied
  only to "partly cut off or blurred", so such a page came back looking exactly as
  trustworthy as one marked off a printed question (Adrian, Jul 2026: *"how does the marker
  know to mark question 1 when no question is provided?"*). **Mark it anyway — and disclaim
  it where it can't be missed** (Adrian: *"the marking can continue, just put a disclaimer
  that there is no question found"*).
  - **`question_found` (per attempt, defaults true)** is the flag: false ONLY when there was
    no question to read — not on the paper, not printed on the page. **A missing question
    NUMBER is not a missing QUESTION** — students routinely leave working unnumbered, and
    the prompt says so explicitly, or the marker starts disclaiming ordinary pages.
  - **The disclaimer is written on the annotated PHOTO**, at the top of the footer strip
    above "Marker's notes" (`formatQuestionNotices` in `ai/annotate.js`, unit-tested,
    threaded through `annotateAndUpload`/`annotateToBuffer` as `notices`). It goes there
    and not only in the results panel because the photo is the one surface that survives
    into 🖼 images-only mode. The last-resort margin rung carries no footer at all, so it
    can't carry this either — only the ⚠ line does there.
  - **The allocation sentence is ours, verbatim, every time**; the model's `match_note` is
    APPENDED for what it inferred the question to be, never substituted for it.
  - **An unnumbered block is located by the model's own `region`** ("The working at left
    column, top") — a page can hold a working-only block above an ordinary printed
    question, so "this page" would disclaim the wrong half.
  - The ⚠ `review_reasons` line distinguishes *no question found* (a fact about what the
    marker had) from *match was uncertain* (a blurry scan). **Any new "the marker had less
    to go on than usual" case belongs in `match_note` + low confidence, never in silence.**
- **A photo with NO ticks on it fell to the coarse rung — and `/admin/mark-paper` now says
  so.** The overlay ladder in `ai/photo-overlay.js` tries per-LINE marks first
  (`geminiLineMarks`); its placement guards cull boxes that are too tall, out of reading
  order or duplicated, and when they cull more than they keep it **throws**, dropping the
  page to `geminiQuestionMarks` — one coarse mark and a boxed score per question, no
  per-line ticks. That is a grounding failure on dense, slanted or two-page-per-photo
  working, **not** a marking failure: the marks are identical either way. The method rides
  back on `annotated_photos[].method` (`'line' | 'question' | 'margin'`), and the results
  panel prints an amber note naming the photos that came back coarse, so "the marker
  skipped my page" is legible as "re-shoot that page straighter". Adrian, Jul 2026: *"some
  questions there are no ticks, is it because the working is too messy?"*
  - **Two-up spreads get a per-half retry before falling coarse** (2026-07-30). The
    pipeline caps photos at 1600px (`normalizePhoto`), so a CamScanner two-page spread
    gives each physical page ~800px — too coarse to box dense working, which is why neat
    pages were losing their ticks (Adrian: *"it is not too messy"* — correct; the layout
    was the problem). When the line pass fails on a **landscape** image (`w > h*1.15`),
    `geminiLineMarksSpread` cuts at the gutter and re-runs each half upscaled to 1600px;
    `mergeSpreadHalves` (pure, unit-tested) shifts boxes back by the crop origin, dedupes
    cross-half line matches (left page wins), and upgrades null part regions when the
    other half found them. A sideways single page self-limits (every line straddles the
    cut → both halves empty → same fall-through as before). On success `method` stays
    `'line'` — the amber note keys off it. Cost: two extra grounding calls, only on
    already-failed landscape pages.
- **Verifying placement locally is misleading** — Patrick Hand is not installed on a Mac, so
  librsvg substitutes a wider sans and every pen line renders ~35% wider than
  `ai/font-metrics.js` measured it, overflowing bands that fit on Fly. Check the *placement*
  (which column, which side of the gutter) locally; do NOT chase apparent overflow. Real
  widths need `fly ssh console -C fc-list | grep -i patrick`.
- **Nothing that doesn't fit is lost — it spills to a footer strip.** Parts with no room,
  and parts Gemini couldn't locate at all (carried through `geminiLineMarks` with
  `bbox: null` instead of being dropped), collect in `spill` and print under
  **"Marker's notes:"** in the strip below the page, under the `question_found`
  notices. The strip is unconditional now, so a dense scan comes back with its
  diagnoses rather than a page of bare ticks. Whether it also carries the worked solution
  depends on which PDF this copy is destined for — see the photo-vs-transcript table above;
  `createAnnotatedImage`'s `solutions` array is filled on the 🖼 twin and empty on the 📄 one.
- **ONE spill entry per part.** The score box and the comment are placed independently, so
  both can fail; pushing at each failure site printed the same part's note twice under
  Marker's notes. The loop accumulates `spillScore`/`spillNote` and every exit from the
  iteration routes through a single `flush()` — **never add a bare `spill.push`**.
- **The red pen writes real mathematics: `$…$` is TYPESET, not transliterated**
  (`ai/pen-math.js`, unit-tested). librsvg does no per-glyph fallback and Patrick Hand
  carries Latin-1 and little else, so symbols either drew as tofu boxes or had to be spelled
  out by `penSafe()` — which is how the footer solutions came back as `v = ds/dt = kpi
  cos(pit)` and `18.964 ~= 19.0` (Adrian, Jul 2026: "able to write the mathematical
  notations latex style?"). Maths now goes through MathJax via `ai/figure-tex.js` and is
  emitted as **flattened SVG `<path>` data** — no installed font involved, identical in
  sharp and in a browser, with real fractions, radicals, superscripts and Greek.
  - **A worked solution is split into steps by `splitTexLines`, NEVER by `/\\n|\n/`**
    (2026-07-29). A literal backslash-`n` is also the opening of `\ne`, `\neq`, `\nabla`,
    `\not`, `\nu`, `\ncong` — the naive regex tore `6>0\neq 0` into `6>0` and `eq 0`, and
    both fragments then printed as raw LaTeX because neither parsed. The lib breaks on a
    literal `\n` only when what follows **cannot** be a command name (`/\\n(?![a-zA-Z])/`);
    the model double-escapes its separators often enough that plain `\n` must keep working.
    Named regression test in `test/pen-math.test.js`.
  - **Consecutive equation steps share an equals column** — `groupAlignedTex` merges a run
    of ≥2 genuine steps into one `$\begin{aligned}…\end{aligned}$` block (MathJax accepts
    it through `texBlock`). A step qualifies only if the whole line is one `$…$` run with a
    top-level `=`, no `\text{…}` on the left, and a short LHS — otherwise "At $x=-0.1$ the
    gradient is…" would stack the word "At" over a fraction. **An aligned block cannot
    word-wrap**, so a group too wide even at the font floor falls back to its own rows
    (`part.rows`, not a re-split of the source — re-splitting duplicated every earlier group).
  - **Chained lines are split into a column before aligning** (2026-08-20, Adrian: the
    footer solutions "kept writing continuously especially using the long double arrow
    sign (⟹), which makes it hard to read"). `splitStepChain` breaks a single-math-run
    line at depth-0 `\Rightarrow`/`\implies`/`⇒`/`⟹` (dropping the arrow — the stacked
    column already means "hence") and at `\therefore`/`∴` (kept as the next line's
    opening); braces protect `\text{…}` and command names (`\Rightarrowx` never matches).
    `alignedRowsForStep` then breaks a long `a = b = c = d` line (> 34 TeX chars) into
    `&=` continuation rows so the whole chain reads down one equals column, each row with
    a self-standing raw fallback. The marking prompt now also tells the model to author
    one manipulation per line, transforming the WHOLE equation board-style (take lg of
    both sides, …) — the split is the safety net, not the plan.
    The website mirrors the chain-split since 2026-08-20: `lib/latex-repair.ts`
    `splitStepChain` (unit-tested) runs inside `repairSolution`, AFTER `repairLatex` —
    repair restores a dropped backslash on `Rightarrow` and `$`-wraps bare-maths lines,
    both of which the scanner needs. `marking-template.html` needs no copy of its own:
    it re-splits on the real newlines `repairSolution` already emitted. (Its plain-text
    step pairing goes `null` when the counts diverge — the safe direction.)
  - **The footer is set at `0.72 ×` the mark size, not `1.05 ×`.** It is read, not glanced
    at; at the old size it was the loudest thing on the sheet and pushed a long solution
    onto a second screen (Adrian, Jul 2026).
  - **The split is per LINE, not per run.** A line with no maths is hand-written in the pen
    (most margin comments, every heading); a line containing any `$…$` is typeset WHOLE,
    prose included. Mixing `<text>` and `<path>` on one line means positioning the paths by
    summing *estimated* text widths while librsvg does the real shaping (kerning and hinting
    are not in the advance table), so the failure mode is prose written **on top of** a
    fraction. Rendering `so $r = 5$ not $8$` both ways settled it — mixed runs printed
    `r = 5not 8`. **Don't reintroduce per-run mixing.**
  - Prose inside a typeset line keeps `∠ ≅ ≈ → ∞ °` as written (MathJax draws them); only
    the pen path still transliterates via `penSafe()`. TeX specials are escaped by
    `texEscapeText` — every form was probed against `figure-tex` first, because MathJax has
    no `\textasciitilde`/`\textbackslash` and a bare `~` silently becomes a space.
  - `ai/font-metrics.js` reads **real advance widths** from the vendored
    `assets/fonts/PatrickHand-Regular.ttf` (mean 0.423 em, glyphs 0.224–0.68). The old flat
    0.5 em guess measured every pen line ~18% wide, which decides whether a margin comment
    fits the hole it was placed in. Falls back to a mean constant if the file can't be read.
  - Pen `<text>` carries `xml:space="preserve"` — SVG otherwise strips a run's leading and
    trailing spaces, the only thing separating it from what follows.
  - `figure-tex` costs ~47 s to require on a cold filesystem (~120 ms warm), so `pen-math`
    loads it **lazily**, like `ai/figure-engine.js`. Requiring it at module load stalls the
    first marking request after a deploy.
  - Degradation is layered: bad TeX retries transliterated, then falls back to per-run
    drawing, then to plain pen prose — a lost fraction beats a lost sentence. The model
    writes the worked answer into `correct.full_solution_latex` (one `$…$` step per line);
    the old `full_solution_plain` is still read as a fallback.
- **The circled page total is GONE (2026-08-20, bot `2f40f20`)** — Adrian: "don't put the
  overall mark for each page… only provide the marks for each question". The per-part
  boxes grew 1.2× to carry the weight; margin comments were compensated so only the boxes
  changed size. Do not resurrect the ellipse as a "missing total" fix — the paper total
  rides the Telegram caption, the PDF header strip and the transcript. The same commit:
  blank-space solution blocks at 0.85× of their old size, leader arrows launch from the
  note edge FACING the target (the tail used to cross the note's own words), a
  `saysTheSame` token-overlap gate drops `* study notes` that restate the diagnosis
  (one mistake = one note, blank space preferred over the strip), level-conditional
  rejection reasons (Sec bare "(rej)" is full credit; JC needs the cause), geometry
  alternative-route leniency (true cited facts + a valid named test = full marks even if
  the marker solved it another way), FULL-MARKS/CROSS consistency (no ✗ inside a part
  awarded its max), and `solutionEntry` now owes the worked solution whenever a part
  LOST marks, not only on final-answer mismatch (proof parts scoring 0 got nothing).
- **Part regions are matched by KEY, never by array position** — Gemini silently omits parts
  it can't find, so an index match attaches the comment to the wrong working. `paper-marker`
  carries `question_number` onto each part so the key is `Q8(i)`, not `(i)` (a page with two
  questions has two of each label), and `photo-overlay` disambiguates a repeat with `#2`.
  `question_number` is spec'd in the prompt as the paper's **top-level** number only, but
  the model still answers `(b)` or `8(b)-(c)` often enough that `photo-overlay` also takes
  the **leading integer and nothing else** (`String(p.question).match(/\d+/)`) — the raw
  value printed keys like `Q(b)-(c)(c)`. A key is a label: tidy beats faithful.
  The keying and the matching are the pure, exported, unit-tested `buildPartKeys()` /
  `matchPartRegions()` in `ai/photo-overlay.js` (`test/part-keys.test.js`) — don't re-inline them.
- **ONE region per part key** — `matchPartRegions` keeps the FIRST box and drops repeats.
  Gemini boxes the same part twice when its working continues down the page, and the renderer
  draws one score box per region, so a page came back with `Q7 3/4` *and* a stray `3/4`
  stranded wherever the first hadn't already claimed space (Adrian's photo, Jul 2026). First,
  not last: regions arrive in reading order, so it sits at the top of that part's working.
- **A wrong part is answered in EVERY style — the only question is which surface.**
  `error_summary` is REQUIRED (non-null, one sentence, plain Unicode) on every part below
  max, and the worked solution is written whenever the final answer is wrong. Teacher style
  used to suppress the solution on the theory that per-line corrections said enough; a
  per-line fix says which STEP broke, not what the answer was.
  - **WHEN it is owed is `solutionEntry(marking, label)` in `ai/solution-entry.js`, and
    nowhere else** — a pure, exported, unit-tested rule. It lives in its own module because
    `photo-overlay` requires `annotate`, so hosting it in either would be a cycle. It was
    written out twice once before and the copies drifted (the Telegram one kept a
    `style !== 'teacher'` guard after this page dropped it, so the DEFAULT style answered
    nothing). **Style is deliberately not a parameter**: there is no style in which a wrong
    answer should go unanswered, and a caller that cannot pass one cannot suppress it again.
  - Two callers: `structuredMarkingToText` in `ai/annotate.js` (the plain-text Telegram
    message sent when BOTH renderers failed) and `markPhotoDirect` in `ai/paper-marker.js`,
    which builds the per-photo `solutions` array for the 🖼 twin. The transcript doesn't
    consult it — it prints the solution unconditionally when the field is present.
  - **An absent `matches_correct` is UNJUDGED, not wrong** — it's routinely missing when
    there's no single final answer to compare (a "show that" part). The gate is
    `=== false`; `!matches_correct` would print a model solution beside correct working.
- **Worked-solution steps split on `SOLUTION_STEP_RE`, mirrored in three runtimes** —
  `lib/latex-repair.ts` (the repair pass), `public/marking-template.html` (`STEP_RE`, the
  browser) and the bot's `splitTexLines` (`ai/pen-math.js`). The model separates steps with
  a literal backslash-`n`, which is also how `\ne`, `\neq`, `\nabla`, `\not`, `\nu` open —
  so the break is judged on the FIRST character (not a lowercase letter), with an explicit
  exception list for the only commands that continue in caps:
  `Rightarrow|Leftarrow|Leftrightarrow|VDash|Vdash`. Refusing every letter was the earlier
  rule and it merged steps: a sheet came back with a visible `\nAt` mid-solution. Change one
  copy and you must change all three; both repos have named regression tests.
- ⚠ **`src/lib/latex-repair.ts` reads as binary to `grep`** — its mask sentinel uses
  non-printing characters, so a plain `grep` silently finds nothing in it. Use `grep -a`.
- **Vision model list** — `GEMINI_VISION_MODELS` (code default
  `gemini-3.1-pro-preview,gemini-2.5-pro`; the Fly secret was set to
  `gemini-3.1-pro-preview,gemini-2.5-pro,gemini-2.5-flash` on 2026-08-20 after two
  papers hit the shared 1000-req/day gemini-2.5-pro Tier-1 cap and came back tick-less)
  is tried in order, falling through on a
  404/unsupported — and, since 2026-08-10, on a PERSISTED 429. A 429 first retries the
  SAME model honouring Google's own suggested delay (+jitter, 2 tries, ≤30s each) before
  falling through: each model id has its own requests-per-minute bucket, so the second
  model's quota is idle exactly when the first is saturated. Born from isabelle's 17-page
  scan (10 Aug 2026): pages are marked in parallel, so ~38 grounding+rotation calls hit
  the 25/min cap, and 8 CLEAN pages fell past BOTH Gemini rungs to the bare margin rung —
  no ticks, no comments, no solutions footer — because the instant question-rung retry
  ran into the same wall Google had said to wait ≤21s for. Any other error still throws
  so the ladder steps down; do NOT blanket-retry real grounding failures. **Prevention
  layer (same day):** `visionThrottle()` paces every Gemini call START (retries included)
  through a rolling-minute token bucket — `GEMINI_RPM_BUDGET`, default 20 vs the 25/min
  cap — so the burst never forms; a ≤20-photo paper is unaffected (first 20 tokens are
  free). Concurrency caps alone can't bound RPM (8 concurrent 7s calls ≈ 68 starts/min).
  Rotation checks, spread retries and `vision-extract.js` all ride `visionGenerate`, so
  one bucket covers the whole process.
- **Font: Patrick Hand** (SIL OFL, vendored at `assets/fonts/`), installed system-wide by the
  Dockerfile via `fc-cache -f`. sharp draws SVG text through librsvg → fontconfig, so a face
  sitting in the repo is invisible to it and every annotation silently falls back to DejaVu
  sans. Verify after a deploy with `fly ssh console -C fc-list | grep -i patrick`.
  (The typeset transcript sheets are unrelated — they're Puppeteer/webfont and still Caveat.)

### Margin diagrams — verified figures on marked pages (bot, 2026-08-20)

The marking model can attach an optional `diagram` spec to any attempt's
`marking_output` (see DIAGRAM RULES appended to `MARK_JSON_SPEC` in
`ai/paper-marker.js`). The spec carries **givens only** — labels, exact
probabilities, angles, bearings, curve parameters, interval endpoints — never
pixel coordinates. `ai/margin-diagram.js` (engine + gates, 52 unit tests in
`test/margin-diagram.test.js`) validates it, constructs the figure
deterministically, and **refuses to draw anything it cannot prove
consistent** — "models author, deterministic gates verify"; a wrong diagram
on a marked script is worse than none, so every gate fails closed to "no
figure" (a `console.warn` with the reason, nothing on the page).

- **Families (seven):** `kind:"tree"` (probability tree: ≤3 stages, 2–4
  branches per node, ≤12 leaves, optional stage headings + highlighted
  root→leaf paths), `kind:"sector"` (circle sector/segment: shading, chord,
  radii ticks, angle/radius/arc/vertex/end labels), `kind:"bearing"` (chain of
  ≤3 legs, each `bearing_deg` 5–350 clockwise from north; dashed north arrows,
  nested clockwise arcs and 3-digit bearing text all renderer-drawn; optional
  dashed `connect` lines; "(not to scale)" note auto-added when distances are
  unknown or badly out of proportion), `kind:"graph"` (sketch of 0–2 curves —
  line / vertical line / parabola by roots or vertex form — with 0–6 marked
  points; all numbers exact strings like `"3/2"`, den ≤ 1000, |val| ≤ 500;
  since 2026-08-20 curves are optional, so plot-the-vertices coordinate
  sketches work — 3–6 points with `polygon:true` join in listed order and
  `shade:true` fills at 0.13 opacity; crossing vertex orders, duplicate
  vertices, and shade-without-polygon all refuse) and
  `kind:"number_line"` (1–3 intervals/rays with open/closed endpoint circles,
  auto-stacked on lanes when they overlap, ≤4 extra marks) and `kind:"circles"`
  (2026-08-20, Adrian's hand-drawn Q4(c): **exactly two circles** by exact
  centre + radius; the renderer derives EVERYTHING else — line of centres,
  radius labels, gap ticks, the relation decided in exact arithmetic on d² vs
  (r₁±r₂)² (external / tangent / intersect / internal), and two working lines
  under the figure: `$C_1C_2 = \sqrt{d²} ≈ …$` plus the relation's consequence
  (e.g. "shortest distance between the circles = √157 − 5 − 7 ≈ 0.530", 3 s.f.
  via `approx3`); refusals for concentric, identical, or so disparate the
  smaller circle would draw < 0.9 fs; centre labels carry a TeX `\ ` so a
  subscript-free `A(0, 0)` never trips pen-math's currency-dollar prose guard)
  and `kind:"circle_theorem"` (2026-08-20, the Tier-2 "small geometry kernel":
  the model places 2–7 single-capital points ON a unit circle by exact position
  angle (degrees anticlockwise from east, ≥10° apart) and lists segments
  between them and/or `O`; tangents either carry labelled `ends` or an
  external `meet` point the renderer computes as the pole of the chord of
  contact (refused if parallel or > 3.2 radii out); the engine then **measures
  every numeric angle claim back from the actual construction** — a claimed
  angle off by more than 0.25° kills the whole diagram, values > 180° check as
  reflex and draw the long-way arc, `right_angles` must measure 90° and render
  as squares; both rays of any angle must be drawn geometry; letter labels
  like `x` skip the numeric check but still require drawn rays).
- **Renderer-owned labels** kill the contradiction surface: bearing text is
  formatted from `bearing_deg`, graph equations/intercepts/vertex are DERIVED
  from the exact params (a model-supplied point label that disagrees with the
  point is a refusal), number-line tick labels come from the parsed rationals.
  Coordinate pairs are emitted as `$\left(…\right)$` so pen-math's currency
  heuristic always typesets them as maths.
- **Gates:** sibling probabilities parsed as exact fractions (decimal strings
  digit-exact, never floats) and must sum to **exactly 1** per node; highlight
  paths must trace existing labels root→leaf; sector `angle_deg` range-checked
  (5–340°) and cross-checked against `angle_label` in degrees, plain radians or
  aπ/b radians (symbolic labels skip the check); bearing legs must chain from
  already-placed points, distance labels must agree with `distance`, and the
  placed chain is measured back to 0.01°; graph consistency is all exact
  rational arithmetic (roots ↔ vertex derivation, integer-sqrt root recovery
  from vertex form, on-curve verification of every marked point, refusals for
  y=0 / x=0 / a=0 degenerate "curves"); number-line endpoints must satisfy
  from < to exactly, and tick labels that would collide refuse the figure
  rather than overlap; every family's constructed geometry is measured back
  before shipping (tree x-monotone along every branch, arc endpoints on the
  circle, graph transform inverted onto every feature); scale-to-fit refuses
  below 0.55× ("too large to fit legibly").
- **Collision-aware placement:** graph tick labels, `O`, point labels and
  equation labels are placed by scored candidates (rectangle-distance to every
  drawn curve sample, penalties for overlapping other labels or straddling an
  axis) — a root tick sits where the curve crosses the axis and a y-intercept
  tick sits ON its line, so the conventional spot dodges when occupied.
  Bearing point names dodge the whole swept bearing wedge (arcs, arrowheads
  and bearing text live inside it).
- **Rendering/placement:** the engine returns an SVG `<g>` fragment drawn with
  the same pen-math/Patrick-Hand/TEACHER_RED stack as every other annotation, so
  the hires viewBox re-render scales it for free. `annotate.js` places it into
  the question's own blank space through the existing occupancy grid (same
  column-territory rule as blank-space solutions); no room → a bold
  `Figure — Qn:` row in the footer strip. Both annotated variants (plain 📄 and
  🖼 `-sol`) carry it — a figure is a correction, not a duplicate solution.
- **Cost:** the spec rides the existing marking call (no extra model call); the
  DIAGRAM RULES live inside `MARK_JSON_SPEC`, which both `DIRECT_MARK_SYSTEM`
  and `STANDALONE_MARK_SYSTEM` share, so the cache-warm invariant holds.
- **Files (bot repo):** `ai/margin-diagram.js`, `test/margin-diagram.test.js`;
  wiring in `ai/paper-marker.js` (spec + per-attempt collection),
  `ai/photo-overlay.js` (pass-through), `ai/annotate.js` (build + place +
  footer fallback).
- **Deploy status:** first six families LIVE on Fly as of 2026-08-20. First
  five shipped in bot commit `5f2dad5`; the `circles` family + the 20 Aug
  fixes (rotation verify gate, ⟹-chain footer alignment, leader dedup,
  board-style solution rules) shipped in bot commit `074f415` after Adrian
  sample-approved all three renders. Both deploys went out with the marking
  queue empty; Patrick Hand verified present post-deploy each time
  (`fly ssh console -C fc-list | grep -i patrick`). The graph polygon
  extension + `circle_theorem` (bot `541f1c6`) and the chloe St Theresa
  feedback batch (bot `2f40f20` — page-total removal, 1.2× part boxes, arrow
  launch fix, note dedup, Sec "(rej)" convention, geometry leniency,
  full-marks/cross consistency, solutions owed on any lost marks) **shipped
  together 2026-08-20** on Adrian's "deploy both" — queue empty at deploy,
  Patrick Hand verified, bot serving 200 post-deploy.
- **2026-08-21 batch (bot `6158483`…`f3dd819`, 11 commits)** shipped on
  Adrian's "go ahead" via the GitHub Actions deploy (local flyctl auth
  expired; push = deploy). Last marking run 2¼ h old at push. Contents:
  explanation-mark strictness (#5) + phantom-skip fix / coverage floor (#9);
  tick/leader/correction placement (#4, #7 — ink-hugging ticks, leader aim,
  correction anchored at the error); missed-page keep-instead-of-drop;
  spread fixes (uneven-columns false-split guard + overlapped-sheets vision
  escalation — no-gutter pages ask Gemini "one sheet or two?", trust only
  the binary verdict, cut at the CV weak valley); **8th diagram family
  `sign_table`** (ruled first-derivative table, ONE point per table, header
  $5^-$|$5$|$5^+$ per Adrian's board convention — nature verified against
  the sign pattern, tangent row derived); **per-feature sketch marking**
  ("Sketch: "-prefixed lines[] entries per assessable graph feature;
  overlay boxes the feature patch, sketch-aware placement guards in
  `filterLineBoxes`). Suite 417 green at deploy. Everything in this doc is
  now LIVE on Fly.

### "This page could not be auto-marked" — what it means now (bot, 2026-08-22)

The amber banner page (annotated photo `method:'unread'`, the rescue worked
solutions printed in the footer) appears only when BOTH reads of a photo return
zero attempts. Adele's JC1 series page (22 Aug 2026) showed that this is not
necessarily an unreadable photo: the model had marked it fully (Q1 7/9, Q2 5/6,
`end_turn`) but dropped the one `}` closing `"correct"` after the long
`full_solution_latex`, so strict `JSON.parse` discarded the whole response on both
reads. The bot now parses every marking response through a deterministic repair
gate (`ai/json-repair.js` — escape repair → structure repair keyed on which object
each marking key lives in; `restoreControlEscapes` undoes `\right`→CR+`ight`
casualties), so that slip yields the real marks. Fly logs say
`[paper] JSON repaired (<stage>)` when it fired and
`[paper] page N read empty: stop=… out=…tok parsed=…` when a page still came back
empty — grep for the latter before assuming a photo is genuinely illegible.

The rescue solutions themselves used to be rendered raw: literal `**bold**`, `\to`
printed as "/to", `\[ … \]` display maths drawn in the pen font, and labels
"QQ1" (the model wrote "Q1", the footer prefixes "Q"). The rescue prompt now
demands the same one-`$…$`-step-per-line contract as `full_solution_latex`, labels
are bare numbers (a leading Q is stripped regardless), and the footer typesets
solution text through `repairSolutionText` (strips markdown, normalises display
delimiters, wraps bare LaTeX runs, TeX → `repairLatex` / prose → `repairPenText`
per line). Papers marked before this deploy keep their stored annotated photos —
re-mark (✍️ from /admin/papers) to regenerate a banner page.

## AI Marking PNG Renderer

**Route:** `POST /api/render-marking`

Accepts a structured marking JSON payload from the Fly.io bot (Stage B.1a) and returns a typeset PNG image — a handwritten-style red-pen correction sheet rendered via Puppeteer.

**Auth:** `x-render-secret: <RENDER_MARKING_SECRET>` header. Validated against `process.env.RENDER_MARKING_SECRET`.

**Request body shape:**
```ts
{
  marking: MarkingOutput;          // structured marking JSON from bot AI step
  student: { name: string; level: string };
  timestamp: string;               // ISO8601, shown in header
  diagram_crop_data_url?: string;  // base64 data URL, embedded if has_diagram=true
}
```

**Response:** `200 image/png` on success; `401`/`400`/`500` JSON on error.

**Implementation:**
- `src/lib/render-marking.ts` — Puppeteer browser singleton + `renderMarkingPNG()`, same pattern as `generate-pdf.ts`
- `public/marking-template.html` — self-contained HTML+CSS+JS template; receives payload via `<script type="application/json">` placeholder; builds DOM and calls KaTeX auto-render client-side; sets `window.__katexRendered = true` when done
- Puppeteer waits for `__katexRendered` then screenshots `.container` at 2× device pixel ratio

**Visual aesthetic:** Warm off-white ruled paper, Crimson Pro body, Caveat cursive red-pen corrections, JetBrains Mono meta labels. Red circle around question number (−3° rotation). Per-line tick/cross, inline corrections with arrow, struck-through wrong answers, Caveat correct answer written alongside.

**Local test:** `curl -X POST http://localhost:3000/api/render-marking -H "x-render-secret: test" -H "Content-Type: application/json" -d @src/lib/fixtures/sample-marking.json --output marking.png && open marking.png`

**Known cold-start latency:** First request after deploy takes 5–15 s (Chromium download + launch). Subsequent warm requests: 1–3 s.

**Bot wiring:** Stage B.1c (not yet implemented). The bot will call this endpoint after the AI marking step and upload the PNG to Vercel Blob.

## Batch Marking

Three-endpoint architecture, client-orchestrated, stays within Vercel Hobby 60 s limit.

### Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/mark-batch/init` | GET | Student list for dropdown |
| `/api/mark-batch/init` | POST | PDF/image splitting + Gemini region detection → batch record |
| `/api/mark-batch/execute` | POST | Mark each detected region (Claude Sonnet + Gemini annotation) |
| `/api/mark-batch/assemble-pdf` | POST | Stitch annotated pages into PDF, update batch status → `finalized` |
| `/api/mark-batch/list` | GET | Batch list for landing page (`?status=to-mark\|marked\|all`) |
| `/api/mark-batch/get` | GET | Single batch + submissions for detail page (`?batchId=...`) |
| `/api/mark-batch/submissions` | GET | Submissions for a batch (used internally) |
| `/api/mark-batch/delete` | POST | Soft-delete a batch (sets Status=deleted) |
| `/api/mark-batch/upload-amended` | POST | Upload amended PDF → overwrites Final PDF URL |

### Tab filter semantics

- **"To be marked"** tab (`?status=to-mark`): `detected` + `marking` only — not yet AI-processed
- **"Already marked"** tab (`?status=marked`): `marked` + `finalized` — AI has marked; PDF may or may not be assembled
- `marked` = AI marking done, no PDF yet; `finalized` = PDF assembled, downloadable

### UX flow

1. Upload PDF → Gemini detects question regions → batch record created (`detected`)
2. Click "Start marking" in upload flow OR batch detail page → execute endpoint runs → status → `marked`
3. "Already marked" tab now shows the batch
4. Click into batch → review annotated gallery → click "Save as marked (assemble PDF)" → status → `finalized`
5. "Download PDF" appears on finalized batch detail page

### Init endpoint — POST /api/mark-batch/init

**Auth:** `Authorization: Bearer ADMIN_PASSWORD` (same as all admin routes).

**Request:** `multipart/form-data`
- `file` — single PDF, OR `images[]` — one or more image files (png/jpeg/webp)
- `studentName` — required display name
- `studentId` — optional Airtable Students record ID

**Response:**
```json
{
  "batchId": "batch_<timestamp>_<rand>",
  "studentName": "Gavin",
  "studentId": "recXXX | null",
  "pages": [
    {
      "pageIndex": 0,
      "pageImageUrl": "https://blob.vercel-storage.com/.../page-0.png",
      "pageImageWidth": 2480,
      "pageImageHeight": 3508,
      "questions": [
        {
          "questionLabel": "Q1",
          "questionRegionBox": [yMin, xMin, yMax, xMax],
          "questionRegionPixels": { "x1": 120, "y1": 230, "x2": 2360, "y2": 850 },
          "hasDiagram": false
        }
      ]
    }
  ],
  "summary": { "totalPages": 10, "totalQuestions": 27 }
}
```

### Key files

| File | Purpose |
|---|---|
| `src/lib/batch-marking.ts` | PDF→images (pdfjs-dist+canvas), Gemini detection, Blob upload, p-limit orchestration |
| `src/lib/marking-pipeline.ts` | Claude Sonnet marking prompt, Gemini bbox annotation, Sharp SVG composite |
| `src/app/api/mark-batch/init/route.ts` | Init endpoint (GET students + POST batch) |
| `src/app/api/mark-batch/execute/route.ts` | Execute marking per question group |
| `src/app/api/mark-batch/assemble-pdf/route.ts` | PDF assembly + finalize |
| `src/app/api/mark-batch/get/route.ts` | Batch + submissions for detail page |
| `src/app/admin/mark/page.tsx` | Landing page (tabs + upload flow) |
| `src/app/admin/mark/batch/[batchId]/page.tsx` | Batch detail page (all statuses) |

### Airtable Batches table (create manually)

Adrian must create this table in Airtable before the init endpoint can write to it. Writes are non-fatal — init returns its response even if Airtable write fails.

| Field | Type | Notes |
|---|---|---|
| `Batch ID` | Single line text | Primary — e.g. `batch_1714029384_abc123` |
| `Student` | Link to Students | Optional |
| `Student Name` | Single line text | |
| `Total Pages` | Number | |
| `Total Questions` | Number | |
| `Status` | Single select | `detected` / `marking` / `marked` / `finalized` / `failed` / `deleted` |
| `Page Image URLs` | Long text | Newline-separated blob URLs |
| `Detection JSON` | Long text | Full init response payload (for replay/debug) |
| `Final PDF URL` | URL | Set in assemble-pdf step |
| `Created At` | Date with time | |
| `Finalized At` | Date with time | Set in assemble-pdf step |
| `Submissions` | Link to Submissions | Set in execute step |

### Dependencies added

`pdfjs-dist` (v5.x, legacy ESM build), `@napi-rs/canvas` (Node.js canvas — NOT the `canvas` package), `p-limit`, `@google/generative-ai`

`next.config.ts` has `serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist']` — required because these are native modules.

**Important:** Use `@napi-rs/canvas`, not the `canvas` npm package. `canvas` requires system libraries (Cairo, Pango) that aren't available in Vercel's serverless runtime and causes `DOMMatrix is not defined` errors from pdfjs-dist. `@napi-rs/canvas` uses prebuilt binaries and works out of the box.

### Cross-page continuation handling

Gemini detection runs **sequentially** per page (not in parallel) so each page call receives the previous page's last question label and last visible sub-part. This lets Gemini correctly label continuation regions — e.g. if page 1 ends with Q1 part (ii), page 2 beginning with "(iii)" is labelled "Q1" not "Q(iii)".

Each `DetectedQuestion` has:
- `isContinuation: boolean` — true if this is a continuation from the previous page
- `lastPartVisible: string` — last sub-part label visible in this region (feeds context to next page)

The summary includes `questionGroups` — logical questions grouped across pages:
```json
"questionGroups": [{ "questionLabel": "Q1", "pages": [0, 1] }, { "questionLabel": "Q2", "pages": [2, 3] }]
```
`totalQuestions` = number of unique logical questions; `totalRegions` = number of page regions (may be higher if questions span multiple pages).

Page image **uploads** are parallelised (independent). Only the Gemini detection calls are sequential (for context).

### PDF rendering notes

- Uses `pdfjs-dist/legacy/build/pdf.mjs` (legacy build avoids DOMMatrix error in Node.js)
- Worker path set to local file URL: `file://<cwd>/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`
- Scale 2.0 = ~150 DPI A4 (1224×1584 px per page)
- PDF page rendering is parallel (p-limit 5); Gemini detection is sequential for cross-page context
- Page images stored at `batches/<batchId>/page-<index>.png` in Vercel Blob (public, unguessable path)

### Upload size limit

50 MB max enforced both client-side (immediate feedback) and server-side. The Vercel default 4.5 MB body limit is raised via `vercel.json` `functions` config — `memory: 3008` on the init route gives Pro-plan body limits up to ~50 MB. If uploads still 413 after deploy, check that `vercel.json` `functions` key deployed correctly. UI shows a descriptive error for non-JSON platform errors (e.g. 413 from Vercel before the handler runs).

### Env var required

`GOOGLE_API_KEY` — Google AI Studio key with Gemini 2.5 Pro access. Add to Vercel environment variables.

## Mark-paper ✏️ Annotate (in-browser Apple Pencil ink) — 2026-08-01

Full spec + as-built deviations: **`SPEC-ANNOTATE.md`** (repo root, §11–13). Status: built.
> ⚠ **Annotate in the AdrianMarker shell app, not Safari** (resolved 2026-08-04):
> iPadOS **Live Text** system-intercepts Pencil strokes over the printed text in
> page photos — Safari offers no opt-out, so strokes intermittently vanish there;
> the shell disables text interaction (`ios-shell/`, weekly re-sign recipe in its
> README) and writes flawlessly. Full saga: SPEC-ANNOTATE.md §12.
> **Shell lag fix (2026-08-06):** the shell's native Pencil mirror (a
> UIGestureRecognizer firing `evaluateJavaScript` per frame into
> `window.__nativePencil`) used to run app-wide, dragging the whole app
> ("VERY laggy") — now the page owns the switch via
> `lib/native-pencil-bridge.ts` (`pencilBridge` message handler: off on page
> load, on only while the ✏️ overlay is mounted). Shell starts ENABLED so a
> stale cached page keeps the missing-strokes fix; an old shell ignores the
> messages. Needs an Xcode rebuild to land on the iPad. Replaces the Notability round trip on
`/admin/mark-paper` (which stays as fallback): ✏️ Annotate button (gated
`runId && annotatedPhotos.length`) opens a full-screen overlay over the marked pages
(the `url_with_solutions ?? url` copy via `pickAnnotatedPhotoUrl(p,'photos')`); Done
flattens inked pages client-side, uploads via the client-token flow (`type=page`), and
`/api/admin/mark-paper-annotate-pdf` assembles the PDF + links it to the run as
`kind:'annotated'` — the SAME single slot the Notability upload writes, last write wins.

- **Pen-only ink** (`pointerType==='pen'`; mouse only behind `?mouse=1`) = palm
  rejection. 1-finger scroll (suppressed while pen down/500ms after), 2-finger pinch,
  2/3-finger tap = undo/redo. Draw-and-hold ≥500ms snaps line/rect/ellipse.
- **Pure libs in `src/lib/annotate/`** (all unit-tested, pre-push gated): shape-fit,
  stroke-geometry, hit-test, flatten-plan, ink-outline (perfect-freehand wrapper),
  draft-store, stroke-split (partial eraser), lasso (selection). Strokes live in
  page-image pixel coords. Don't re-implement any of this inline in the overlay.
- **Drafts**: strokes autosave to localStorage per run and are kept after Done →
  reopening offers "Restore ink" (device-local re-editing). Closing unrestored must
  never delete a stored draft (`dirtyRef` gate in AnnotateOverlay — regression risk).
- **Shared PDF layout** (`PAGE_W`/strip/`drawPaperTotal`) lives in
  `src/lib/marked-pdf-layout.ts`, imported by BOTH mark-paper-pdf and
  mark-paper-annotate-pdf. Change layout there only.
- **Pencil double-tap** can't reach Safari; the overlay listens for a
  `annotate-pencil-doubletap` window event so a future ~100-line WKWebView shell
  (UIPencilInteraction → evaluateJavaScript) gets it for free.
- **Second entry point**: ✏️ Annotate on each history row (load run → overlay opens).
- **Download filenames ride the URL PATH** — `/api/admin/mark-paper-download/<name>.pdf?url=…`
  (the `[name]` segment route re-exports the parent GET): Safari's share sheet titles
  inline-viewed PDFs from the last path segment and ignores Content-Disposition, which
  is why Notability imports used to be called "mark-paper-download". Build links with
  the page's `downloadHref()`, never the bare query-param form.
- **"shared.pdf" is WHATSAPP's doing** — its share extension hands Shortcuts a temp
  file literally named `shared`, so no header/server fix can recover the real name.
  The share-sheet recipe's Ask-for-Input step (type/confirm the name at share time) is
  the only fix; Files-app shares keep real names. The bot's `/api/mark-inbox` (which
  the Shortcut posts to — NOT the Vercel route; 4.5MB platform cap) and the website's
  `mark-paper-inbox` both honour `x-file-name`.
- **Marker comments render inline $…$ TeX** in the results panel via `lib/math-inline.ts`
  (KaTeX, currency-vs-math heuristic, tested) — don't regex-render TeX in the page.
  ⚠ TWO prices in one comment pair with each other ("$24 < $32" → KaTeX'd garble;
  KaTeX never throws on prose, it italicises it). Fixed 2026-08-28 by the
  price-collision check in `mathHtml` + a function-words rule in `looksLikeMath`,
  validated by sweeping every mathHtml-rendered DB field (119 garbled spans fixed,
  zero legit TeX flipped) — the file header carries the details.
