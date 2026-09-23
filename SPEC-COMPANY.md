# SPEC — The company: a student app, a marking app for tutors, and the segments each serves

> Drafted 23 Sep 2026 at Adrian's ask: *"I want to create an edtech company based on
> subscriptions on student portal rebranded as an app, add science subjects for sec level
> first, sell them through app stores, and also another app selling marking solutions to
> tutors — create solutions covering different segments of the market. Pure app/web
> solutions to achieve greater scales."*
>
> **Status: a plan, nothing built.** This is the umbrella over the specs that already hold
> the detail — it does not repeat them, it orders them and fills the gaps between them:
> [`SPEC-PUBLIC-LAUNCH.md`](SPEC-PUBLIC-LAUNCH.md) (the front door, pricing shape, showcase),
> [`SPEC-STUDENT-APP.md`](SPEC-STUDENT-APP.md) (the iOS shell, PencilKit, scanner, push),
> [`SPEC-TUTOR-TOOLS.md`](SPEC-TUTOR-TOOLS.md) (the tutor product, the multi-tenant delta),
> [`SPEC-MARKING-CALIBRATION.md`](SPEC-MARKING-CALIBRATION.md) (per-teacher truth),
> [`SPEC-SCIENCE-MARKING.md`](SPEC-SCIENCE-MARKING.md) + [`SPEC-SCIENCE-BENCH.md`](SPEC-SCIENCE-BENCH.md)
> (the science brains and how they are measured), [`SPEC-TWINS.md`](SPEC-TWINS.md) and
> [`docs/CONTENT-POLICY.md`](docs/CONTENT-POLICY.md) (what may be served to the public).
> Every price and every "first" below is a proposal; §12 lists what only Adrian decides.

## 0. The one-line position

**One engine, two apps.** The engine is what nobody else in Singapore sells: a handwritten
script marked the way a teacher marks, part by part, with a cover that shows where the marks
went and a sheet written for what that student got wrong. The **student app** sells it to
students (and their parents) as a subscription; the **tutor app** sells the same engine to
teachers under their own name. Science is the second subject family in both, Sec first.
"Pure app/web" means **no person in the per-paper loop**: a paper is handed in, marked,
released and followed up without anyone touching it; people set the standard and answer
the disputes.

## 1. The starting line, in numbers (read live 23 Sep 2026)

| | Today |
|---|---|
| Papers marked | 287 all time, **187 in the last 30 days**, for 31 students |
| Subject mix (30 days) | math 181 · physics 3 · biology 3 |
| Pages per paper | 15 on average; 4.6 minutes of machine time per paper |
| **Cost per paper, API lane** | **US$2.27 average** (median 2.03, 90th percentile 3.21), about US$0.19 a page — 91 papers |
| Cost per paper, plan lane | US$0.44 (the page reads are on the Claude plan; only assembly is billed) — 156 papers |
| App accounts | 21, all tuition students, all active in the last 30 days |
| **Passes sold to outsiders** | **0** — the S$29 / S$49 passes have been live on Stripe since 28 Aug 2026 with no public door in front of them |
| Math bank | ~39,000 questions: JC2 8.9k · EM 5.3k · AM 5.1k · S1 3.6k · S2 3.9k · JC1 3.4k · N(A) 4.3k · S3 levels 4.2k · N(T) 0.3k |
| Science bank | 22,400: physics 7.6k · chemistry 6.2k · biology 3.8k (all with solutions) · lower-sec science 4.8k (**no solutions, no embeddings**) |
| Science marking | three brains built; **not through the gate** (physics grade A/C/E scripts +3/+3/+8 on single runs); the seeded bench is specced, not built |
| Built but hidden from students | practice picker, timed sets, notes reader, animated lessons, science tab, essays, practice photo |

Two things follow. **Demand from outsiders is untested** — the first job is to find out
whether strangers pay, not to build more. And **the cost that makes tuition marking nearly
free (the plan lane) is not a cost a company can plan on** — §7.

## 2. The market, briefly

*(Facts with sources in §2.1; the segment table in §3 is where they are used.)*

- The buyer is split: a secondary student decides what to use, a parent pays for anything
  bigger than pocket money, and a tutor or centre decides for their own students. Every
  segment below names who decides and who pays.
- **2027 is the first year of the new national exam.** 2026 is the last O-Level; from 2027
  Sec 4 students sit the Singapore-Cambridge Secondary Education Certificate (SEC), subjects
  at G1 / G2 / G3 (≈ the old N(T) / N(A) / O-Level), with new syllabus codes (§2.1). A format
  change is the moment families look for new material — the same lever grail.moe used for
  the 2026 PSLE format. **Be in the stores by January 2027**, the start of that cohort's exam
  year, with the marker's syllabus map already on the 2027 codes.
