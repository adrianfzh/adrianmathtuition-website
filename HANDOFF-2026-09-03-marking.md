# HANDOFF — marking work, night of 2–3 Sep 2026

Written 3 Sep 2026 ~07:35 SGT by the session that built this, for ANY other
Claude session (other account, other machine). Read `CLAUDE.md` and
`docs/MARKING.md` first; this file is the live position on top of them. The
same session also left memory notes on this Mac at
`~/.claude/projects/-Users-adrianfong-Desktop-adrianmathtuition-website/memory/`
(`MEMORY.md` is the index) — they carry the *why*; this file carries the *where*.

## Where everything is (as of writing)

| Repo | Ref | State |
|---|---|---|
| website `main` (prod) | `bcd216ee` | brown cover live on prod |
| website `dev` (preview, adrianmath-dev.vercel.app) | `a534a112` | + "N of M · NEEDS A CHECK" badge/strip for a score above the total — **promote pending Adrian's word** |
| bot `main` → Fly | `9517c85` | deployed 3 Sep ~07:25 SGT — see "tonight's bot builds" |

Both repos' `.git` live in `~/.gitdirs/` (pointer files under Desktop).
**Never `git worktree add` on the BOT repo** — its config sets `core.worktree`,
so a linked worktree reads/acts on the main checkout (found tonight). Website
worktrees are fine: `git worktree add <scratch> -b x origin/dev`, symlink
`node_modules`, copy `.env.local`, work, `git push origin HEAD:dev` (the
pre-push hook runs the suite), remove the worktree. The bot's main checkout is
SHARED with another live session that keeps uncommitted files there (CLAUDE.md,
`.claude/skills/airtable-ops/references/schema.json`, iCloud " 2" copies) — stage
only your own paths; that session also pushes to `main` between your fetch and
your push, so always `git fetch && git rebase origin/main` right before pushing.

## Tonight's bot builds (all on Fly)

1. **Rules-version stamp** (`b5f810f`): `paper_marking_runs.rules_version` = hash of the marking prompts; beside `model`, tells a re-mark whether rules changed or the model varied.
2. **Error-kind labels** (`b0c9e06`, `b4623b2`): 8 fixed codes (`concept | arithmetic | transfer | sign | rounding | units | misread | incomplete`) on `lines[].error_type` and `parts[].error_kind`; drawn beside each ✗ as a PHRASE ("arithmetic error", "misread question", "incomplete answer") in the teaching ink, brown bold italic, in clear space. Marks never change. Site: cover "MARKS LOST" row + desk/triage Override "kind of error" select → `triage_override.error_kind` = the label truth channel.
3. **The groundingSource crash** — a `let` inside a `try` in `remarkRun` threw on EVERY marking since `f321786`; fixed by the peer (`5ddca27`). Lesson: a marking deploy is verified only by a real marking landing through `remarkRun` (queue or a re-posted Mac hand-back), never by the stats/prompts probes or a direct `markPaperDirect` call.
4. **Durable Mac hand-back** (`963b84e`→`0970dbc`): each page's read rides `external-heartbeat` into table `paper_external_reads`; a quiet claim is assembled from stored reads (only missing pages hit the API); wrapper re-posts `work/<stamp>/PENDING` submit.json before claiming (served `external-spool`). Telegram: ⏳ 30-min no-pickup (once), 💻→☁️ takeover, 💾 landed from saved reads. **The three wrappers on THIS Mac were refreshed by hand** (`~/.adrianmath_marker{,2,3}/run.sh`); any other Mac needs `install.sh` re-run — the wrapper refreshes only the runbook from the server, never itself.
5. **Parked-paper re-pick loop** (`1330677`→`43119c3`): a `queue_status='failed'` row was re-picked every tick; both pick predicates now honour the column.
6. **Fragment-aware bracket re-read** (`a00ff35`→ in `9517c85`): a part continuing over several photos was counted once per page (Kassandra Q8: 11 → 15, paper 92/90). `fragmentGroups` presents same-question same-letter fragments as ONE part; a printed bracket collapses them (earliest photo keeps `max = printed`, awarded capped; later fragments 0/0 with `merged_into`); if the re-read confirms every bracket and they sum to the count, `trustCounted` → `max_source:'brackets'` (registry was wrong). Outcome persisted in `result_json.allocation_recheck {ran, fired_on, lines, corrections, confirmed, applied: exact|brackets|none, reason}`. Already-annotated pages keep their old chips (no re-render).

