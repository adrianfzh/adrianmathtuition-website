# Question clip — step 2a, the board plan for ONE bank question

You plan the board of a one-minute solution clip for one real exam question. The board is
what the student sees; it must be maths-checked line by line before anyone writes a word of
narration. You do not write narration.

## Read first (all of it)

1. `data/clip-runs/<slug>/question.json` — the question (`question_text`, TeX in `$…$`), the
   bank's checked `solution` (one step a line) and `answer`, its sub-skill and topic, marks.
2. `data/clip-bibles/_house.md` — the house rules (binding: key step its own line, the plan
   first, the rule beside the step, notes point at a token, ≤ 6 tokens a line, fits a phone).
3. The topic bible named in question.json (`bible`) — Adrian's method and words for this
   topic. Use HIS method where it teaches one, even when the bank's solution does it another way.
4. `scripts/clips/chain-check.py` — the docstring lists every check kind and what it proves.
5. Two approved plans as models of the format: `data/clip-plans/solving-log-equations-am.json`
   (an equation chain with a rejected root) and `data/clip-plans/linear-form-with-logs-am.json`
   (`model` / `identity` / `fact` checks). Its two `boards` are from before the one-board rule — copy
   its checks, NOT its boards.

## First: can this question be a checked clip?

Refuse (write ONLY `{"refuse": "<kind>", "why": "<one plain sentence>"}` to the plan file) when:
- `graph` — the answer is a sketch or read off a graph;
- `proof` — "show that" / "prove" with no number to land on;
- `words` — the answer is mainly an explanation in words;
- `figure` — the question needs a diagram the board cannot show;
- `long` — the working needs more than about 12 lines on one scrolling board (say so — a later
  build splits questions into part clips);
- `unchecked` — a line of the working cannot be written as a check below.
Never refuse because it is hard. Never invent a check that does not prove the line.

## The plan file — `data/clip-plans/<slug>.json`

```json
{ "slug": "<slug>", "title": "<4–6 words: what this question asks>", "heading": "<board heading>",
  "intro": "<the question, short, TeX in $…$ — every number and condition kept>",
  "level": "AM", "topic": "<topic>", "kind": "question",
  "question_id": "<id>", "bible": "data/clip-bibles/<file>.md",
  "answer": { "bank": "<the bank's answer, VERBATIM>", "facts": ["x = 12"], "display": "x = 12" },
  "lines": [ { "tokens": [{"tex": "…", "id": "…"}], "checks": [ … ] } ],
  "outline": [ "Read the question (intro on the board).", "The plan first: …", "…" ],
  "mustSay": [ { "say": "<one plain sentence>", "keys": ["<spoken words>"] } ] }
```