- **The size of it.** A year of O-Level candidates is about 22,500, N-Level about 13,500
  (9,000 N(A) + 4,500 N(T)), A-Level about 11,000; households spent S$1.8 billion on tuition
  in 2023. Cambridge's June 2026 series had 231,100 O Level and 757,000 IGCSE entries
  worldwide, Pakistan the largest O Level market. Singapore is the proving ground; the scale
  is the Cambridge world (segment I).
- **The gap is real.** No Singapore student app found marks a whole photographed paper line by
  line: Tutorly (S$49 a month, all levels) takes photos but says it does not check working line
  by line; grail.moe sells generated papers on credits. For tutors, **MarkPilot** (Singapore)
  marks Primary 5 maths against MOE rubrics and sends parents WhatsApp recaps — the nearest
  competitor to the tutor app, at a different level; CoGrader and EssayGrader (US) mark essays
  only; Graide and Graded Pro (UK) mark STEM for institutions.
- The school calendar sets the selling seasons: January (new year, new tuition), May
  (mid-years), July–September (prelims), October–November (the national papers). Nothing
  launches in the middle of the national papers.
- Our marker is already built on Cambridge's marking convention (M/A/B marks, error carried
  forward, the Cambridge Example Candidate Responses booklets used as calibration), which is
  the convention of Cambridge O Level and IGCSE worldwide — the international segment in §3
  is the same engine with a different syllabus map.

### 2.1 Verified facts (research pass, 23 Sep 2026)

Most official pages could only be read through search excerpts; confidence is marked.

| Fact | Source | Confidence |
|---|---|---|
| 2026 is the last O-Level; the SEC replaces O, N(A) and N(T) from 2027. G1 = N(T), G2 = N(A), G3 = O-Level | aacrao.org (SEC news); moe.gov.sg Full SBB secondary page | medium-high |
| 2027 SEC codes — Mathematics G3 **K310**, Additional Mathematics G3 **K341**, G2 Maths K210, G2 Add Maths K232, G1 Maths K110; Physics G3 **K323**, Chemistry G3 **K324**, Biology G3 **K325**, combined Science G3 **K326 / K327 / K328** (which pair is which not confirmed) | seab.gov.sg 2027 syllabus PDFs (K341, K323–K325, K328); MOE-hosted K310 | high |
| O-Level 2025: 22,468 candidates · N(A) 8,987 · N(T) 4,479 · A-Level 10,977 | MOE press releases 14 Jan 2026, 18 Dec 2025, 27 Feb 2026 | high |
| Household tuition spending S$1.8 bn (2023), S$104.80 a month per household | SingStat HES 2023 release, 28 Nov 2024 | medium-high |
| Cambridge June 2026: 231,100 O Level entries, 757,000 IGCSE entries; codes 4024 / 4037 / 5054 / 5070 / 5090 current | tes.com Aug 2026; cambridgeinternational.org syllabus pages | medium-high |
| **Apple**: 15 % commission in the Small Business Program (≤ US$1 M proceeds a year), subscriptions included from the first cycle | developer.apple.com Small Business Program + Subscriptions | high |
| **Apple, Singapore storefront**: a digital subscription **must** be sold by in-app purchase (3.1.1); no link-out to web payment (link-outs exist only in the US and a few named regions); 3.1.3(b) lets a web buyer use what they bought, **provided the same items are also sold in-app**, and the app may not point to the web price | App Review Guidelines, current version | high |
| **Google Play, Singapore today**: 15 % on subscriptions from day one; the new 10 % + 5 %-billing model reaches "rest of world" by 30 Sep 2027; no alternative billing confirmed for Singapore | developer.android.com blog Mar + Jun 2026; RevenueCat | medium |
| Under-18 purchases: Apple **Ask to Buy** (a parent approves; on by default under 13, prompted under 18); Google **Family Link** purchase approval for supervised accounts | support.apple.com; support.google.com/families | medium-high |
| Competitors: Tutorly S$49 / month (photos, not line by line); grail.moe credits S$3–15; MarkPilot (SG, P5 maths for tutors, WhatsApp recaps); CoGrader US$15–19 / month (essays); Graide, Graded Pro (UK STEM, institutions) | the products' own pages | medium |
| **PDPC children's data guidelines (28 Mar 2024)**: a child is under 18; "technology-aided learning" named in scope; 13–17 may consent themselves if the notice is understandable to them, under 13 needs a parent; children's data held to a higher standard; collect only what is needed; high-privacy defaults; a data-protection impact assessment before launch encouraged | PDPC advisory guidelines (via law-firm summaries) | medium-high |

## 3. The segments, and the solution for each

The ask is "solutions covering different segments". This table is the answer; §4 and §5
describe the two apps that carry them.

