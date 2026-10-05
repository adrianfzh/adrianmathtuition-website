# Work score — one read per question (practice difficulty, 5 Oct 2026)

You are scoring how much WORK each O-Level science multiple-choice question needs from a
Singapore Sec 4 student. Read-only; write exactly one output file.

Input: a JSON array of {id, topic, key (correct letter), question (markdown; `<img src>` lines
are figure URLs — you may ignore them, but count "must read a figure/graph" as work), solution}.

For EVERY question, read the question, use the solution as a check, and decide:
- steps: how many distinct steps a student must do (a recall = 1).
- ideas: the ideas/facts that must be joined.
- traps: what makes a wrong option tempting (unit change, "not" in the stem, half-way answer,
  two similar terms confused, a statement that is half true, reading the wrong axis).
- work 1–5:
  1 = one fact recalled, or a one-line substitution;
  2 = two short steps / one idea, or one fact applied to a short scenario;
  3 = three–four steps or two ideas joined, or reading data/a figure and applying a fact (typical exam question);
  4 = five+ steps, three ideas joined, several statements each to be judged, a real trap, or a graph/figure read plus a calculation;
  5 = long multi-stage reasoning with several traps; only the top students get it.
- reason: ONE plain-words line a tutor would say, max 12 words, no jargon, no mark codes,
  e.g. "4 steps: mass to moles, mole ratio, then gas volume", "one fact: bile has no enzymes".

Judge it as a student meets it, not as it is for you. Be consistent: the typical exam MCQ is a 3.

Output: a JSON array of {id, work, steps, ideas: string[], traps: string, reason}, one entry
per input id, same ids exactly. Do not write any other file, touch any database, or edit any
solution. If a question is broken (no correct option, key contradicts the solution, garbled),
still score it and add "broken": "<few words>".
