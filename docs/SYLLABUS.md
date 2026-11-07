# Syllabus check — every note, practice, worksheet and question

> **Adrian, 7 Nov 2026:** *"make sure that anything to do with notes/practices/questions
> always check with existing syllabus for all future claude sessions with other accounts"*
> — after a session recommended adding ∫ sin px cos qx dx to the JC Integration notes because
> 2023–2025 prelims still asked it. It is no longer in H2 Mathematics 9758 (removed from the
> 2025 syllabus). School prelims are not proof that a topic is in syllabus.

## The rule (every session, every account, every model)

Before you **write, edit, recommend, review, generate, extract or answer with** any teaching
material — notes, practice sets, worksheets, revision sets, prelim/practice/mock papers, bank
questions, twins, generated questions, worked solutions, marking schemes:

1. **Find the official syllabus** for that subject and level in the table below and read the
   section for the topic (`grep -n -i "<topic>" docs/syllabus/<file>.txt`, then the lines
   around it, **including the "Exclude" lines**).
2. **Every topic AND every method** you use must be in it. A correct answer by an
   out-of-syllabus method is wrong for the student (Sec banned-method list:
   [`SEC-SYLLABUS-METHODS.md`](SEC-SYLLABUS-METHODS.md)).
3. **Out of syllabus → do not add it.** If it is already in Adrian's material, **flag it to him**
   (a red note in a corrected copy, or one line in your reply). Never silently delete his content.
4. **Say in your reply that you checked**, and which syllabus file (e.g. "checked against
   9758 (2027) §5.3").
5. If the syllabus for that subject/level is **not in this folder**, say so — do not guess from
   school papers. Fetch the official SEAB/MOE PDF and add it here (`pdftotext -layout`).

School prelim papers, past-year A-level/O-level papers before the current syllabus, and older
notes are **not** evidence a topic is in syllabus.

## The official syllabuses (text copies in [`syllabus/`](syllabus/))

From 2027 the SEC (Secondary Education Certificate) replaces O-Level and N-Level. G3 ≈ old
Express/O-Level, G2 ≈ old N(A). Content of 9758 2025 and 2027 is identical (checked 7 Nov 2026).

| Subject | Level | Code | File |
|---|---|---|---|
| H2 Mathematics | JC (A-level) | 9758 | `A-level-H2-Mathematics-9758-2027.txt` |
| H1 Mathematics | JC (A-level) | 8865 | `A-level-H1-Mathematics-8865-2027.txt` |
| H2 Further Mathematics | JC (A-level) | 9649 | `A-level-H2-Further-Mathematics-9649-2027.txt` |
| Mathematics (E Math) | Sec G3 | K310 (was 4052) | `SEC-G3-Mathematics-K310-2027.txt` |
| Additional Mathematics | Sec G3 | K341 (was 4049) | `SEC-G3-Additional-Mathematics-K341-2027.txt` |
| Mathematics | Sec G2 | K210 | `SEC-G2-Mathematics-K210-2027.txt` |
| Additional Mathematics | Sec G2 | K232 | `SEC-G2-Additional-Mathematics-K232-2027.txt` |
| Physics | Sec G3 | K323 (was 6091) | `SEC-G3-Physics-K323-2027.txt` |
| Chemistry | Sec G3 | K324 (was 6092) | `SEC-G3-Chemistry-K324-2027.txt` |
| Biology | Sec G3 | K325 (was 6093) | `SEC-G3-Biology-K325-2027.txt` |
| Science (Phy/Chem, Phy/Bio, Chem/Bio) | Sec G3 | K326–K328 (was 5086–5088) | `SEC-G3-Science-K326-K327-K328-2027.txt` |
| Science (all three combinations) | Sec G2 | K223–K225 | `SEC-G2-Science-K223-K224-K225-2027.txt` |
| English Language | Sec G3 | K300 (was 1184) | `SEC-G3-English-Language-K300-2027.txt` |
| English Language | Sec G2 | K200 | `SEC-G2-English-Language-K200-2027.txt` |
| History (pure) | Sec G3 | K330 (was 2174) | `SEC-G3-History-K330-2027.txt` |
| History (pure) | Sec G2 | K227 | `SEC-G2-History-K227-2027.txt` |
| Geography (pure) | Sec G3 | K329 | `SEC-G3-Geography-K329-2027.txt` |
| Geography (pure) | Sec G2 | K226 | `SEC-G2-Geography-K226-2027.txt` |
| Humanities (Social Studies, Geography) | Sec G3 | K335 (was 2260) | `SEC-G3-Humanities-SS-Geography-K335-2027.txt` |
| Humanities (Social Studies, History) | Sec G3 | K336 (was 2261) | `SEC-G3-Humanities-SS-History-K336-2027.txt` |
| Humanities (Social Studies, Geography) | Sec G2 | K229 | `SEC-G2-Humanities-SS-Geography-K229-2027.txt` |
| Humanities (Social Studies, History) | Sec G2 | K230 | `SEC-G2-Humanities-SS-History-K230-2027.txt` |
| Literature in English | Sec G2 | K228 | `SEC-G2-Literature-in-English-K228-2027.txt` |
| **Lower sec (Sec 1–2) Maths** | S1, S2 | — | Use K310/K210 for content + [`LOWER-SEC-SYLLABUS-SPLIT.md`](LOWER-SEC-SYLLABUS-SPLIT.md) for which year. MOE's 2020 PDF is no longer online (404, 7 Nov 2026). |

**Not here yet (say so if your task needs one):** MOE Lower Secondary Science (PDF gone from
moe.gov.sg), Chinese Language, G3 Literature / Humanities (SS, Literature) K337, the MF27 formula
list (`https://isomer-user-content.by.gov.sg/334/2b5f5938-24c2-48de-8371-f6782ac31bed/SEAB_Mathematics_MF27.pdf`).
Sources: SEAB pages "G3/G2 syllabuses for school candidates 2027" and "A-Level syllabuses examined
for school candidates 2027" (fetched 7 Nov 2026). Refresh when SEAB publishes a new year.

## Known removals that school papers still ask (add as you find them)

| Level | Not in syllabus | Syllabus line | Found in |
|---|---|---|---|
| JC H2 9758 | Integrals of products sin mx cos nx, cos mx cos nx, sin mx sin nx (factor formulae) | §5.3 lists only sin²x, cos²x, tan²x | 2024–25 prelims (CJC, JJC, SAJC, YIJC, ASRJC); JC notes Integration 1 Assignment 1 Q4(d); Integration 2 modulus example |
| JC H2 9758 | Reduction formulae | §5.3 "Exclude reduction formulae" | MI Prelim 2023 P1 Q10(b) |
| JC H2 9758 | Area / volume where the curve is parametric | §5.4 Exclude | ACJC 2024, ASRJC 2024 prelims |
| JC H2 9758 | Substitution not given in the question | §5.3 "integration by a **given** substitution" | — (state the substitution in every question you write) |
| Sec | See [`SEC-SYLLABUS-METHODS.md`](SEC-SYLLABUS-METHODS.md) | | |
