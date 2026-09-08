# Figure spec examples (A Math Set 1, seed 1)

| file | slot | family / kind | why this one |
|---|---|---|---|
| `Q7.figure.cjs` | P1 Q7 plane geometry | engine construction | circle + chords + tangent that no registry family carries |
| `Q9.figure.json` | P1 Q9 max/min | registry | a solid-shape sketch from a stated configuration |
| `Q10.figure.json` | P1 Q10 coordinate geometry | registry `coordinate-plane` | lines + points, nothing to be found printed |
| `Q13.figure.json` | P1 Q13 tangents/normals + area | registry `function-graph` | **written blind by an Opus figure-author agent** from the `figure_description` alone (9 Sep 2026, 2 render iterations) — the proof the agent step works; note the `step: 10` trick that suppresses tick numbers on a not-to-scale sketch |
| `P2-Q6.figure.json` | P2 Q6 | registry | as filed for Set 1 |
| `P2-Q10.figure.cjs` | P2 Q10 | engine construction | as filed for Set 1 |

`figure.mjs --doc engine` points at `Q7.figure.cjs`; `--doc <family>` prints the
family's own spec doc. A future description should state the axis window, which
points are labelled, whether the curve's equation is printed, and that nothing
the candidate must find appears on the figure — the four things the blind agent
had to guess.
