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
- **2027 is the first year of the new national exam.** The cohort that entered Sec 1 in 2024
  under Full Subject-Based Banding sits the Singapore-Cambridge Secondary Education
  Certificate instead of O- and N-Levels (verify in §2.1). A format change is the moment
  families look for new material — the same lever grail.moe used for the 2026 PSLE format.
  **Be in the stores by January 2027**, the start of that cohort's exam year.
- The school calendar sets the selling seasons: January (new year, new tuition), May
  (mid-years), July–September (prelims), October–November (the national papers). Nothing
  launches in the middle of the national papers.
- Our marker is already built on Cambridge's marking convention (M/A/B marks, error carried
  forward, the Cambridge Example Candidate Responses booklets used as calibration), which is
  the convention of Cambridge O Level and IGCSE worldwide — the international segment in §3
  is the same engine with a different syllabus map.

### 2.1 Verified facts

*(filled from the research pass — see the bottom of this file)*

## 3. The segments, and the solution for each

The ask is "solutions covering different segments". This table is the answer; §4 and §5
describe the two apps that carry them.

| # | Segment | Decides / pays | The job they hire us for | Our solution | Price shape | How they find us | Phase |
|---|---|---|---|---|---|---|---|
| **A** | Sec 3–4 exam-year, Express / G3 (math + sciences) | student decides; parent pays over ~S$5 | "Show me where I lose marks before the exam" | Student app: hand in → marked paper → Practice Again → Ask | first paper free → pack → monthly or season pass | free revision sheets, the showcase, friend referral (a free paper each) | **1** |
| **B** | JC H2 Math | student, often pays themselves | "Mark my H2 prelim like the examiner would" | Student app, H2 marking (the deepest bank: JC2 8.9k) | pass; higher price | same as A; JC word of mouth | **1** |
| **C** | Sec 1–2 (and lower Sec 3) | parent | "Is my child keeping up?" | Student app + **parent view** (the cover, the score, the sheet, a weekly line) | family monthly | the parent page every release sends | **2** |
| **D** | Private candidates, repeaters, home-schoolers | the candidate or parent | "Nobody marks my papers" | Student app, packs only | packs | search, forums | **2** (falls out of A) |
| **E** | N(A) / N(T), G1–G2 | parent; low spend | "Help my child pass" | Student app at a lower price, or seats sold to community tuition programmes (self-help groups, VWOs) | cheaper pack; seat licence | programme partners | **3** |
| **F** | Solo tuition tutor (math first, then science) | the tutor | "Stop marking at 11 pm; give parents something to see" | Tutor app: roster, class hand-in link, **marking under their name**, their own calibration | credits or monthly | tutor groups, Adrian's network, Phase 0 by hand | **0 → 2** |
| **G** | Small centre, 2–10 teachers | the owner | "One standard across my teachers; parents see progress" | Tutor app + manager view + calibration table per teacher + bulk parent reports | per teacher seat + papers | direct | **3** |
| **H** | Chains and edtechs with their own app | management | "Marking inside our app, under our brand" | Marking API / white label | per paper at volume, annual | direct | **4** |
| **I** | International Cambridge O Level / IGCSE students | parent | same as A | Student app, marking only, a Cambridge syllabus map, local-currency prices | packs + monthly | local partners, search | **4** |
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

