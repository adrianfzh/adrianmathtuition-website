# Skills index

**All skills live in `.claude/skills/` and are committed to this repo.** That is
the whole distribution mechanism: clone the repo on any machine, or open it under
any claude.ai account, and all of them come with it. Nothing to upload, nothing
per-account to install. (Skills placed in `~/.claude/skills/` would be personal
to one account and would NOT travel — don't put project skills there.)

Adrian invokes one by typing `/<name>`, or just by describing the task — each
skill's `description:` carries its trigger phrases. This file exists because
several of them are paper-shaped and it stops being obvious which is which.

## Which one do I want?

| I want to… | Skill |
|---|---|
| Write a worksheet from scratch, on a topic | `create-worksheet` |
| Build a worked-examples revision sheet for a topic from the bank — Notes, one example per skill, similar practice | `revision-worksheet` (or just `rw, s2 polygons`) |
| Add a different practice set to one of my EXISTING revision sheets | `copy-revision-worksheet-with-different-practice` (or just `crw, am circles, worked`) |
| Browse the bank, pick questions myself, then get a sheet | `worksheet-clerk` |
| Generate a whole S4 prelim paper to blueprint | `prelim-paper` |
| Second-guess a prelim draft I already saved | `setter-pass` |
| Clean up a past-paper PDF I downloaded and add its answer key | `finish-practice-set` |
| See which topics my students actually lose marks on | `bleed-table` |
| Fill in the question bank's missing answers/solutions | `qb-enrich` |
| Mark the 🌙 queue by hand on plan usage | `plan-marking` |
| Draft an animated portal lesson for a topic from my approved notes | `author-lesson` |
| Touch marking / kiosk / schedule / invoices **code** | the matching area skill — it routes to the runbook |

## The five paper-makers, disambiguated

This is where the names collide. The distinguishing question is **what you start
from**:

| Skill | Starts from | Produces |
|---|---|---|
| `create-worksheet` | nothing — a topic and a count | a new `.docx` in house style. Also owns the "(With Worked Examples)" revision format |
| `revision-worksheet` | **the question bank + a topic** — the bank's skill map (subgroups) decides which aspects get an example; the whole E-Math family (S1–S4) pools for thin topics | a NEW `(With Worked Examples)` sheet in `Revision/<folder>`: Notes box → one worked example per aspect, solutions in Adrian's captured style, every number machine-verified → similar-by-embedding practice. The base that `crw` later extends. Two checkpoints: Adrian approves the arc before anything is written, and amends the DOCX before the PDF goes on the kiosk |
| `copy-revision-worksheet-with-different-practice` | **an existing document of Adrian's** (a notes-bank fragment, or a worked-examples sheet) | that same document, byte-cloned, with a fresh Practice section of real QB questions appended. Was named `revision-worksheet` until 5 Sep 2026 |
| `worksheet-clerk` | **a conversation** — it shows candidates and Adrian picks | a physical worksheet from the picks (it calls `create-worksheet` to render); can also read jobs off `/admin/todo` |
| `prelim-paper` | **the blueprint** (`data/paper-blueprints.json`) + the QB | a full S4 prelim paper, DOCX, with answer key |
| `finish-practice-set` | **a PDF that already exists** — a compiled past paper | the same paper, cleaned of its source's header/footer/mark-up, titled, with a QB answer key appended |
| `self-study-sheet` | **one student's MARKED PAPER** — the questions they actually lost marks on | a per-student sheet they learn from (Example → Practice pairs, verified), filed to Dropbox `/Self-Study/<Student>/` for Adrian to vet, edit and release with the marked copy. Steps 3–6 of [`SPEC-TEACHING-CYCLE.md`](../SPEC-TEACHING-CYCLE.md) |

Rule of thumb: `create-worksheet` **authors**, `revision-worksheet` **builds the base**,
`copy-revision-worksheet-with-different-practice` **extends** it,
`worksheet-clerk` **curates**, `prelim-paper` **assembles**, `finish-practice-set`
**finishes**, `self-study-sheet` **diagnoses** (it is the only one that starts
from a student's own marked work, and the only one whose content is chosen by
what that student got wrong). `setter-pass` is not a maker — it reviews what `prelim-paper` saved.

## The four area skills are different in kind

`marking`, `kiosk`, `schedule`, `invoices` don't *do* anything. They fire when
code in their area is about to be touched and force the area runbook to be read
first, because those runbooks hold the "this exact mistake shipped a bug" notes.
They mirror the table at the top of [`CLAUDE.md`](../CLAUDE.md), which stays the
authoritative list.

## Everything else

| Skill | What it does |
|---|---|
| `bleed-table` | Ranks topics by marks lost across all AI-marked papers (`paper_marking_runs`); can seed question generation for the worst |
| `qb-enrich` | Extracts missing `answer` fields from existing solutions, writes solutions where there are none |
| `plan-marking` | Runs one cycle of the plan-billed 🌙 marking worker by hand; also the way to debug the launchd worker |
| `author-lesson` | Drafts a `data/lessons/<slug>.json` animated lesson for one (level, topic) from APPROVED learning units, gated by `scripts/lessons/verify-lesson.mjs` and Adrian's scene-by-scene approval; admin-preview only → [`docs/LESSONS.md`](LESSONS.md) |
| *(not a skill)* Telegram `/ws` | Adrian's five-kind worksheet menu in the bot: kind 3 (questions only) is the instant `/api/bot/worksheet` build, marks-banded; kinds 1 · 2 · 4 · 5 queue to `worksheet_jobs` and the Mac worker (`scripts/worksheet-worker/`) runs `revision-worksheet` / `crw --kind notes` / `crw --kind worked` / `prelim-paper` headless, files the DOCX and Telegrams it back → [`SPEC-WORKSHEET-MENU.md`](../SPEC-WORKSHEET-MENU.md) |

## Adding a skill

Add a row here in the same turn you create it — an unlisted skill is one Adrian
will not remember exists. If the new skill's name is close to an existing one,
say what it starts from in the disambiguation table above, not just what it does.

**And put the distinction in the `description:`, not only here.** A session loads
every skill's name and description automatically; it does NOT load the bodies, and
it does not load this file. So the description is the entire budget for picking the
right skill — this index is for Adrian and for an agent that comes looking. When
two skills could answer the same sentence, each description must name the other and
say when to prefer it. `create-worksheet` and `worksheet-clerk` both claimed the
trigger "make a worksheet" until 2026-08-28; the phrase now belongs to
`create-worksheet` alone, and the clerk claims "pull questions" / "show me
questions on <topic>" / "let me choose".
