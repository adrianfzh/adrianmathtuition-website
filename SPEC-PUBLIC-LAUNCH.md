# SPEC — Opening to the public: the front door, the first purchase, the showcase

> **23 Sep 2026: the umbrella plan is [`SPEC-COMPANY.md`](SPEC-COMPANY.md)** — the two apps, the segment table, the economics by lane (§7 revisits this spec's prices against the API cost) and the phase order. This spec stays the detail for the student front door.

> Agreed 21 Sep 2026, from a read of grail.moe's pricing, practice, PSLE and library pages
> the same evening. Adrian: "we already have everything they have and more … put these
> ideas in specs." Nothing here is built yet. Companion specs: `SPEC-TUTOR-TOOLS.md`
> (the teachers' product), `SPEC-STUDENT-APP.md` (the App Store shell),
> `docs/CONTENT-POLICY.md` (what may be public). Pricing state of record: the memory note
> *portal-pricing-decision* — S$29 standard / S$49 intensive non-renewing passes live on
> Stripe with PayNow since 28 Aug 2026, `lib/portal-passes.ts`.

## 0. The one-line position

Free notes as the front door, marking as the paid room. Grail's growth is a free tier
and a library with the paid side behind it; ours is the same shape with better notes and
a paid side nobody else has — a handwritten script marked the way a teacher marks, with
a sheet written for that student. **Their unit is a generated paper at near-zero cost.
Ours is a marked script. Never anchor on their price.** Anchor on a tuition hour.

What they have that we do not, and this spec exists to build: **distribution** (a free
tier every JC student already knows) and **a public front door** that works without an
invite. Not more features.

## 1. Pricing and credits — copy the shape, not the level

**Copy the shape.**
- **A tiny first purchase a teen can make on PayLah without asking a parent.** A credit
  is one marked paper. Entry pack: **1 marked paper · S$5**, then **3 for S$12**. The
  student who has had one paper marked our way is the one who buys the pass.
- **Credits never expire** and are spent only after any free allowance.
- **Non-renewing passes are the headline; monthly is the small print.** Parents distrust
  auto-renew. "It simply ends when it ends." The existing S$29 (8 marked papers, 1 a
  day) and S$49 (20 papers, 3 a day) passes stay as they are.
- **A seasonal line with a date on it**: "O Levels start 19 Oct — the pass covers you
  from prelims to your last paper." Exam dates already live in Airtable.

**Copy the page.** One comparison table (Free · Pack · Pass · Intensive) with every perk
in the one table, prices underneath it, nothing else. Grail's pricing page is clearer
than most; ours is `/app/pass` and should read the same way.

**Do not copy the price level.** Grail: S$15 a month for 20 generated papers, about
70 cents each. Ours: S$29 for 8 marked papers, about S$3.60 each, and a different thing.
The pass maths from 28 Aug holds (marking compute makes flat-unlimited loss-making for
heavy users; S$29 is under one tuition hour). Tuition students keep everything free.

Mechanics: Stripe payment links with `client_reference_id` = the account uuid auto-grant
today (`api/payments/stripe-webhook`); a pack is one more Price with `metadata.credits`,
landing in `portal_passes` as a credit balance the hand-in meter spends after the pass
allowance — `lib/portal-passes.ts` already counts hand-ins per pass, so a credit is one
more source for `handinsRemaining`. `HANDINS_PER_PASS`, `DAILY_HANDIN_CAP_BY_TIER` and
`PASS_MIN_AMOUNT_SGD` stay.

## 2. Open to the public — the front door, in this order

The machinery exists: a stranger can hold an account (`acct:<uuid>` identity), hand in
through the pass meter, be marked and released, pay through the Stripe links. What does
not exist is the door.

1. **A public landing page** that says, in the student's words, what happens when you
   hand in a paper: photograph it, it comes back marked with a cover that shows where
   the marks went, and a sheet for exactly what you got wrong. The marked-cover image
   and one real sheet (anonymised) on the page. Nothing about the engine.
2. **Self-serve sign-up, no invite.** Email + password or Google; `portalAccessAllowed`
   admits a new stranger with a free allowance instead of refusing. The invite flow stays
   for tuition students.
3. **First paper free.** The taste. Marketing spend, so **capped at one per account,
   ever** (not per month), and refused for a second account on the same phone/email
   pattern where we can tell.
4. **Then the S$5 pack**, offered on the released paper's page ("Want the next one
   marked? 1 paper · S$5").
5. **Then the pass**, offered after the second or third paper.

**Cost caution.** A stranger's script costs real money to mark and there is no tuition
fee absorbing it. The free paper is the only unpaid one; everything after is prepaid.
The daily caps stay on. A stranger never reaches the Mac slots ahead of a tuition
student (queue priority: tuition first — check `mark-queue` ordering before opening).

**Not on the critical path**: the App Store shell (`SPEC-STUDENT-APP.md`). The web app is
enough to sell. Ship the door on the web first.

## 3. The parent is the buyer below Sec 3

Grail's PSLE page is written to parents, priced under the student plan, and sold as
printing rather than an app, because a P6 child has no phone, no PayNow and does not
decide how to revise. They built no PSLE generator — only assembly of extracted prelim
questions into the new 2026 format, because the format change is this year's selling
point.

**We do not follow into PSLE.** Different syllabus, different buyer, different marking;
our moat is Sec and JC maths marking. **The transferable lesson is the buyer, not the
level.** For Sec 1–2 (and many Sec 3) students the parent pays and reads the report. So:

- **A parent-facing page for outside students**: the marked cover, the score, the
  sheet, one line in Adrian's voice — sent as a link with the release, readable without
  a login (signed URL, expiring). This does more than any further student-facing feature.
- The pass and pack pages carry a "for parents" paragraph: what you get, no auto-renew,
  PayNow.

## 4. Notes — the front door itself

Grail's library is 335 pages of unvetted uploads: a search box over PDFs, no order, no
course. Ours is the opposite: one topic, the notes, worked examples in Adrian's style,
practice with answers. That difference is the pitch; it needs to be findable, not bigger.

- **Publish the revision sheets as free PDFs on the public site** — the Integration (Area),
  Kinematics and Differentiation sheets built 20–21 Sep 2026 are the pattern. One page per
  topic on the public site, the PDF, Adrian's name on it. Free notes are the advertisement;
  the paid room is marking.
- **Reopen the in-app notes reader for maths only**, once the vetting set on 29 Aug 2026
  is done (`NOTES_OPEN_TO_STUDENTS`). Own material only.
- **Do not become a library.** Hosting other schools' papers is what `docs/CONTENT-POLICY.md`
  rules out (no public pages, no whole papers, keep the source, takedown, lawful access).
  Their library is their moat and their exposure; neither is ours.

## 5. The showcase — "see a finished paper first"

Grail's practice page shows six real generated papers, answers included, with no account
needed, before asking for anything. Ours should do the same with what we actually sell:

- **One real marked paper, end to end**, anonymised: the hand-in photos, the marked
  pages with the red pen, the cover, the Practice Again sheet. A visitor scrolls the whole
  thing before signing up.
- **Three sample printed papers** from Print-a-paper (a Set paper, a topic paper, a
  weak-spots paper), answers included, PDF downloads, no account.
- **One sample revision sheet** per subject, from §4.
- Copy that names the unit: "This is what one marked paper looks like."

Lesson from their sample: their showcase A Math paper prints "(the expression appears as
an image in the source and is not legible)" and their E Math sample has no figures for a
tree-diagram and a grid question. Our samples are checked page by page before they go up.

## 6. A new site and a company — selling to students and to teachers

Adrian, 21 Sep 2026: "will create a new website and a company for the app store to sell
subscriptions to students and to teachers (perhaps a separate app)."

- **Entity**: a company (not the tuition sole prop / Kix Education partnership) is the
  App Store seller, the Stripe merchant for outsiders, and the party in the terms and
  privacy notice for non-tuition users. Adrian enrols it in the Apple Developer Program
  (`SPEC-STUDENT-APP.md` §4 waits on this). Tuition students stay under the tuition
  business.
- **Site**: a new domain for the product, separate from adrianmathtuition.com, which stays
  the tuition site. The product site carries §2's landing page, §4's free notes, §5's
  showcase, the pricing table, and the sign-up. The app (`/app`) can serve both hostnames
  from the same deployment; branding follows the hostname.
- **Two audiences, two doors**: students (this spec) and teachers
  (`SPEC-TUTOR-TOOLS.md`: marking per paper, admin per active student, the tutor's name on
  everything). Whether teachers get a separate app or a role inside one is decided when the
  first tutor is onboarded, not before. The multi-tenant delta in SPEC-TUTOR-TOOLS §4 is the
  prerequisite for either.
- **Subscriptions on the App Store** mean Apple's cut and Apple's rules on external
  payment links; the web pass avoids both. Sell on the web first, list the app unlisted
  for the Pencil path, and only put in-app purchase in when the numbers say so.

## 7. Order

1. Showcase page + free revision sheets (§4, §5) — no code beyond static pages; the
   marked-paper sample needs one released paper anonymised.
2. Landing page + self-serve sign-up + first paper free (§2).
3. S$5 pack (§1) and the pricing table (§1).
4. Parent page on release (§3).
5. Company, domain, App Store enrolment (§6) — in parallel, Adrian's own tasks.

## 8. What stays Adrian's

The price and the free allowance. The showcase paper (which one, and reading it). The
company and its filings. The tutor question. Everything else here can be built and put
in front of him to approve, per the building doctrine in `CLAUDE.md`.
