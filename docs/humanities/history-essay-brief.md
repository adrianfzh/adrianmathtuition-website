# Writing a History essay set — the brief (C, 7 Oct 2026)

The worked example is **y01** in `data/humanities/history/essays.json` — read it first. The level table is
`schemes.hist_evaluate` in `data/humanities/social-studies/schemes.json`, read with `structured.rules`.

The syllabus is Singapore O-Level History (the Humanities elective 2261 and Pure History 2174): the
10-mark essay, "'[A statement naming one factor.]' How far do you agree with this statement? Explain your answer."

## What one set is

`{id: "yNN", subject: "history", kind: "structured", title (the topic, 6 words at most), issue (one line),
sources: [{id: "Extract", provenance: "A starting point for your answer", text: <two plain factual
sentences that set the scene and take no side>}], questions: [two questions]}`.

Each question: `id` (`yNN-a`, `yNN-b`), `skill: "hist_evaluate"`, `marks: 10`, `sources: ["Extract"]`,
`question` in exactly the form above, and `seeded` — one answer at each of Levels 1, 2, 3 and 4.

## Rules

1. **Ours.** Never copy or reword a school or national essay question (`docs/CONTENT-POLICY.md`). The
   statement names ONE factor for an outcome the syllabus teaches; the other factors are for the student to bring.
2. **Right.** Every date, name, figure and event is correct and is standard secondary-school History.
   If you are not certain of a number or a date, leave it out. No invented quotation, ever.
3. **The four levels, exactly.**
   - Level 1: identifies or describes — tells what happened, with no explained link to the outcome.
   - Level 2: ONE side explained properly (the given factor, with specific evidence and how it led to the
     outcome); any other factor is only named.
   - Level 3: the given factor AND another factor, each explained with its own evidence and link; the ending
     only says both mattered.
   - Level 4: the Level 3 body, then a conclusion that weighs the factors on a stated basis (one made the
     other possible; one was long-term and one the trigger; one affected more people …) and says how far
     the writer agrees. It is shown to students as the model essay.
4. Build upward: Level 3 is Level 2's explained paragraph plus a second; Level 4 is Level 3's body plus the
   weighing conclusion in place of the flat ending.
5. Plain words, short paragraphs with a blank line between them, no quotation marks, 420 words at most.
   Never the tutor's name, never a model's name.

## The sets

| id | topic |
|---|---|
| y01 | Hitler's rise to power (question a done — add question b on how Hitler consolidated power or won support 1933–39) |
| y02 | The Treaty of Versailles and its effect on Germany |
| y03 | The League of Nations in the 1920s and 1930s |
| y04 | Militarist Japan and the road to war in the Asia-Pacific |
| y05 | The outbreak of war in Europe, 1939 |
| y06 | The defeat of Germany and of Japan in the Second World War |
| y07 | The origins of the Cold War in Europe |
| y08 | The Korean War |
| y09 | The end of the Cold War |