**Tiers:** Solo (one tutor) → Centre (seats, a manager view with the calibration table of
every teacher, one standard) → API / white label (a chain's own app calls the marker). The
admin tail (schedules, invoices) is **not** in the tutor app: it is the larger multi-tenant
job and centres already buy it from incumbents (`SPEC-TUTOR-TOOLS.md` §6).

## 6. Science, Secondary first

The student app launches with maths. Science joins **one subject at a time, each only
after its bench passes** — never the whole tab at once.

| Order | Subject | Why this order | Gate before release | New build |
|---|---|---|---|---|
| 1 | **Physics** (pure 6091 and the physics section of combined science) | Numericals are derivable, like maths; the brain is built | The all-or-nothing point rule (grade E over-awarded 11 half-right statements); the seeded bench `SPEC-SCIENCE-BENCH.md` §1 on 30 physics scripts within ±2 on 90 %; run-to-run noise measured | a per-subject release switch (today one switch opens all three) |
| 2 | **Chemistry** (6092 + combined section) | Calculations derivable; explain parts need the scheme | Same bench, chemistry scripts | — |
| 3 | **Combined Science** (the physics/chemistry/biology pairs) | Many Express students sit combined, not pure; one paper, two subjects | Each section passes its own subject's bench | **section routing**: the paper's pages split by section, each section to its subject's brain, one cover |
| 4 | **Biology** | Answers ARE scheme points; the brain cannot know which points a school pays for | Scheme attached or a bank twin found → marked with a total; neither → **feedback-only mode**: comments on every answer, no score estimate | the feedback-only mode |
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
- **The 2027 national exam** (§2): the science syllabuses the SEC cohort sits need mapping
  onto the bank's topics before the store listing claims them.

## 7. The economics — why the price must follow the lane

**The plan lane is not a company's cost base.** Tuition marking is nearly free because the
page reads run on Claude plan logins in the Mac and Fly slots. That capacity is fixed per
account, and using a consumer subscription to serve a company's paying customers must be
checked against Anthropic's terms before anyone relies on it. **Company customers are costed
on the commercial API.** The plan lane stays for Adrian's tuition students and his own work.

**Cost per marked paper** (USD→SGD at 1.30, an assumption):

| Lane | US$ | S$ | Turnaround | Use for |
|---|---|---|---|---|
| API, synchronous (measured) | 2.27 | 2.95 | within the hour | the premium tier |
| **API, Batch** (estimate — Batch prices the reads at half; **measure before pricing**) | ~1.20 | ~1.56 | by morning | **every default tier** |
| Plan lane (measured) | 0.44 | 0.57 | varies with the slots | tuition students only |

**The price a paper must carry** for a 60 % gross margin after the payment fee:
price ≥ cost ÷ (0.4 × (1 − fee)).

| | Web (card/PayNow ~4 %) | App store (15 %) |
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
- **Children's data:** most users are 13–17. The public privacy notice, parental consent
  where required, data minimisation and in-app deletion follow the PDPC's guidance for
  children (§2.1). The short notice Adrian adopted on 11 Sep 2026 is the starting text.

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
| **0 — Ground** | now → Dec 2026 (no public launch during the national papers) | company, brand, domain, Apple + Google developer accounts (Adrian); §10 steps 1–4; the Batch cost measured on 20 real papers; the physics bench built and passed; **one outside tutor on the desk by hand** (`SPEC-TUTOR-TOOLS.md` §4 Phase 0) | Batch cost per paper known; physics passes its bench; the Phase 0 tutor pays for a second month |
| **1 — Student app, web then stores** | Jan–Mar 2027 | public door, showcase, free sheets, first paper free, packs, passes (web) → iOS + Android listings with in-app purchase; maths + physics marking; Ask | 200 sign-ups; ≥15 % of free-paper users buy something; "Question this mark" rate under 5 % |
| **2 — Tutor app; more science** | Apr–Jun 2027 | tutor app v1 (class link, desk, their name, credits, calibration tab); chemistry; combined science; parent view; Practice Again for science | 10 paying tutors; chemistry passes its bench |
| **3 — Breadth** | Jul–Dec 2027 | centres (seats, calibration table); biology feedback-only mode; lower-sec science; public Practice on twins; N(A)/G1–G2 pricing and programme seats; Languages (essays) as the third family | retention: paying students hand in ≥3 papers a month |
| **4 — Scale out** | 2028 | Cambridge O Level / IGCSE marking abroad; the marking API for chains | one country partner; one API customer |

## 12. What only Adrian decides

1. **The company**: name, entity, shareholders, and the brand the apps carry.
2. **Prices** — every number in §7.
3. **Android in v1** (recommended: yes — Capacitor makes it cheap, and a large share of
   Singapore teenagers are on Android) or iOS first.
4. **Whether tuition students move to the company's app** or stay on the tuition site.
5. **The Phase 0 tutor** — who, and on what terms.
6. **The doctrine revision** in §9.1.
7. **International** (segment I) — whether it is in the plan at all.
8. **The plan lane** — confirm with Anthropic's terms how, if at all, it may be used for
   company customers; until then every company price assumes the API.

## 13. Can start now, without a decision

- Measure the Batch lane's real cost per paper on the next 20 tuition papers (the switch
  exists: `MARK_QUEUE_BATCH`).
- Build the physics seeded bench (`SPEC-SCIENCE-BENCH.md` §1) and the all-or-nothing point
  rule; split the science switch per subject.
- The lower-sec science solutions pass (content work, the extraction fleet's method).
- Draft the `orgs` migration and the entitlements shape as a proposal for review — not
  applied until §12.1–4 are settled.