| # | Segment | Decides / pays | The job they hire us for | Our solution | Price shape | How they find us | Phase |
|---|---|---|---|---|---|---|---|
| **A** | Sec 3–4 exam-year, G3 / Express (math + sciences) — ~22,500 a year | student decides; parent pays over ~S$5 | "Show me where I lose marks before the exam" | Student app: hand in → marked paper → Practice Again → Ask | first paper free → pack → monthly or season pass | free revision sheets, the showcase, friend referral (a free paper each) | **1** |
| **B** | JC H2 Math — ~11,000 A-Level candidates a year | student, often pays themselves | "Mark my H2 prelim like the examiner would" | Student app, H2 marking (the deepest bank: JC2 8.9k) | pass; higher price | same as A; JC word of mouth | **1** |
| **C** | Sec 1–2 (and lower Sec 3) | parent | "Is my child keeping up?" | Student app + **parent view** (the cover, the score, the sheet, a weekly line) | family monthly | the parent page every release sends | **2** |
| **D** | Private candidates, repeaters, home-schoolers | the candidate or parent | "Nobody marks my papers" | Student app, packs only | packs | search, forums | **2** (falls out of A) |
| **E** | G1 / G2 (the old N(T) / N(A)) — ~13,500 a year | parent; low spend | "Help my child pass" | Student app at a lower price, or seats sold to community tuition programmes (self-help groups, VWOs) | cheaper pack; seat licence | programme partners | **3** |
| **F** | Solo tuition tutor (math first, then science) | the tutor | "Stop marking at 11 pm; give parents something to see" — MarkPilot sells this at P5; nobody at Sec/JC | Tutor app: roster, class hand-in link, **marking under their name**, their own calibration | credits or monthly | tutor groups, Adrian's network, Phase 0 by hand | **0 → 2** |
| **G** | Small centre, 2–10 teachers | the owner | "One standard across my teachers; parents see progress" | Tutor app + manager view + calibration table per teacher + bulk parent reports | per teacher seat + papers | direct | **3** |
| **H** | Chains and edtechs with their own app | management | "Marking inside our app, under our brand" | Marking API / white label | per paper at volume, annual | direct | **4** |
| **I** | International Cambridge O Level / IGCSE students — 231k O Level + 757k IGCSE entries a year | parent | same as A | Student app, marking only, a Cambridge syllabus map, local-currency prices | packs + monthly | local partners, search | **4** |
| — | Government schools | — | — | **Not a target.** Procurement cycles, the Student Learning Space, and data rules make it a different business; private/international schools running Cambridge are served as H. | — | — | — |

Two rules hold across the table:

1. **Marking is the product; practice is the add-on.** Every segment pays for marked
   papers. Practice, notes, lessons and Ask keep people in the app between papers, and
   they carry content-licence limits (§8) that marking does not.
2. **Tuition students are not a segment.** They keep everything free under the tuition
   business (§6). The company never competes with it for them.

## 4. App 1 — the student app

**What it is:** today's `/app` (the "portal"), renamed, opened to the public, and wrapped as an
iOS and Android app. One codebase: the web app is the product; the store apps are shells with
three native parts (the scanner, push, and PencilKit on iPad — `SPEC-STUDENT-APP.md` §1).

**The families:** Math | Science (| Languages later) — the switcher that exists
(`components/PortalTabs.tsx FamilySwitch`). Each family's menu is Home · Hand in · Papers ·
Ask, plus Practice once the served bank is ours (§8).

**The loop a paying student lives in:**
1. Hand in — photograph or scan the paper (the scanner in the app, the camera on the web).
2. Marked — the cover ("Where your marks went"), the red-pen pages, the estimate for science.
3. Practice Again — the sheet for what they got wrong, on request.
4. Ask — photograph any question; answered, and grounded on the bank's key when the paper is
   known.
5. The parent sees 2 and 3 through a link, without an account.

**What changes from today's portal** (each is a build item in §10):

| Today | For the company |
|---|---|
| Invite-only; accounts come from Airtable enrolments | Self-serve sign-up: e-mail, Google, and — because an iOS app that offers Google login must also offer a privacy-preserving equivalent (App Review 4.8) — **Sign in with Apple**; level, subjects and exam year chosen at sign-up |
| Adrian's name and voice everywhere | The product's brand on the public hostname; the tutor's name inside a tutor's class (§5); the tuition site stays Adrian's |
| Passes on Stripe only | One **entitlements** record fed by Stripe (web), the App Store and Google Play (§7) |
| Marking on the Mac/Fly plan lane first | Company customers on the commercial API, Batch lane by default (§7) |
| Science tab behind a switch | Released subject by subject as each passes its bench (§6) |
| iOS unlisted app for enrolled students | Public listing on both stores |
| Account deletion on the web | The same, reachable inside the app (a store requirement) |

