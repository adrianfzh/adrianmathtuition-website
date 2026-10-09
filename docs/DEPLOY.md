# Commit, push, preview and promote — the full detail

> Moved here verbatim from `CLAUDE.md` on 6 Oct 2026 when CLAUDE.md became a lean index (Adrian: "yes" to slimming it). Edit it here; CLAUDE.md keeps only the rule and a pointer.

## Auto commit + push policy — dev-first, promote to prod on approval

**`main` = production** (auto-deploys to Vercel prod). **`dev` = preview** (auto-deploys to a Vercel preview URL, NOT prod). Work never lands on `main` without an explicit go-ahead.

**On any turn where I change code, auto commit + push to `dev` at the end of that turn — no need for the user to say "push".** **A `dev` push now AUTO-BUILDS a preview via the GitHub integration** (confirmed live 2026-08-02 — the old "not enabled" note here was stale): `source: git` deployments appear in `vercel ls` within ~a minute of the push, build in 1–2 min. After it's READY, **re-point the stable alias** so Adrian's bookmark shows the latest build:
```
vercel alias set <new-deployment-url> adrianmath-dev.vercel.app
```
**https://adrianmath-dev.vercel.app is Adrian's permanent preview bookmark** (set up 2026-07-10). Always re-alias after every preview deploy and share THIS url, not the per-deploy one. Cookies survive re-aliasing (same domain), so his login persists across deploys. The preview is fully isolated from prod; Sentry is off there (env vars are Production-scoped).

> ⚠ **CLI `vercel deploy` is currently SEAT-BLOCKED** (found 2026-08-02): CLI-sourced
> deployments attach the local git author `adrianfong@Adrians-MacBook-Pro.local`, which
> is not a Vercel team member, so they sit forever in `readyState: BLOCKED` —
> `vercel ls`/`inspect` render that as **UNKNOWN with no duration and NO build logs**,
> and the deployment URL serves Vercel's geist-styled "building" placeholder with HTTP
> 200 (don't read a 200 there as READY; `vercel alias set` refuses with "not ready").
> The GitHub auto-build is the working path — push to `dev`, wait for the `source: git`
> deployment, alias it. To re-enable CLI deploys, either verify/approve the author in
> Vercel team settings or set `git config user.email adrianmathtuition@gmail.com`
> (the Vercel account email) — Adrian's call, since it changes commit attribution.

- Only when code/files actually changed. Pure-discussion or read-only turns → no commit, no push.
- **Docs-only pushes do NOT build (9 Sep 2026).** `vercel.json` `ignoreCommand` → `scripts/vercel-ignore-build.sh`: when every file changed since the branch's last BUILT commit is under `docs/`, `.claude/`, `.githooks/`, `.github/`, `scripts/`, `migrations/`, `reference/`, `_backups/`, `_old/`, `ios-shell/` or is a root `*.md`, Vercel skips the build (it shows as CANCELED in `vercel ls`, and the alias stays on the previous build — correct, nothing shipped changed). `data/` ships. Don't wait for a deployment after such a push. Why: 928 builds in 19 days (230 for non-shipping commits) at ~2 min each were the whole of the $20 Vercel credit — Build CPU Minutes, not functions or transfer.
- Always run the build/typecheck first; never push a broken build. The pre-push hook (`.githooks/pre-push`) runs the test suite and blocks the push on failure.
- The advisory pre-push review hook (`.claude/settings.json`) still runs on every push.
- The user can say **"don't push"** (or "hold off") to skip auto-push for that turn.
- **In a cloud session** the auto-push cannot fire on its own (the cloud's git rule allows only the session's `claude/…` branch): open a PR into `dev`, or ask Adrian for "push to dev" — and say that is all you need, not that you cannot push. → `docs/CLOUD.md`
- Write a real, descriptive commit message (not "auto"); end with the `Co-Authored-By` trailer.

**Promote to production** only when the user explicitly says so — e.g. **"promote"**, **"ship it"**, **"to prod"**, **"push to prod"**. To promote: send what is on `origin/dev` straight to `main`:
```
git fetch origin && git push origin origin/dev:main
```
This keeps history linear (`dev` is always at or ahead of `main`) and **never switches the folder** — so a second session's unfinished edits in the same folder cannot stop it or be touched by it. Git refuses the push by itself when `main` has a commit `dev` lacks (main moved independently): rebase `dev` onto `main` first, then promote. Push `dev` first — the line ships `origin/dev`, not unpushed work. The pre-push checks run as usual.

**Going live is one word from Adrian, never a Terminal line (Adrian's morning of 9 Oct 2026).** A session whose go-live step was refused wrote "run this line in Terminal"; he ran it by hand five times that morning, and one run stopped on another session's unfinished edit (the old `git checkout main && …` line switches the folder). The same day he also had to ask *"do i have to promote for state save + restart ?"*.
- **Every report of a website change says where it is:** "On the main site." or "On the test site only. To put it live, reply promote."
- **No "promote" heard in THIS chat → ask for the word, then run the line yourself.** A yes passed on from another session is not his word.
- **Only if the app still refuses after his own word:** say so in one line and give the one line above, marked "in Terminal".
- ***"promote when done"* / *"when okay"* / *"all that is safe"*** (five times on 9 Oct) **is his word given in advance.** When your checks pass and the switches check is clean, promote and say "promoted" — do not ask again. If something makes it unsafe (another session's half-finished work on `dev`), say what in one line instead.

- **Each session in its own clone (11 Sep 2026).** Two Claude sessions never share this checkout: the second one works in `~/dev/adrianmathtuition-website-2` (a full clone; bot: `~/dev/adrianmath-telegram-math-bot-2`). If `git status` shows edits you did not make, you are in a shared checkout — commit by pathspec, never stash or reset the other session's work, and say so. → `docs/FANOUT.md` §7
- **Hotfix exception:** if the user says something is broken in prod and wants it fixed *now*, it's fine to commit to `dev` and promote in the same turn — but still say so, don't silently push to `main`.
- Rollback is `git revert` on `main` + push, or Vercel → Deployments → promote a previous build.

## ⏱ Do not keep Adrian waiting (2 Oct 2026)

Adrian: *"do you always have to wait for bot deploy?"* … *"let's have a more efficient way of
doing things"*. A standing rule for every session, on any account:

- **Never block on something the next step does not need.** Start it, say it is running, carry
  on, and check it once at the end of the turn.
- **A bot push:** say "deploying" and carry on. Look once at the end of the turn
  (`gh run list -R adrianfzh/adrianmath-telegram-bot -L 1`) and report green or failed. No
  `gh run watch`, no sleep loop. Still look — a red check skips the deploy with no message.
- **Wait in place only when** the next step needs the new thing running (a re-mark that proves
  a marking fix, a preview page you must look at) or Adrian asks whether it is live.
- **A docs-only push builds nothing** (below) — never wait for a deployment after one.
- **While long work runs, say in a few words what is happening**; do not go silent.
