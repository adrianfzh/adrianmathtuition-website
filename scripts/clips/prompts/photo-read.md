# Question clip — read ONE printed question off a student's hand-in photos (§9b)

A student handed in a paper; the marking did not match it to the question bank, so the only
copy of the question is the photo. Your job: copy the PRINTED question, word for word, so a
clip can be made from it. You do not solve it.

## Read

- `photo-input.json` in the run folder (path given): `question_number`, `marker_readings` (the
  marker's SHORT retelling of the question — it drops words and sometimes numbers; use it only
  to find the question on the page), `photos` (image files — open each with Read), `level_hint`,
  `topics` (the allowed topic names for the level).

## Copy rules

- Copy the printed question EXACTLY: every word, number, condition, unit, and every part label
  `(a)`, `(b)`, `(i)` with its text. Maths in TeX inside `$…$` (`$\frac{2x+3}{(x-1)(x^2+4)}$`).
  Drop the marks in brackets (`[3]`) and the answer lines.
- IGNORE everything handwritten: the student's working, ticks, the marker's ink. Only print.
- The question may run across two photos (the bottom of one page, the top of the next) — join it.
- If a word or number is not readable, do NOT guess: refuse `unreadable`.

## Write `photo-read.json` in the run folder

```json
{ "question_text": "<the whole question, verbatim, parts included>",
  "parts": [ {"label": "(a)", "text": "…"} ],        // [] when it has no parts
  "level": "AM" | "EM",
  "topic": "<ONE name from topics — the topic the working is mostly about>",
  "figure": true | false,       // the question prints a diagram/graph/table needed to answer it
  "whole": true | false,        // you could see ALL of the question (stem and every part)
  "refuse": null | "<unreadable|not-whole|not-found>", "why": null | "<one plain sentence>" }
```

Refuse (still fill what you can) when the question is not on the photos (`not-found`), part of it
is cut off (`not-whole`), or a value cannot be read (`unreadable`). A figure is NOT a refusal here —
just set `figure: true` (the pipeline refuses it with its own reason).

Reply with one line: the first 80 characters of question_text, or the refusal.