**Store rules that shape it (Singapore storefront, §2.1):** every plan sold on the web must
also be on sale by in-app purchase, and the app never mentions the web or its price;
a web buyer signs in and gets what they paid for (3.1.3(b)). Under-18 purchases go through
Ask to Buy / Family Link, so **the stores already make the parent the payer** — the family
plan and the parent view build on that rather than around it. Apple's age screen for 18+
apps does not touch a 4+ education app.

**What it deliberately is not:** a library of school papers, a generic chatbot, or a
course platform. Free notes are the front door; marking is the paid room
(`SPEC-PUBLIC-LAUNCH.md` §0).

## 5. App 2 — the tutor app ("the marking desk")

**What it is:** Adrian's own marking desk made available to other teachers — web first
(tutors mark at a laptop), with an iPad app for writing over the marked copy (the Pencil
path, which is also how their marking style is learned). Detail in `SPEC-TUTOR-TOOLS.md`
§2.1 and `SPEC-MARKING-CALIBRATION.md`; this section is the product shape.

**The loop a tutor lives in:**
1. **Set up a class** — a roster, or just a class code. Students hand in through a
   **class link / QR** in the student app or the browser, without buying anything: the tutor
   pays.
2. **Papers mark overnight** — hand-ins in the evening, marked by morning on the Batch lane
   (the cheap lane, §7), or within the hour on a higher tier.
