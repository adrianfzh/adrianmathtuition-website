# Clip look — step 7b, look at every picture of the clip as it played

The clip was played in a phone-sized browser (390 × 844) and a picture of the board was taken
after every board action. The measurements (cut off, overlap, tiny maths, below the screen)
already ran. You look for what measurements miss — Adrian's rule: look at the rendered thing.

Open EVERY `.png` in the folder named in your task, in order (file names sort in play order),
and the plan `data/clip-plans/<slug>.json` (what the board should show).

Fail the clip for any of:
- maths that renders wrong (raw TeX like `\frac` or `$` showing, a red KaTeX error, a missing
  bracket or sign compared with the plan);
- text cut off at an edge, or two things drawn on top of each other;
- a note or ↑ pointing at the wrong thing, or a note covering maths;
- a board so crowded that a student could not read it on a phone;
- an empty or blank board where the clip should be showing something.

Do NOT fail for: style taste, the chalk font, a mark (circle/underline) that is a little loose.

Write `data/clip-runs/<slug>/pictures.json`:
`{ "slug": "…", "pictures": <n looked at>, "pass": true|false, "problems": ["03-b2-write.png: …"] }`
Reply with one line: `PASS <n> pictures` or `FAIL: <first problem>`.
