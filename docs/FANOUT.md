# Running a batch of fixes with agents — the playbook

Written after 10 Sep 2026, when twenty marking complaints across twelve papers
took an evening and a half: eleven agents at once, two wholesale deaths (a
transient API error, then the session usage limit), three hand merges of
patches that touched the same rules block, eighteen bot deploys, and a marking
machine that melted under the re-marks used to verify the fixes. Adrian:
"give me a report of what went wrong and how we can make everything run
smoothly and faster" — then "do all". This is the "do all" for process.

## 1. Triage before fan-out

Sort every complaint into a bin before anything is launched. The bins are what
decides who works on it, because the fixes live in different files and are
verified differently:

| bin | where the fix lives | verified by |
|---|---|---|
| marking rule (a mark is wrong) | bot `ai/paper-marker.js` rules, `ai/marker-reconcile.js` | the golden replay suite (`npm test`), then ONE page re-mark |
| pen / drawing (right mark, wrong ink) | bot `ai/annotate.js`, `ai/photo-overlay.js`, `ai/pen-math.js` | `scripts/golden-pen.cjs`, `scripts/pen-dryrun.cjs` |
| grounding / paper data (we lacked the paper, the scheme, the bank row) | Extraction Inbox, `paper_library`, `paper_schemes`, the bank | the row exists; the next marking grounds |
| infrastructure (queue, machine, filing, deploy) | Fly, `fly.toml`, crons, `lib/dropbox-filing` | logs, `/queue-quiet`, `job_runs` |

Twelve papers on 10 Sep had about five root causes. Twelve investigators
re-discovered the same causes and then collided in the same files. One agent
per bin, with the whole bin's evidence, is faster and merges cleanly.

## 2. Four agents, staggered, each in its own clone

- **At most four agents at a time**, launched a few minutes apart. Eight at
  once hit the session limit together and all died together.
- **Every agent gets its own directory** under the session scratchpad plus a
  standalone clone (`git clone` + `ln -s` node_modules; never a worktree of
  the bot repo). Its brief is the common brief + one task paragraph.
- **Commit after every completed fix** in the clone and export
  `git format-patch` as you go. A dead agent then loses at most fifteen
  minutes; the orchestrator merges patches as they land, not at the end.
- **A STATUS.txt line every fifteen minutes.** The orchestrator polls the
  files; a stale file means a dead agent, noticed in minutes rather than
  when a notification never arrives. Relaunch by pointing a fresh agent at
  the same directory ("you are resuming; inspect the directory; finish what
  is partial").
- **Opus for investigations and judgement, Sonnet for mechanical builds,
  Fable only where it writes solutions** (extraction).

## 3. Verify on the bench, not on a live paper

A rule or pen fix is verified by the golden bench (bot `CLAUDE.md` § Golden
bench: replayed stored payloads in `npm test`, the local pen bench from stored
boxes) and, if a live check is still wanted, by the desk's **🔁 Re-mark this
page** door on one page. A whole-paper re-mark is a last resort and never while
the batch lane is off: on 10 Sep each one took 15–25 minutes on the Mac lane and
three of them plus a hand-in melted the machine. A DEPLOY is still verified by
one real landing (the marking memory rule) — that is a different question from
verifying a rule.

## 4. One ledger that survives

Findings go into `docs/MARKING-DEFECTS.md` as they arrive — one dated section
per round, one line per complaint with its bin, root cause, commit or agent, and
status. Not into the conversation: a compaction or a dead agent loses that, and
on 10 Sep the original wording of one finding (the pen realign misfire) was
lost exactly this way.

## 5. Ground truth first

Before any marking fix for a paper, check the paper is held: `paper_library`
rows of kind questions/solutions, `paper_schemes`, the bank. On 10 Sep three
papers were "mis-marked" because the 2025 GCE papers were not in the bank at
all; the marking fixes came after the papers, not before. The Extraction Inbox
now files a dropped PDF for the marker within ten minutes and cuts a combined
book at its covers; the weekly `missing-papers` line names what students named
that we do not hold.

## 6. Deploys: two or three an evening, at quiet moments

Bot deploys cost ~5 min of CI plus the queue-quiet wait and restart both
machines. Merge locally as patches land; push two or three times an evening
when `/queue-quiet` shows in_flight 0 and no hand-in is expected. Website: push
to `dev` freely (docs-only pushes do not build); promote once.

## 7. Each session in its own clone

Two sessions never share a checkout. The second session works in
`~/dev/adrianmathtuition-website-2` and `~/dev/adrianmath-telegram-math-bot-2`
(full clones, origin = GitHub, node_modules symlinked, env copied). If
`git status` shows edits you did not make, you are in the wrong folder: commit
by pathspec, never stash or reset another session's work, and say so.

## 8. Report shape

One status line per hour while a round runs. At the end: what landed (commits,
deploy versions), what is open with its bin, and the numbers (agents launched,
lost, deploys, hand merges) — the same table as the 10 Sep retrospective, so
rounds can be compared.