3. **The desk** — Agree / Override on every part, re-mark a page, then release. Or release
   automatically once their calibration passes (Adrian's own switch, per tutor).
4. **Their name on everything** — the cover, the pen's lines, the Practice Again sheet, the
   parent link. The company is the engine, not the brand on the student's phone.
5. **Calibration** — ten of their own hand-marked scripts → the circled-marks reader → their
   gate; after that, their corrections on the marked copy teach the marker their style
   (`SPEC-MARKING-CALIBRATION.md` §2). Their truth never touches Adrian's.
6. **Parents** — a progress page per student they can send in bulk.

**Sold on the web.** Tutors and centres buy by card or invoice on the website. If the iPad
app sells nothing inside it, 3.1.3(b) still requires the same plans to be buyable in-app for a
web buyer to use them there — whether a class tool sold to tutors instead qualifies as an
enterprise service is settled at App Review, not assumed.

**Tiers:** Solo (one tutor) → Centre (seats, a manager view with the calibration table of
every teacher, one standard) → API / white label (a chain's own app calls the marker). The
admin tail (schedules, invoices) is **not** in the tutor app: it is the larger multi-tenant
job and centres already buy it from incumbents (`SPEC-TUTOR-TOOLS.md` §6).

## 6. Science, Secondary first

The student app launches with maths. Science joins **one subject at a time, each only
after its bench passes** — never the whole tab at once.

| Order | Subject | Why this order | Gate before release | New build |
|---|---|---|---|---|
| 1 | **Physics** — SEC G3 K323 from 2027 (O-Level 6091 this last year), and the physics section of combined science | Numericals are derivable, like maths; the brain is built | The all-or-nothing point rule (grade E over-awarded 11 half-right statements); the seeded bench `SPEC-SCIENCE-BENCH.md` §1 on 30 physics scripts within ±2 on 90 %; run-to-run noise measured | a per-subject release switch (today one switch opens all three) |
| 2 | **Chemistry** — G3 K324 (6092), and the combined section | Calculations derivable; explain parts need the scheme | Same bench, chemistry scripts | — |
| 3 | **Combined Science** — G3 K326 / K327 / K328, the subject pairs | Many Express students sit combined, not pure; one paper, two subjects | Each section passes its own subject's bench | **section routing**: the paper's pages split by section, each section to its subject's brain, one cover |
| 4 | **Biology** — G3 K325 (6093) | Answers ARE scheme points; the brain cannot know which points a school pays for | Scheme attached or a bank twin found → marked with a total; neither → **feedback-only mode**: comments on every answer, no score estimate | the feedback-only mode |
| 5 | **Lower-secondary science** (Sec 1–2) | Parent segment C; the bank has 4,751 questions with **no solutions** | Solutions + embeddings written and verified for the lower-sec bank first (a fleet job like the chem/phys/bio pass), then marking | the solutions pass; the sub-topic filing (`canonical_topics_s1sci.json` exists) |

Around the marking, per subject as it opens:

- **Ask** already answers physics, chemistry and biology for Sec 3–5 on the web and Telegram,
  grounded on the science bank (the bot's CLAUDE.md, *Science on the WEB chat*). The public app
  inherits it.
- **Practice Again for science** is refused today (`sheetQueueGuard`). It needs a science
  sheet writer: the same worker, the science bank as its search, the science brains'
  rules. Phase 2.
- **Science practice** (the picker) is built for admin preview (`SCIENCE_PRACTICE_OPEN_TO_STUDENTS`).
  It serves school questions, so for the public it waits on science twins (§8).
- **The 2027 national exam** (§2): K323–K328 (and K310 / K341 for maths) need mapping onto the
  bank's topics and the brains' rules before the store listing claims them; G2 versions follow
  with segment E.

## 7. The economics — why the price must follow the lane

**The plan lane is not a company's cost base.** Tuition marking is nearly free because the
page reads run on Claude plan logins in the Mac and Fly slots. That capacity is fixed per
account, and using a consumer subscription to serve a company's paying customers must be
checked against Anthropic's terms before anyone relies on it. **Company customers are costed
on the commercial API.** The plan lane stays for Adrian's tuition students and his own work.

**Cost per marked paper** (USD→SGD at 1.30, an assumption):

| Lane | US$ | S$ | Turnaround | Use for |
|---|---|---|---|---|
| API, synchronous (measured, on Opus 5 / 4.8 at US$5 / US$25 per Mtok) | 2.27 | 2.95 | within the hour | the premium tier |
| **API, Batch** (estimate — Batch prices the reads at half; **measure before pricing**) | ~1.20 | ~1.56 | by morning | **every default tier** |
| Plan lane (measured) | 0.44 | 0.57 | varies with the slots | tuition students only |

**Opus 5.5 (the marker's model since 23 Sep 2026) lowers every row.** It is US$4 / US$20 per
Mtok (Batch US$2 / US$10, cache reads US$0.20 — 60 % cheaper than Opus 5), and Anthropic
reports it matches Opus 5 at a lower effort with fewer tokens. The measured US$2.27 predates
the switch; expect it to fall by at least a fifth. **Re-measure on the first 20 API papers
after the switch before setting any price** — the table below is kept at the old figures so
the margins stay on the safe side.

**The price a paper must carry** for a 60 % gross margin after the payment fee:
price ≥ cost ÷ (0.4 × (1 − fee)).

| | Web (card/PayNow ~4 %) | App store (15 %: Apple's Small Business Program; Google on subscriptions) |
|---|---|---|
| Batch lane (S$1.56) | ≥ S$4.10 | ≥ S$4.60 |
| Synchronous lane (S$2.95) | ≥ S$7.70 | ≥ S$8.70 |

**What that says about today's prices:** the S$29 pass is 8 papers, S$3.63 a paper if all are
used — under water on the synchronous lane, about break-even on Batch through a store. It
works only if (a) the default is Batch and (b) the average student uses about 60 % of the
allowance. Both are measurable in the first month; neither is known.

**Proposed ladder** (Adrian sets the numbers; the SHAPE follows `SPEC-PUBLIC-LAUNCH.md` §1 —
non-renewing passes headline on the web, credits never expire):

| Student app | What | Web | Store |
|---|---|---|---|
| Free | Ask with a daily photo cap; free notes; **one marked paper, ever** | S$0 | S$0 |
| Pack | 3 marked papers, never expire | S$15 | web ÷ 0.85, rounded to a store price point |
| Standard | 30 days: 8 papers (by morning), Practice Again, Ask, parent view | S$39 | ″ |
| Intensive | 30 days: 20 papers, within the hour, Practice Again, Ask | S$69 | ″ |
| Season | dated to the national papers: prelims → last paper | set each year | ″ |
| Family | one parent account, up to three children, each on their own plan | — | Family Sharing where the store allows |

| Tutor app | What | Price (web) |
|---|---|---|
| Credits | marked papers, never expire, by morning | S$4 a paper in packs of 25 |
| Solo | 30 papers a month, the desk, calibration, their name, parent pages | S$99 / month; extra papers S$3 |
| Centre | per teacher seat, the manager view, the calibration table | S$39 / seat / month + papers at S$3 (3-seat minimum) |
| API | the marker inside another company's app | per paper at volume, annual contract |

The value anchor for tutors is their own time: a 90-mark paper takes a tutor roughly 20–40
minutes to mark by hand (an estimate to confirm with the Phase 0 tutor).

**Illustrative contribution, one Standard student:** S$39 − store fee S$5.85 − marking 5
papers × S$1.56 − Ask ~S$2 ≈ **S$23 (about 60 %)**, before fixed costs.

**The price anchor in the market:** Tutorly's S$49 a month for everything, without line-by-line
checking; a tuition hour. The Standard plan sits under both and does the one thing neither does.

**Levers, in the order to pull them:** Batch by default · the prompt cache on the scheme and
the paper (already in use) · a cheaper model on pages the classifier calls simple · per-tier
daily caps (exist) · pricing.

## 8. Content — what a public app may serve

The rules in `docs/CONTENT-POLICY.md` carry over unchanged and bite harder in public:

- **Marking and Ask are fine**: they read the student's own paper and check it against a
  key; nothing is copied to anyone.
- **Practice, printed papers, worksheets and the notes' "real bank checks" serve school
  questions.** For a public, paid product those are served from **our own questions only** —
  twins (`SPEC-TWINS.md`), Set papers, generated questions. So twins are a **prerequisite for
  opening Practice to the public**, topic by topic, not for launching the app.
- National papers (`school = 'GCE'`) stay grounding-only, as today.
- The science bank needs the same `national` gate and the same twins route before any
  science practice goes public.

## 9. The tuition business and the company

- **Two entities.** The company sells the apps, holds the store accounts and Stripe for
  outsiders, and is the party in the public terms and privacy notice. The tuition business
  keeps its students, its site, its Airtable and its Telegram bot. (`SPEC-PUBLIC-LAUNCH.md` §6.)
- **One codebase, two hostnames.** Branding follows the hostname; the tuition site keeps
  `adrianmathtuition.com`.
- **Tuition students** use the tuition site's app, free, under Adrian's name — the same
  engine. Whether they move to the company's app later is Adrian's call.
- **Data:** every row the company holds carries an organisation (§10 step 1). The tuition
  business is one organisation; "direct" public customers are another; each tutor or centre
  is one more. How the two entities share one database (a processor agreement, or a second
  Supabase project later) is a question for a lawyer, not a blocker for step 1.
- **Children's data:** every user under 18 is a child under the PDPC's 2024 guidelines (§2.1).
  13–17 may consent themselves when the notice is written so they understand it; under 13 needs
  a parent (Sec 1 students can be 12). So: a notice written for a 13-year-old, a parent step at
  sign-up for anyone under 13, collect only what marking needs, private by default, deletion in
  the app, and a data-protection impact assessment before the public launch. The short notice
  Adrian adopted on 11 Sep 2026 is the starting text.

### 9.1 The building doctrine, for the company — proposed revision (Adrian approves)

The doctrine's four "stays human" items were written for one tutor. For the company:

- **Standard** — unchanged (already revised 17 Sep 2026: the scheme and examiner convention).
- **Accountability** — for tuition students, Adrian answers, as today. For company customers,
  **the company answers**: a published accuracy record from the benches, a **"Question this
  mark"** door on every paid paper (re-marks the part through the existing page re-mark door,
  and reaches a person within two working days if the re-mark does not settle it), and a
  paper credit back when a mark was wrong by more than 2.
- **Relationships** — the tuition business's channel. The company grows by the product, the
  free notes and referral, not by Adrian's relationships.
- **Novelty** — unchanged: a person notices when the spec itself is wrong.

## 10. What has to change in the code — in order

Each step is its own session (or several), lib + tests + a health-check entry as the
testing policy requires. Steps 1–4 are the ground for everything after.

1. **Organisations.** An `orgs` table (tuition · direct · each tutor/centre); `org_id` on
   accounts, runs, assignments, notebook rows, calibration rows; RLS by org on every table a
   student reads; every admin route checks it. The tuition business is org #1 and nothing
   about it changes. (`SPEC-TUTOR-TOOLS.md` §4 "Identity".)
2. **Brand by hostname.** The name, logo, colours, the pen's signature line, e-mail sender and
   the Telegram/Push copy read from the org or the hostname — never a literal "Adrian".
3. **Entitlements.** `portal_passes` generalises to one entitlements record per account
   (source `stripe | apple | google | grant | tuition`, a papers allowance, a credits balance);
   the App Store Server Notifications and Google Play real-time notifications write to it; the
   hand-in meter reads only it. A managed service (RevenueCat) is the fast path; our own
   webhook handlers are the cheap one.
4. **The API lane for company customers.** Queue priority by tier (tuition first, then
   Intensive, then everyone else); Batch the default for every company tier; cost stamped per
   org (the ledger already stamps `cost_usd` per run); a per-org daily spend alarm on
   `/admin/ops`.
5. **Self-serve sign-up and onboarding** (`SPEC-PUBLIC-LAUNCH.md` §2): e-mail / Google / Apple,
   level + subjects + exam year, the free paper, the paywall, account deletion.
6. **Store shells.** iOS (the `SPEC-STUDENT-APP.md` workspace) and **Android** — Capacitor over
   `/app` is the shortest path to both; the scanner (VisionKit / ML Kit document scanner), push
   (APNs / FCM), PencilKit on iPad only.
7. **The parent view.** A signed, expiring link on every release; the weekly line; the family
   plan.
8. **Science, per §6** — per-subject switch, the seeded bench, section routing for combined
   papers, biology's feedback-only mode, the science sheet writer, the lower-sec solutions pass.
9. **The tutor app** — tutor accounts on org #n, the class link, the desk scoped to the org,
   their name, credits, the circled-marks reader and the Calibration tab
   (`SPEC-MARKING-CALIBRATION.md` §6).
10. **Ops per org** — the health check, `job_runs`, alarms and the Monday report name the org;
    Sentry on; a status line in the app when marking is delayed.
11. **Twins at scale** (`SPEC-TWINS.md`) — before public Practice, topic by topic.

## 11. Phases and gates

Each phase ends at a gate measured in numbers, not a date.

| Phase | When (target) | Ship | Gate to move on |
|---|---|---|---|
| **0 — Ground** | now → Dec 2026 (no public launch during the national papers) | company, brand, domain, Apple + Google developer accounts (Adrian); §10 steps 1–4; the Batch cost measured on 20 real papers; the physics bench built and passed; the SEC 2027 syllabus map; the data-protection impact assessment; **one outside tutor on the desk by hand** (`SPEC-TUTOR-TOOLS.md` §4 Phase 0) | Batch cost per paper known; physics passes its bench; the Phase 0 tutor pays for a second month |
| **1 — Student app, web then stores** | Jan–Mar 2027 | public door, showcase, free sheets, first paper free, packs, passes (web) → iOS + Android listings with in-app purchase; maths + physics marking; Ask | 200 sign-ups; ≥15 % of free-paper users buy something; "Question this mark" rate under 5 % |
| **2 — Tutor app; more science** | Apr–Jun 2027 | tutor app v1 (class link, desk, their name, credits, calibration tab); chemistry; combined science; parent view; Practice Again for science | 10 paying tutors; chemistry passes its bench |
| **3 — Breadth** | Jul–Dec 2027 | centres (seats, calibration table); biology feedback-only mode; lower-sec science; public Practice on twins; N(A)/G1–G2 pricing and programme seats; Languages (essays) as the third family | retention: paying students hand in ≥3 papers a month |
| **4 — Scale out** | 2028 | Cambridge O Level / IGCSE marking abroad; the marking API for chains | one country partner; one API customer |

## 12. What only Adrian decides

1. **The company**: name, entity, shareholders, and the brand the apps carry.
2. **Prices** — every number in §7.
3. **Android in v1** (recommended: yes — Capacitor makes it cheap, Google already charges 15 %
   on subscriptions and drops to 10 % + 5 % billing by Sep 2027, and many Singapore teenagers are
   on Android) or iOS first.
4. **Whether tuition students move to the company's app** or stay on the tuition site.
5. **The Phase 0 tutor** — who, and on what terms.
6. **The doctrine revision** in §9.1.
7. **International** (segment I) — whether it is in the plan at all.
8. **The plan lane** — confirm with Anthropic's terms how, if at all, it may be used for
   company customers; until then every company price assumes the API.
9. **Built to be sold (§14)** — the IP assignment, company-owned accounts, the brand name, and
   what happens to the school-paper bank. A lawyer should see §14.1, §14.2 and §14.5 before
   the company takes its first outside customer.

## 13. Can start now, without a decision

- Measure the Batch lane's real cost per paper on the next 20 tuition papers (the switch
  exists: `MARK_QUEUE_BATCH`).
- Build the physics seeded bench (`SPEC-SCIENCE-BENCH.md` §1) and the all-or-nothing point
  rule; split the science switch per subject.
- The lower-sec science solutions pass (content work, the extraction fleet's method).
- Draft the `orgs` migration and the entitlements shape as a proposal for review — not
  applied until §12.1–4 are settled.

## 14. Built to be sold (Adrian, 23 Sep 2026: "the company should be built in a way to be sold later")

A buyer pays for what it can own, move and run without the founder. Their lawyers look at
exactly the places below, and each one is cheapest to fix **before** the first outside
customer. Ranked by how badly each would hurt a sale. Not legal advice — §14.1, §14.2 and §14.5
are for a lawyer.

### 14.1 The question bank is other people's copyright — the biggest issue

About 35,000 bank rows are school papers and 1,900 are national papers
(`docs/CONTENT-POLICY.md`); much of the recent intake came from the "Holy Grail" harvest; some
scans carried a paid reseller's stamp (KiasuExamPaper), which one clean-up sweep removed; the
Cambridge calibration booklets came from a third-party host. A buyer cannot buy that as an
asset, and will price the risk in.

- **The company serves only its own questions.** Twins (`SPEC-TWINS.md`), Set papers and
  generated questions. Twins move from "nice to have" to **a condition of the sale** —
  topic by topic, before Practice opens to the public (§8 already says so).
- **The school-paper bank is used only to check a student's own paper** (the marker and the
  solver ground on it; nothing is copied to anyone). Keep it that way, and ask the lawyer
  whether that use belongs to the company or should stay with the tuition business under a
  licence.
- **A provenance register.** For every source file: where it came from, how it was obtained,
  when, and on what terms. The `paper_library` and extraction queue already record most of
  it; the Grail harvest and the calibration booklets are the gaps.
- **Ask the lawyer about the removed reseller stamp.** Removing another party's marking from
  a scan can be an issue of its own. The content policy's current rule (withhold, never
  scrub) is the right one from here on.

### 14.2 Everything is in Adrian's name

The code is on a personal GitHub account; Vercel, Fly, Supabase, Stripe, the domains, the
Telegram bot, the Twilio number and Airtable belong to Adrian or the tuition business; and
`SPEC-STUDENT-APP.md` planned an **individual** Apple account.

- **An IP assignment deed** moves the code, prompts, skills, specs, figures, the generated
  questions and the brand from Adrian (and from the Kix Education partnership, if it paid for
  or built any of it — its partner(s) sign too) to the company. Without it the company owns
  nothing a buyer can buy.
- **Company-owned accounts from day one:** a GitHub organisation, a Vercel team, a Fly
  organisation, a Supabase organisation, Stripe under the company's UEN, the product domain,
  and **Apple and Google developer accounts as an organisation** (Apple needs a D-U-N-S number,
  free, a week or two). An individual Apple account shows Adrian's name as the seller and
  moving an app off it later is paperwork a buyer will make you do first.
- The tuition business then **uses** the company's product under a short written agreement,
  at arm's length.

### 14.3 It runs on Adrian and his Macs

Marking reads run on Mac slots and on a Fly worker that pools three personal Claude plan
logins; the sheet worker, the launchd jobs and the iCloud paper queue live on Adrian's Macs.
A buyer cannot buy a person's Macs or subscriptions. Company customers run on company
infrastructure under the commercial API (§7 already prices it that way), with every job
documented and reproducible from the repo — which the repo docs make unusually easy.

### 14.4 The brand is Adrian's name

"AdrianMath", a red pen "in Adrian's voice", parent output signed by him: a buyer discounts a
business whose value walks out with its founder. The company's brand is not a person's name;
the pen writes in the brand's voice (and in a tutor's own name in the tutor app). Adrian can
stay the public face as head of curriculum. Register the brand at IPOS as soon as it is chosen.

### 14.5 Customer data must belong to the company

Most users are children (§9). The company must be the data controller for its own users from
their first sign-up, with a notice that allows the data to move with the business. Tuition
students' data stays with the tuition business unless they consent again. The deletion and
export paths already exist; add a record of consent per account and the data-protection
impact assessment (§11 Phase 0).

### 14.6 Revenue a buyer will value

Buyers pay most for recurring revenue with clean numbers. Non-renewing passes
(`SPEC-PUBLIC-LAUNCH.md` §1) are trusted by parents but count as one-off sales. The
compromise: the monthly plan auto-renews (store subscriptions do by default) with a plain
cancel button, and dated passes stay for exam season. From day one, keep: monthly recurring
revenue, churn, conversion from the free paper, cost per paper per org, and acquisition cost
per channel. Tuition revenue stays out of the company's books — it is a personal service and
worth nothing to a buyer.

### 14.7 Contracts that transfer

Every tutor, centre, school-partner and supplier contract is assignable to a buyer (no
change-of-control veto), and the tutor terms say what the company may do with anonymised
marking data while a tutor's own calibration stays theirs (`SPEC-MARKING-CALIBRATION.md` §4).

### 14.8 Already in good shape (checked 23 Sep 2026)

- **Documentation and tests** — the specs, runbooks and 3,351 bot tests are what a technical
  buyer hopes to find.
- **No secrets in the repos** — a scan of all three repos' files and available history found
  only public (anon) keys. The website and bot clones scanned held their last 52 and 87 commits;
  re-run the scan on a full clone before a sale.
- **Licences** — the bot's 429 dependencies are permissive, except libvips (LGPL, linked
  dynamically through sharp, which is normal for a web service).
- **Records** — the cost ledger, `job_runs`, calibration rows and the marking benches are the
  evidence a buyer's diligence asks for.

### 14.9 Order

1. Company, brand, IP assignment, company-owned accounts, Apple/Google as an organisation —
   **before** any outside customer (Phase 0).
2. Provenance register; lawyer's view on the bank and the removed stamp (Phase 0).
3. The company as data controller, consent records, the impact assessment (before Phase 1).
4. Company workloads off the Macs and the plan logins (Phase 1).
5. Twins for every topic Practice serves publicly (Phase 3 gate).

