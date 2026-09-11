# Methods that are NOT in the Secondary syllabus

> The one list every surface that writes maths for a Sec student follows — the
> chat solver (bot `prompts/base-math.txt`, the Sec banned list), the question
> generator, the Practice Again / revision / worksheet writers, the GCE Set
> papers. A Sec answer, worked example or solution that uses one of these is
> wrong for the student even when the maths is right: the method earns no marks
> and the student has never met it. Adrian, 11 Sep 2026, after a Practice Again
> sheet and the bot both answered a quadratic with a known root by α + β / αβ:
> "there are no sum and product of roots in secondary syllabus (it has been
> taken out of syllabus a long time ago)".

Applies to E Math (4052), A Math (4049) and everything below them (S1, S2, IP
Year 1–4). JC is a different list (only items marked † are banned there too).

| Not in the Sec syllabus | Use instead |
|---|---|
| **Sum and product of roots** (α + β = −b/a, αβ = c/a, "Vieta") — left A Math years ago | A known root: **substitute** it to find the coefficient, then factorise or use the formula for the other root. "Difference of the roots" / "one root is k times the other": write both roots from the quadratic formula and work with them. |
| Factorials, n! and nCr as n!/(r!(n−r)!) | Expanded products: nC2 = n(n−1)/(1×2), 8C3 = (8×7×6)/(1×2×3) |
| Vector dot / scalar product for an angle | Distance formula for the three sides, then the cosine rule |
| Newton-Raphson, iteration, bisection | Algebra |
| Proof by induction | — (not asked at Sec) |
| Integration by parts | It is a "hence" from an earlier differentiation part |
| Maclaurin / Taylor series | Binomial expansion, positive integer n |
| Implicit differentiation as a bare technique | Chain rule with an explicit intermediate variable |
| † General solutions of trig equations (+360°k, +2kπ) | Basic angle + quadrant over the given range |
| † L'Hôpital's rule | Factorise / rationalise |
| † Partial-fractions cover-up method | Substitute x-values or compare coefficients |
| † Intermediate Value Theorem by name | The sign-change argument |

## Bank rows that genuinely test one of these

A question whose *design* is the banned method (e.g. "find the equation whose
roots are α/β² and β/α²") is filed `questions.legacy_syllabus = true` — the
serving RPCs (`practice_next`, `practice_pool`, `practice_subgroups`, the kiosk
and print pools) and `revision_lib.fetch_pool` all exclude it. A question that
is in syllabus but whose STORED SOLUTION merely chose the banned route gets its
solution rewritten, not a flag. 11 Sep 2026: 10 rows flagged (7 school-sourced
sum/product questions from 2013–2022 papers, 3 AI-generated), the GCE 2012 P1
Q11 and 2017 P1 Q4 rows were already flagged, and the A Math Set 1 Q8 marker
solution lost its "alternative (sum and product of roots)" route.

## When the list changes

A new frontier model does not move this list — the syllabus does. Add a row
with the date and Adrian's words; mirror it in the bot's `prompts/base-math.txt`
Sec banned list and `ai/generation-worker.js`, and add a method-eval case there.