- **A clip is ONE board — never `boards`, never `"board"` on a line** (Adrian, 16–17 Oct 2026:
  "make the lines move up, like scrolling up, then we don't have to change screen"; house rules §1,
  the lesson verifier refuses two). Up to 7 lines it is one fixed board, which must fit ONE phone
  screen (390 × 844, measured after you finish). Longer working: set `"scroll": true` and keep every
  line on the one board — it slides up as lines are written; put a short `heading` on the first line
  of each step. Budget: the heading, an `intro` of at most about two phone lines (≈ 70 characters of
  words + maths — cut story words: "A cylinder: volume $(6+2\sqrt3)\pi$, radius $1+\sqrt3$. Find its
  height."). A line wider than the phone (about 22 characters of maths) is cut off — split it.
  **Except a Binomial expansion: each `=` line of it stays ONE board line** (Adrian, 1 Nov 2026,
  on a three-line ⁶C₀ / ⁶C₁ / ⁶C₂ expansion: *"can you write the expansion in one line? easier to
  see"*) — one token per term (`\binom{6}{0}(px^2)^6\left(\tfrac qx\right)^0` …, then `+\cdots`);
  the board shrinks a long line to fit the phone by itself. The simplified line is one line too.
  **One token per term on BOTH lines** (Adrian, 4 Nov 2026: *"when saying the calculation term by
  term, highlight that term only"*) — the voice lights one term at a time. When the question then
  matches a second bracket ("same shape"), plan a line that writes the two brackets one under the
  other, each part its own token, so the matching parts can be lit side by side.
  **Each later part of the question opens with a board line that says what it asks** (Adrian, 4 Nov
  2026: *"can we put find the coefficient of x^6 in (..)^6 on screen as well"*): `\text{Find the
  coefficient of } x^6 \text{ in } (…)^6`, under that part's heading, before its working.
  **A line worked out from the line above has its parts wrapped on BOTH lines** (4 Nov 2026: *"show
  exactly which part becomes which part in the next line"*) — each part above and what it becomes
  below are pieces, so they can light in the same colour together (⁶C₁ and 6, (px²)⁵ and p⁵x¹⁰).
  **Every piece the voice will name inside a term is wrapped so it can light on its own** (Adrian,
  4 Nov 2026: *"highlight the powers when narrator says it"*): `\htmlClass{lsn-pc-<name>}{…}` round
  each power, base, top or bottom the bible's wording says aloud — on the expansion line, every
  ⁿCᵣ (`c0`, `c1` …), the first term's power (`a0`, `a1` …) and the second term's (`b0`, `b1` …).
  **A bracket's own ( and ) stay in the token of the part beside them** (`\left(px^2` · `+\dfrac qx\right)^6`
  is wrong too — use `(px^2` and `+\frac qx)^6` with plain brackets): a lone `(` token leaves a wide gap
  on the board ("( px²  + q/x )⁶", 4 Nov 2026). **No line heading on the first line when the scene has a
  heading** — two headings stack. The
  same holds for maths inside an `intro`: a long identity goes on the board as a line, not in the intro.
- **A result used later is written again where it is used** (31 Oct 2026: two Binomial clips failed
  the look — "talked about but hidden" — because `−224x³` and the long expansion line had scrolled
  off by the time the voice came back to them). On a scrolling board, a later line that uses an
  earlier result shows it IN that line (`10(-224) + k(448) = 0`, not "this term times ten"), and the
  voice never lights or points at a line more than about 4 lines above the one being written.
- `lines[0]` is the first line of WORKING (the question sits in `intro`).
- Token ids are short, unique, lower-case. `hl`: `amber` for the line a key move makes, `emerald`
  for the answer token. A long line is one token.
- **No `note` on a line.** The rule beside a step is a `note` ACTION the writer adds on its word
  (`{"do": "note", "text": "Add Power: …", "near": "<token id>"}`) — so every line made by a rule
  must name that rule (his name for it) and the token it sits under in the outline.
- **Every number of `answer.bank` is on the LAST line** (both unknowns of a pair: `a = -3,\; b = -9`;
  a rejected root shown with `(\text{rej})`; the bank's exact form AND its 3 s.f. value if the
  bank gives both). The answer token is emerald.
- `answer.facts` in sympy: what the board establishes, e.g. `"x = 12"`, `"k = 5"`,
  `"h = 3 - sqrt(3)"`. They must hold at the end of the chain.
- `outline`: the order of ideas for the writer, one line each; the second item is the plan
  (the aim, in a sentence); name the rule used beside each line; name the trap and the line it
  bites on.
- **`mustSay`: the 1–3 things the narration MUST say for THIS question** (Adrian, 4 Nov 2026 — the
  clip's "must keep" list; house rules §2 "The must-say list"). Pick only what a student would lose
  marks or understanding without: the trap students fall into HERE, WHY the first move is the move,
  a property that must be named (sin lies between −1 and 1; x + 1 > 0 since x > −1). Take them from
  the topic bible (its traps and "Required wording"), the house rules and the question itself. Each
  `say` is ONE plain sentence. `keys`: 1–3 short runs of words the voice will SAY when it says the
  item, written as spoken ("negative one", "two pi over n", "never touches") — a cheap pre-check, not
  the judge. Every item must also be in the outline at the step where it is said. Not a list of every
  step: three at most, and fewer is fine. **One point per item, nothing tacked on** (4 Nov 2026, the
  first test: "At A, x = 60, so sin = 1 — we do not need to find t" failed an approved clip on the
  tacked-on half, which that clip rightly keeps in a 💡 drop-down): a side remark is not a must.

## Checks — every line has at least one, in sympy syntax (never TeX)

- An equation being solved: `start` (with `var`, and `domain` for log arguments) then `step`s,
  then `roots` (`reject` for a root that breaks a log). Exact roots may be expressions.
- A value being simplified (surds, evaluating): `start_expr` then `step_expr` — each line equals
  the one before.
- Two unknowns found together (polynomials, binomial pairs): `system` (with `vars`), then
  `system_step`s, then `solution`.
- A rule applied to a definition: `model` (e.g. `{"model": {"f": "2*x**3 + a*x**2 + b*x + 10"}}`)
  then `identity` / `fact` lines; a single unknown read off one equation: `solves` (binds it).
- Calculus: write diff()/integrate() on the expression itself:
  `{"identity": "diff(x**2 - 4*x + 7, x) = 2*x - 4"}`.
- `binomial(8, 3)`, `factorial`, `sqrt`, `Rational(1, 9)` are fine inside checks.
- Values the question gives: `given`, or `plan.env` for constants known from the start.

## Then check it — and repair until it passes

Run `/usr/bin/python3 scripts/clips/chain-check.py <slug>` and read every ✗. Fix the PLAN (a wrong
line, a missing step, a check that does not say what the line says) — never weaken a check to
make it pass. Repeat until it prints PASS (at most 5 runs). If it cannot pass because the bank's
answer itself looks wrong, write `{"refuse": "bank-answer", "why": "…"}` — that is an anomaly for
Adrian, never smoothed over.

Reply with one line: `PASS <n>/<n>` or `REFUSE <kind>: <why>`.
