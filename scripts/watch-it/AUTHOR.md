# ▶ Watch it — the authoring brief (one batch of science MCQs)

You write the animated solutions ("▶ Watch it") for a batch of science MCQs.
Adrian, 5 Oct 2026: *"build the watch it animations for kinematics and chemical
calculations"*. A clip plays on a chalk board under the worked solution: the
working writes itself step by step, a graph draws itself, the answer lands.
You do NOT write HTML or code — you write a small JSON **spec** per question;
`src/lib/watch-it.ts` turns it into the clip.

## Your job

1. Read your batch file (`scripts/watch-it/work/<topic>-batchNN.json`): each
   item has `id`, `question_text`, `solution`, `answer` (the bank's letter),
   and `image` (a URL when the question has a figure).
2. For EVERY question decide: does an animation add something?
   - **Kinematics — yes** when the motion has numbers a graph can show:
     a speed–time / velocity–time / distance–time graph (given, or drawn from
     the question's numbers), a gradient (acceleration / speed), an area
     (distance), average speed over stages. **No**: definitions, "which
     statement", scalar/vector recall, a one-line formula with nothing to draw,
     a graph you cannot read exactly.
   - **Chemical calculations — yes** for multi-step mole working: mass → moles
     (÷ Mr) → mole ratio from the equation → moles → mass / volume /
     concentration; limiting reagent; gas volumes; percentage yield / purity
     with a moles step. **No**: one division or one Mr sum on its own, pure
     recall (definition of a mole, Avogadro's number facts), a solution that is
     unclear or that you think is wrong (skip it and say why).
3. Write the spec — or `{"skip": "<short reason>"}`.
4. Run the checker and fix until it passes:
   `cd /Users/adrianfong/dev/adrianmathtuition-website && npx tsx scripts/watch-it/check.ts scripts/watch-it/work/out/<your-batch>.json`
5. Write ONLY your out file. Touch nothing else in the repo; never commit.

## The one rule: never say anything the solution doesn't

The clip is the written solution, animated. Its lines are the solution's own
steps in the solution's order with the solution's numbers. You may split a long
solution line into two, write a quantity with its unit, and say in words what a
step does. You may NOT add a method the solution does not use, a number it does
not contain, or a claim it does not make. The checker enforces the numbers:
every number on the board, in a spoken line, in a label and in the graph's
points must appear in the question or the solution, or be the result of
arithmetic you declare in a `check` / `derived` entry (which it re-does).
Constants it accepts without a source: 0, 1, 2, 10, 24, 24000, 22.4, 60, 100,
1000, 3600, 0.5.

**Kinematics and the graph.** Draw a graph only when the solution's own
reasoning is the graph's (an area, a gradient, average speed = the trapezium's
area, v = at from rest = the line's gradient). If the solution solves it with
v² = u² + 2as alone, skip unless the graph's area or gradient IS the solution's
number. A figure in the question: open the image (`curl -s -o /tmp/<id>.png
"<image>"` then Read it) and use only values printed on it or read in the
solution.

## The spec

Common fields:

```
qid          the question id (same as the key)
kind         "graph" (kinematics) | "moles" (chemical calculations)
topic        "Kinematics" | "Chemical Calculations"
answer       the bank's letter, e.g. "B"
answerText   the option's value as KaTeX, exactly the option's number: "30.3\\ \\text{g}"
heading      ONE short line naming the question (≤ 50 chars): "Mass of CFC 12 from 10 g of HF"
derived      optional [{expr, value}] — a number the text does not print (a unit conversion)
figure       optional [numbers] — values PRINTED on the question's figure (a graph's labelled
             times / speeds), read by you off the image. Only for a question with an image;
             only values printed as labels or gridline numbers, never an eyeballed reading.
beats        the clip, in order (≤ 7 beats; the answer beat is added for you)
```

A beat: `{ "say": …, "line"?: {tex, stage?, why?, check?}, "piece"?: [k…], "ratio"?: [i, j] }`
- `say` — spoken, plain English, ≤ 200 chars, NO TeX characters ($ \ ^ _ { }).
  Say numbers as digits ("0.25 moles", "10 metres per second squared").
- `line.tex` — the board line, bare KaTeX, ONE step (`n(\\text{HF}) = \\dfrac{10}{20} = 0.5\\ \\text{mol}`).
  Units as `\\ \\text{m/s}`, chemical formulas as `\\text{CO}_2`. Keep a line under ~34 characters
  of maths so it fits a phone; split a longer one into two beats.
- `line.check` — the arithmetic the line claims, re-done by the checker:
  `[{"expr": "10/20", "value": 0.5}]` (+ - * / ^ and brackets only).
- `line.why` — graph clips only: a short note under the line ("distance = area under the graph").

**kind "graph"** adds:
```
xLabel, yLabel   "t / s", "v / (m/s)"   (distance–time: "s / m")
points           [[t, v], …] left to right, the motion's corners, from the question's numbers
pieces           what the beats reveal, by index:
  {"kind":"segment","from":i,"to":j}                      the line between points i..j (drawn on)
  {"kind":"slope","from":i,"to":j,"label":"$a = 3$ m/s$^2$"} rise/run triangle + its value
  {"kind":"area","from":i,"to":j,"label":"$24$ m"}          the region under i..j, filled
  {"kind":"value","from":i,"label":"$12$ m/s"}               dashed guides from point i to both axes
```
Every piece must be shown by some beat (`"piece": [k]`). Labels short (≤ 18
visible characters). Split a multi-stage area into its shapes (one triangle,
one rectangle …), one beat each with its line, then a beat that adds them.
Points must come from the question; never invent a time or a speed.

**kind "moles"** adds:
```
start      the quantity the question gives: "mass" | "volume" | "concentration" | "moles"
equation   {"lhs": [{"coef": 1, "tex": "\\text{CCl}_4"}, …], "rhs": [...]}   (omit when there is none)
```
Each working line carries `stage`: `mr` (an Mr sum), `moles`, `ratio` (the line
that applies the equation's mole ratio — put `"ratio": [i, j]` on that beat,
indices over lhs then rhs, to box the two species), `mass`, `volume`,
`concentration`, `percent`, `other`. The road map along the top (mass → moles →
moles → mass) is drawn from the stages; you do not write it.

## Two worked examples

```json
{
 "19897d88-284a-4bca-847f-c684584ca5ef": {
  "kind": "moles", "qid": "19897d88-284a-4bca-847f-c684584ca5ef", "topic": "Chemical Calculations",
  "answer": "B", "answerText": "30.3\\ \\text{g}",
  "heading": "Mass of CFC 12 from 10 g of HF",
  "start": "mass",
  "equation": { "lhs": [ {"coef":1,"tex":"\\text{CCl}_4"}, {"coef":2,"tex":"\\text{HF}"} ], "rhs": [ {"coef":1,"tex":"\\text{CF}_2\\text{Cl}_2"}, {"coef":2,"tex":"\\text{HCl}"} ] },
  "beats": [
   { "say": "We start from 10 grams of hydrogen fluoride. First, its relative molecular mass.", "line": { "tex": "M_r(\\text{HF}) = 1 + 19 = 20", "stage": "mr", "check": [{"expr":"1+19","value":20}] } },
   { "say": "Mass divided by Mr gives the moles: 10 over 20 is 0.5 moles.", "line": { "tex": "n(\\text{HF}) = \\dfrac{10}{20} = 0.5\\ \\text{mol}", "stage": "moles", "check": [{"expr":"10/20","value":0.5}] } },
   { "say": "The equation says 2 moles of HF give 1 mole of CFC 12, so halve it: 0.25 moles.", "ratio": [1, 2], "line": { "tex": "n(\\text{CF}_2\\text{Cl}_2) = \\dfrac{0.5}{2} = 0.25\\ \\text{mol}", "stage": "ratio", "check": [{"expr":"0.5/2","value":0.25}] } },
   { "say": "Now the Mr of CFC 12: 12, plus two fluorines, plus two chlorines, is 121.", "line": { "tex": "M_r(\\text{CF}_2\\text{Cl}_2) = 12 + 2(19) + 2(35.5) = 121", "stage": "mr", "check": [{"expr":"12+2*19+2*35.5","value":121}] } },
   { "say": "Moles times Mr gives the mass: 0.25 times 121 is 30.25 grams, about 30.3 grams.", "line": { "tex": "m = 0.25 \\times 121 = 30.25 \\approx 30.3\\ \\text{g}", "stage": "mass", "check": [{"expr":"0.25*121","value":30.25}] } }
  ]
 },
 "2609a9a3-5866-4989-9d99-08bfaefae4a7": {
  "kind": "graph", "qid": "2609a9a3-5866-4989-9d99-08bfaefae4a7", "topic": "Kinematics",
  "answer": "C", "answerText": "125\\ \\text{m}",
  "heading": "Free fall for 5.0 s — how tall is the building?",
  "xLabel": "t / s", "yLabel": "v / (m/s)",
  "points": [[0,0],[5,50]],
  "pieces": [
   { "kind": "segment", "from": 0, "to": 1 },
   { "kind": "slope", "from": 0, "to": 1, "label": "gradient $= 10$ m/s$^2$" },
   { "kind": "value", "from": 1, "label": "$50$ m/s" },
   { "kind": "area", "from": 0, "to": 1, "label": "$125$ m" }
  ],
  "beats": [
   { "say": "In free fall the speed-time graph is a straight line from rest.", "piece": [0] },
   { "say": "Its gradient is the acceleration, 10 metres per second squared.", "piece": [1] },
   { "say": "After 5.0 seconds the speed is 10 times 5.0, which is 50 metres per second.", "piece": [2], "line": { "tex": "v = 10 \\times 5.0 = 50\\ \\text{m/s}", "check": [{"expr":"10*5.0","value":50}] } },
   { "say": "The height is the area under the graph: a half, times 50, times 5.0, is 125 metres.", "piece": [3], "line": { "tex": "h = \\tfrac{1}{2}(50)(5.0) = 125\\ \\text{m}", "why": "distance = area under the graph", "check": [{"expr":"0.5*50*5.0","value":125}] } }
  ]
 }
}
```

## Output

`scripts/watch-it/work/out/<batch file name>` (same name as your batch file),
one key per question in the batch — a spec or `{"skip": "…"}`. Every question
appears. Finish only when the checker prints `0 fail`. Report: how many specs,
how many skips (with the commonest reasons), anything odd in the bank (a wrong
answer letter, a broken solution) — those go to Adrian.
