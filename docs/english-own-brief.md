# Brief — writing our own English sets (1184 Paper 1 editing, Paper 2)

For the writer of a batch (an Opus agent, or a session). Read `src/lib/english-own.ts` (the
shape and every check) and the five pilot files in `data/english/sets/` first — copy their shape,
not their topics. Report once, at the end. No progress messages.

## The one rule

**Every word is ours.** The language bank shows what a paper looks like: the question types, the
mark spread, how hard it is. You may look at a banked set for that. You may not copy a passage, a
sentence, a question or a scheme from it, and you may not reword one lightly. New topic, new
people, new sentences. `npx tsx scripts/english-own/novelty.ts` fails a set that shares a run of
8 words with the bank; a failed set is rewritten, never shipped.

Also: no real person, no brand, no real organisation's campaign. No made-up statistics in an
article — argue from reasons and everyday examples. Singapore settings a 15-year-old knows.
No school, year or exam name anywhere.

## The four kinds

| Kind | File | Shape | Marks |
|---|---|---|---|
| Editing | `edNN.json` | 12 lines of 9–15 words; first and last correct; 8 of lines 1–10 have ONE wrong word (grammar only: tense, agreement, verb form, word form, preposition, article, pronoun, connector, plural); 2 clean. Mix the kinds — no kind more than twice. Each wrong word stands once in its line. A short plain note per error. | 10 |
| Visual text | `vtNN.json` | **Two texts, as in 1184 Paper 2 Section A** (14 Oct 2026). Text 1: a poster / webpage / post from blocks (kicker, headline, tagline, picture-in-words, body, box, quote, small, button), 90–220 words, with a picture. Text 2: 1–3 short paragraphs, 70–200 words, on the same topic from another angle (a blog, an interview, a letter, a forum post, a news extract). Each has an `intro` line saying what it is ("Text 1 is a webpage for …", "Text 2 is taken from a blog post by …"). | 5, in 4–6 questions — see below |
| Narrative | `naNN.json` | a story, 500–750 words, 7–10 paragraphs, with feeling under the surface so there is something to infer | 20: about 12 questions; language use and inference carry most; one "which word", one "two details", two "in your own words" |
| Non-narrative | `nnNN.json` | an article, 480–700 words, 6–8 paragraphs | 10 (about 7 questions, one a choice on purpose or tone) + a summary on two or three named paragraphs with 10–12 clear points |

### Visual text — the question mix (from 2025 school prelims, read for shape only)

Every set has: at least one **choice** ("tick" — 3 options, one plainly best); one **short**
question with skill `visual` on how the **picture** supports the words (name the picture, link it
to the message); one **short** question asking for a sentence or phrase **from Text 2** that
supports an idea in **Text 1** (skill `evidence`; the scheme is the sentence itself, `accept` a
shorter right part of it); one question on **both texts together** (its stem or text says
"Texts 1 and 2" or "both texts" — purpose, tone, audience, or "Text 1 / Text 2 / Both / Neither").
Two patterns, both 5 marks:

- **A** — 1 choice: the main message or the best title of Text 1 · 2 the picture [1] · 3 words from
  Text 2 for Text 1 [1] · 4a + 4b two choices on both texts sharing a stem [2].
- **B** — 1a + 1b "Text 1 / Text 2 / Both / Neither" choices [2] · 2 the picture, **2 marks**
  (`points`: what it shows · how that backs the words; seed a `half`) · 3 words from Text 2 for
  Text 1 [1].

Keep "the use of language for effect" in each set: a choice on tone or on what a phrase does, or
a short question on a phrase. Write the instructions in our own words — never the exam's stock
sentence ("Look at Texts 1 and 2 and statements (a) and (b) below…"); the copy check counts a run of
12 words in a question. A choice's options never begin with a bare letter word ("A", "B").
The pilot is `vt01.json` (pattern A).

Questions point at **paragraphs**, never line numbers. A two-part question is two questions
(`4a`, `4b`) sharing a `stem`.

## The scheme

`answer` is one plain sentence a student could have written. `points` when the marks are
separable (one point a mark, or "any two of three"). `accept` for other right answers. A choice's
`answer` is the right option's exact words. No mark codes except `[1]` after a separable idea.

## The seeded answers — the bench's truth

Every short question: at least five, each written the way a Sec 4 student writes, at a mark you
are sure of — `full` (the scheme's idea), `paraphrase` (same idea, other words — full marks),
`half` (2-mark questions: exactly one of the two ideas — make both halves), `wrong`, `vague`
(true but says nothing — 0), `lifted` (the passage's own words; 0 on an "own words" or "what does
it suggest" question). Do not write a seed whose mark two teachers would argue about.
A summary: five seeds of 80 words or fewer with `hit` = the points each one makes (one near all,
one about half, one thin, one off the named paragraphs = none, one lifted but on the points).

## Before you report

1. `npx tsx scripts/english-own/build.ts` — every set fit.
2. `npx tsx scripts/english-own/novelty.ts --sets <yours>` — all ours.
3. Read each passage aloud in your head once. Would a teacher set it? If it reads like filler, rewrite it.
4. Editing: read each wrong line — is there exactly ONE wrong word, and only one way to fix it
   (or list the second in `accept`)? Read each clean line — is it really clean?

The bench (`scripts/english-bench/run.ts --sets …`) is run by the orchestrating session, not by you.
