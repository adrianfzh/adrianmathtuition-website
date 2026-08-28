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
| Add practice questions to one of my existing revision sheets | `revision-worksheet` (or just `rw, am circles, worked`) |
| Browse the bank, pick questions myself, then get a sheet | `worksheet-clerk` |
| Generate a whole S4 prelim paper to blueprint | `prelim-paper` |
| Second-guess a prelim draft I already saved | `setter-pass` |
| Clean up a past-paper PDF I downloaded and add its answer key | `finish-practice-set` |
| See which topics my students actually lose marks on | `bleed-table` |
| Fill in the question bank's missing answers/solutions | `qb-enrich` |
| Mark the 🌙 queue by hand on plan usage | `plan-marking` |
| Touch marking / kiosk / schedule / invoices **code** | the matching area skill — it routes to the runbook |

## The five paper-makers, disambiguated

This is where the names collide. The distinguishing question is **what you start
from**:

| Skill | Starts from | Produces |
|---|---|---|
| `create-worksheet` | nothing — a topic and a count | a new `.docx` in house style. Also owns the "(With Worked Examples)" revision format |
| `revision-worksheet` | **an existing document of Adrian's** (a notes-bank fragment, or a worked-examples sheet) | that same document with a fresh Practice section of real QB questions appended |
| `worksheet-clerk` | **a conversation** — it shows candidates and Adrian picks | a physical worksheet from the picks; can also read jobs off `/admin/todo` |
| `prelim-paper` | **the blueprint** (`data/paper-blueprints.json`) + the QB | a full S4 prelim paper, DOCX, with answer key |
| `finish-practice-set` | **a PDF that already exists** — a compiled past paper | the same paper, cleaned of its source's header/footer/mark-up, titled, with a QB answer key appended |

Rule of thumb: `create-worksheet` **authors**, `revision-worksheet` **extends**,
`worksheet-clerk` **curates**, `prelim-paper` **assembles**, `finish-practice-set`
**finishes**. `setter-pass` is not a maker — it reviews what `prelim-paper` saved.

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

## Adding a skill

Add a row here in the same turn you create it — an unlisted skill is one Adrian
will not remember exists. If the new skill's name is close to an existing one,
say what it starts from in the disambiguation table above, not just what it does.
