# A Math Set 2 — Fable session review, 23 Sep 2026

Two changes to the assembled papers, both in `data/gce-generated/GCE-AM-P{1,2}-seed2-2026-09-23.json`.

## P2 Q5 — replaced

The previous Q5 was "tangent through the origin" on y = (ln x)²/x style curve
(answers (1, 1) with y = x and (1/e, 0) with y = 0). The Fable moderator's
round 1 on the first replacement caught a repeat of Set 1 P1 Q13's
tangent-parallel skill (`P2-Q5/Q5.round1.verdict.json`), so the slot was
re-authored. The paper now carries:

> y = sin x / (2 + cos x), 0 ≤ x ≤ 2π. (a) Find dy/dx in simplest form [3].
> (b) Find the greatest and the least values of dy/dx and the corresponding
> values of x [4].

Key: dy/dx = (2cos x + 1)/(2 + cos x)²; greatest 1/3 at x = 0 and 2π, least −1
at x = π. Two routes (differentiate again and factorise d²y/dx² = 2 sin x
(cos x − 1)/(2 + cos x)³, or read the gradient as increasing in cos x).

Pipeline: author + repair on claude-opus-5-5, blind solver + moderator on
claude-fable-5-1 (Claude Code agents). Gates all pass (`Q5.gates.json`); the
blind examiner agrees on both parts (`Q5.blind.json`); moderator score 4, at
standard, as_good_as_set1 true, no too_close_to, no repeats_set
(`Q5.verdict.json`). The moderator's two fixes:

1. Wording of (b) — applied: the old "stating in each case every value of x"
   telegraphed the repeated end point; now SEAB's form "…and the corresponding
   values of x".
2. Partial overlap with this paper's Q4 (extremes over the range of a trig
   quantity) — NOT applied, left to Adrian. The moderator's alternative is to
   ask for the set of x on which the gradient is increasing (π < x < 2π).

## P1 Q12 — note fixed

The moderator note under Q12 was re-moderated on claude-opus-5-5; the
question text, key and marks are unchanged (`P1-Q12/`).

## Not done

No "harder P2 finisher" was written in this session; P2's last slot is as the
branch had it. The `set`/`title` fields of P1 had regressed to "Set 1" on
re-assembly and are restored to Set 2 here.

The paper and solutions PDFs/docx from this build are on the Mac at
`~/Desktop/AdrianMath/GCE Sets/AM Set 2 swap 2026-09-23/` (not committed).

## Afterwards (24 Sep 2026)

Adrian chose the ORIGINAL P2 Q5 (the tangent through the origin to
y = (1 + ln x)²/x): with the swap, Paper 2 had one unparted question where the A Math
standard asks for at least two, and the new question's part (b) overlapped Q4. The
replacement stays in `P2-Q5/` here. Same day, P1 Q8 (garden and lawn) and Q9 (screen on a
wall) gained diagrams at Adrian's request, drawn in neither answer's proportions.
