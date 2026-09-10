# Content policy — other people's exam questions

Agreed with Adrian on 11 Sep 2026, after the 2025 Ten-Year-Series papers went
into the bank. Not legal advice; it is the working rule the code enforces and
every session follows. Read it before adding any surface that hands a bank
question to a student or to the public.

## The facts it rests on

- Every exam paper is someone's copyright the moment it is written. No © line
  and no registration is needed. A school's paper belongs to the school (MOE for
  government schools); GCE papers belong to SEAB, UCLES and MOE.
- The bank (Supabase `questions`) holds three kinds of row:

  | origin | rows (11 Sep 2026) | the rule |
  |---|---|---|
  | school papers (prelims, SA1/SA2, MY, Promo…) | 35,186 | tolerated industry practice: mark against them, hand a few out at a time, never whole papers, never in public |
  | national papers — `school = 'GCE'` (GCE, TYS, SEAB specimen) | 1,875 | **grounding-only**: SEAB sells them and licenses the TYS publishers, so they are never served as new material |
  | our own (`ai_generated`, Set papers, twins) | 455 | ours; the long-run serving bank |

- Singapore's Copyright Act 2021 replaced closed "fair dealing" with open "fair
  use" judged on four factors (purpose and character; nature of the work; amount
  taken; effect on the market). "Research or study" keeps a safe harbour for a
  person copying a reasonable portion for their own learning — a student, not a
  business. The computational-data-analysis exception covers analysing a copy
  you had lawful access to, as long as you never redistribute it — which is
  exactly the marker's and the solver's use.
- Attribution is honesty, not permission. It keeps the rights notice intact and
  shows good faith; it does not make an unlicensed copy lawful.

## Two sides of the bank

**Grounding** — the marker (`paper_schemes` → attached library PDF → the bank →
rules) and the chat solver read a question and its key to check a student's
OWN work on a paper the student already holds. Nothing is copied to anyone.
Every row, national ones included, stays on this side.

**Serving** — the practice picker (`practice_next` / `practice_pool`), the timed
set, Find a question (`lib/find-assign.ts`), Print a paper (mock builder), the
kiosk and worksheet pools (`kiosk_pool`, `/api/bot/worksheet`), From Adrian
(`practice_candidates`), the Practice Again and revision sheets (the
`self-study-sheet` and revision skills' PostgREST searches). These hand a bank
question to a student as new material. **National rows are excluded here** —
`questions.national` is a generated column (`school = 'GCE'`), the four RPCs
carry `and not q.national`, `lib/portal-find.ts practiceEligibility` refuses
`national` / `school = 'GCE'` for every direct read, the print-paper query
carries `.eq('national', false)`, and the skills' queries carry
`national=is.false`. Any NEW serving surface must do the same; the test in
`portal-find.test.ts` pins the gate.

## The six rules

1. **Never on a public, indexable page.** Public pages (`/`, the SEO landing
   pages, `/notes`, `/revise`, `/explain`) carry our own material only. The
   explain page is `noindex` and disallowed in `robots.ts`; the one notes card
   that quoted a school paper by name had the name removed on 11 Sep 2026.
   Sample questions for marketing come from our own generated rows. Nothing
   on the public site mentions past papers at all (Adrian, 11 Sep 2026: the
   terms-page section was removed the same night it went up).
2. **Never print or sell a whole paper.** Print a paper mixes questions across
   schools by topic; Set papers are ours; the kiosk's prelim sets are admin-only.
3. **Keep the source on every row, never strip a rights notice.** `school`,
   `year`, `paper`, `question_number` stay on every bank row. Figure cleaning
   removes scan bleed and the KIASU reseller stamp only; a watermark that names
   the school or the publisher is not removed — the figure is REDRAWN from its
   spec instead (`lib/figures/`, 33 families). A redrawn figure is our own
   drawing of the same mathematics, which is the right answer to a watermarked
   one.
4. **Takedown within a day.** A request from a school or SEAB, by WhatsApp or
   email, is honoured within a day and answered politely: set `deleted_at` on
   the rows, remove the figure, and purge any cached PDF that carries them.
   There is no public takedown line (Adrian's call, 11 Sep 2026).
5. **Lawful access.** Papers come from students' hand-ins, from what schools
   publish or circulate, and from books we bought. Nothing lifted from a paid
   site we did not pay for.
6. **National rows are grounding-only** (above).

## Where this is going — twins

Adrian, 11 Sep 2026: *"creating questions based off the schools' questions and
then serving our own questions … in the end our serving bank will just be
wholly our own questions. need to consider running as a proper company."*

The end state: every served question is ours. The route is a **twin** per
served school question — same skill and same difficulty, but a fresh
expression: new numbers, new context, our own wording, our own redrawn figure,
our own worked solution, verified by solving. Copyright protects expression, not
the idea of a question, so a twin that merely swaps one number is not enough;
a twin that reads as a new question is ours. The machinery exists (the
"Made for you" generator, the GCE-format generator, Set papers, the `verified`
gate in `practice_next`); what is missing is the batch: generate twins for the
topics students actually draw from, verify, mark `verified`, and flip each
topic to twins-only once its coverage matches the school rows it replaces.
The spec is [`SPEC-TWINS.md`](../SPEC-TWINS.md); phasing and cost are there.