## Kassandra's three papers (math project `nempslbewxtlikfzachi`, `paper_marking_runs`)

| Paper | id | Score | Marked by | Cover |
|---|---|---|---|---|
| am practice set 3 p1 | `5e4aeb38-4f9f-4aef-9401-2d8afa24530e` | 89/90 | Mac reads, free | brown, rebuilt |
| am test set 3 p1 | `914df654-36e2-4393-ac0f-cdbd042f2e32` | 74/90 | server API | brown, rebuilt |
| am practice set 3 p2 | `e667ad84-9a57-4d30-8fde-9b2901314e1d` | was 92/90 (Q8 counted 15) | **re-mark triggered 23:32Z / 07:32 SGT on the new pipeline** | see below |

**FIRST THING TO CHECK:** the P2 row — `total_awarded/total_max`, `result_json.allocation_recheck.applied` (expect `exact`: Q8 collapses to 11, paper 90), Q8's parts (`merged_into` on the later photos). If it landed, rebuild its PDF: open `/admin/mark-paper`, find the row in the history, **Load** (that rebuilds the PDF from stored marks + pages, cover included). If it did not collapse, Adrian overrides P2 in triage (`/admin/mark/triage` or the desk, with the "kind of error" select). None of the three is released — they are Adrian's own uploads (manual release; `AUTO_RELEASE_PAUSED` stays true).

## Standing rules (do not relax)
- Student data (page images, marking JSON, reads, PDFs) is scratchpad-only; never commit, never publish.
- Never release, delete, or re-mark a student's run without Adrian's explicit word; the bot auto-release stays paused.
- `MARKER_API_TOKEN` = the site `ADMIN_PASSWORD`; only on Adrian's machines; never print secret values.
- `main` moves only on Adrian's "promote" (`git push origin <dev-sha>:refs/heads/main` after a fast-forward check; wait for the prod build; probe).
- Bot deploys kill an in-flight Fly marking: before `git push origin HEAD:main`, check no row has `lease_until > now()` held by a `fly-…` claim (Mac external claims are fine).

## Useful calls (site proxy `POST https://www.adrianmathtuition.com/api/admin/mark-paper`, `Authorization: Bearer <ADMIN_PASSWORD>`)
- `{phase:'stats'}` history rows · `{phase:'run', id}` one run · `{phase:'remark', id}` re-mark on the API · `{phase:'external-marking-result', id, by, reads:[{photo_index, json}]}` re-post a Mac hand-back (the Mac keeps them in `~/.adrianmath_marker*/work/<stamp>/submit.json`) · `POST /api/admin/mark-paper-pdf {results, annotated_photos, totals, student, multi, mode:'full', runId}` rebuilds + links the PDF.
- Vercel: `vercel ls adrianmathtuition-website --meta githubCommitSha=<sha>` → when Ready, `vercel alias set <url> adrianmath-dev.vercel.app`.
- Fly deploy status: `gh run list --limit 1 --json status,conclusion,headSha` in the bot repo.

## Open next steps (agreed or offered, not started)
- **Promote** the site badge (`a534a112`) when Adrian says so.
- Bleed table: an error-kind column (marks lost by kind × topic).
- Label calibration: after ~10 papers with Override reasons, measure label agreement before trusting the cover's careless/concept split for parents.
- `core.worktree` on the bot gitdir: unset it when the peer's tree is clean, then re-verify `git status`.
- The peer session's own work in the bot checkout is theirs — do not commit or clean it.
