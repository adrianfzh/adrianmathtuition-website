// Marketing content calendar — post ideas mapped to the Singapore exam year.
// Version-controlled source (never lost); rendered read-only at
// /admin/calendar-marketing-post. Edit this file (or ask Claude) to add posts.
//
// SG exam-year rhythm this calendar is built around:
//   Jan  O-Level results · new school year · enrolment
//   Feb  A-Level results · CNY · foundations
//   Mar  Term 1 assessments · habit-building
//   Apr  Mid-year runway · exam technique
//   May  MID-YEAR EXAMS · support/stress
//   Jun  June-holiday revision sprint (intensive)
//   Jul  Post-mid-year · prelim ramp-up
//   Aug  PRELIMS begin · timed practice
//   Sep  Prelims wrap · PSLE season · final runway
//   Oct  O-LEVELS (written) · execution/calm
//   Nov  A-LEVELS · O-levels wrap · next-year enrolment opens
//   Dec  Year-end · head-start programmes for incoming Sec 3 / JC1

export type Pillar = 'Teach' | 'Exam-strategy' | 'Reassure' | 'Proof';
export type Format = 'Carousel' | 'Reel' | 'Single image' | 'Story' | 'Telegram';
export type PostStatus = 'idea' | 'drafting' | 'scheduled' | 'posted';

export interface MarketingPost {
  id: string;
  week: number;              // week of the month (1-5)
  day: string;
  pillar: Pillar;
  format: Format;
  channel: string;
  title: string;
  outline: string;
  sourceAsset?: string;
  cta: string;
  status: PostStatus;
}

export interface MonthCalendar {
  month: string;
  seasonNote: string;
  posts: MarketingPost[];
}

const p = (
  id: string, week: number, day: string, pillar: Pillar, format: Format, channel: string,
  title: string, outline: string, cta: string, sourceAsset?: string, status: PostStatus = 'idea',
): MarketingPost => ({ id, week, day, pillar, format, channel, title, outline, cta, sourceAsset, status });

// ── JANUARY ───────────────────────────────────────────────────────────────────
export const JANUARY: MonthCalendar = {
  month: 'January',
  seasonNote: 'O-Level results are out · new school year begins · biggest enrolment window of the year.',
  posts: [
    p('jan-1', 1, 'Mon', 'Reassure', 'Single image', 'IG + Telegram',
      'Got your O-Level results? Whatever the grade, the next move matters more.',
      'Calm, non-judgy message for results day. Disappointment is data, not a verdict. Offer a path forward.',
      'DM to talk through JC/poly math and next steps'),
    p('jan-2', 2, 'Wed', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'Starting Sec 3 A-Math? The 5 habits that separate A2s from C6s.',
      '1) show every method line 2) redo wrong questions 3) formula recall drills 4) timed from day 1 5) ask early. One slide each.',
      'Save + start term strong',
      'Topic Maps — A-Math foundations'),
    p('jan-3', 3, 'Fri', 'Proof', 'Single image', 'Instagram',
      'What a fresh start looks like: from “I hate math” to weekly wins.',
      'Anonymised turnaround story. Focus on the mindset + system change, not just the grade.',
      'New-year slots are filling — enquire now'),
    p('jan-4', 4, 'Mon', 'Teach', 'Reel', 'Instagram',
      'The one indices rule Sec 3s always forget in the first month.',
      'Quick scribble reel: negative/fractional indices trap + fix. Under 30s.',
      'Practice → /revise am indices',
      'QB worked example — Indices'),
  ],
};

// ── FEBRUARY ──────────────────────────────────────────────────────────────────
export const FEBRUARY: MonthCalendar = {
  month: 'February',
  seasonNote: 'A-Level results out · Chinese New Year · term settling in — build foundations.',
  posts: [
    p('feb-1', 1, 'Tue', 'Reassure', 'Single image', 'IG + Telegram',
      'A-Level results day: your H2 Math grade doesn’t define your next chapter.',
      'Supportive note for JC leavers + juniors watching. Normalise the range of outcomes.',
      'Questions about uni math prep? DM me'),
    p('feb-2', 2, 'Thu', 'Teach', 'Carousel', 'IG + Telegram',
      'Why “I understand in class but blank in the exam” happens (and the fix).',
      'Passive recognition vs active recall. Show the difference with a worked example done two ways.',
      'Try active recall → /revise',
      'Topic Maps — study method'),
    p('feb-3', 3, 'Mon', 'Exam-strategy', 'Single image', 'Instagram',
      'CNY break = the perfect time to close one topic gap. Pick just one.',
      'Anti-burnout angle: don’t cram everything, fix one weak topic over the break.',
      'Not sure which topic? Send me a past paper'),
  ],
};

// ── MARCH ─────────────────────────────────────────────────────────────────────
export const MARCH: MonthCalendar = {
  month: 'March',
  seasonNote: 'Term 1 assessments · early gaps surface · habit-building window.',
  posts: [
    p('mar-1', 1, 'Wed', 'Teach', 'Carousel', 'IG + Telegram',
      'Spot the error: this quadratic “solution” loses 3 marks. Where?',
      'Show a plausible wrong working; reveal the sign/discriminant slip next day.',
      'Comment your answer',
      'Marking benchmark — quadratics'),
    p('mar-2', 2, 'Fri', 'Exam-strategy', 'Reel', 'Instagram',
      'How to actually mark your own practice (most students do it wrong).',
      'Marking against the scheme, method marks vs answer marks, tallying error types.',
      'Full marking guide in bio'),
    p('mar-3', 3, 'Mon', 'Reassure', 'Single image', 'IG + Telegram',
      'A bad Term 1 test is the cheapest feedback you’ll get all year.',
      'Reframe early failure as low-stakes diagnosis. Parent-friendly.',
      'Turn the test into a plan — book a review'),
  ],
};

// ── APRIL ─────────────────────────────────────────────────────────────────────
export const APRIL: MonthCalendar = {
  month: 'April',
  seasonNote: 'Mid-year runway (~4–6 weeks out) · exam-technique focus.',
  posts: [
    p('apr-1', 1, 'Tue', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      '6 weeks to mid-years: the topic-by-topic revision order that works.',
      'Weakest-first, timed-last. One slide per phase.',
      'Save this'),
    p('apr-2', 2, 'Thu', 'Teach', 'Reel', 'Instagram',
      'The trig identity that unlocks half the A-Math paper.',
      'Fast reel on the core identity + where it appears.',
      'Drill it → /revise am trigonometry',
      'QB worked examples — Trigonometry'),
    p('apr-3', 3, 'Mon', 'Proof', 'Carousel', 'Instagram',
      'A real marked question — this is the feedback every student gets.',
      'Show the bot’s typeset marking + annotated overlay.',
      'Ask how the marking works',
      'Bot marking output (PNG)'),
  ],
};

// ── MAY ───────────────────────────────────────────────────────────────────────
export const MAY: MonthCalendar = {
  month: 'May',
  seasonNote: 'MID-YEAR EXAMS · peak stress — lead with support + technique.',
  posts: [
    p('may-1', 1, 'Mon', 'Reassure', 'Single image', 'IG + Telegram',
      'Mid-year week: sleep beats one more past paper at 1am.',
      'Short, kind, science-of-performance angle. For students and anxious parents.',
      'Deep breath — you’ve prepared'),
    p('may-2', 2, 'Wed', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'In the exam hall: how to squeeze method marks from a question you can’t finish.',
      'Write the formula, define variables, attempt the first step — partial credit adds up.',
      'Save before your paper'),
    p('may-3', 3, 'Fri', 'Teach', 'Reel', 'Instagram',
      '30 seconds: the “show that” technique that never loses marks.',
      'Structure of a show-that answer, ending at the given result.',
      'More technique → /revise'),
  ],
};

// ── JUNE ──────────────────────────────────────────────────────────────────────
export const JUNE: MonthCalendar = {
  month: 'June',
  seasonNote: 'June-holiday revision sprint — your intensive product. Market it hard.',
  posts: [
    p('jun-1', 1, 'Mon', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'The June holiday revision sprint: rebuild every weak topic before prelims.',
      'What the sprint covers, how it works, who it’s for. Enrolment-driving.',
      'DM “JUNE” for the schedule'),
    p('jun-2', 2, 'Wed', 'Teach', 'Carousel', 'Instagram',
      'One question, three methods — markers reward flexibility.',
      'Solve one problem three ways. Reinforces the all-methods marking mindset.',
      'More worked methods → /revise',
      'QB — multi-method worked example'),
    p('jun-3', 3, 'Fri', 'Proof', 'Single image', 'IG + Telegram',
      'Two weeks, one topic mastered. Here’s a June sprint result.',
      'Anonymised progress from an intensive block.',
      'Limited sprint slots — enquire'),
    p('jun-4', 4, 'Mon', 'Reassure', 'Single image', 'IG + Telegram',
      'Holidays ≠ do nothing, but also ≠ burn out. The middle path.',
      'Balanced revision + rest message for parents.',
      'A realistic plan — message me'),
  ],
};

// ── JULY ──────────────────────────────────────────────────────────────────────
export const JULY: MonthCalendar = {
  month: 'July',
  seasonNote:
    'Mid-years done · ~9 weeks to prelims (Aug–Sep). Theme: turn mid-year results into a prelim plan.',
  posts: [
    p('jul-w1-1', 1, 'Tue', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'Your mid-year results are back. Read them like this (before you panic).',
      '1) the mark doesn’t matter, the pattern does 2) circle careless-vs-concept errors 3) tally worst topics 4) that IS your prelim order 5) book a free review.',
      'DM “REVIEW” for a free 15-min paper breakdown'),
    p('jul-w1-2', 1, 'Thu', 'Teach', 'Reel', 'Instagram',
      'The differentiation slip that costs A-Math students 2 marks every time.',
      'Chain-rule question; show the common wrong line; pause; reveal fix. 20–30s scribble style.',
      'Full method → /revise am differentiation',
      'QB worked example — Differentiation (Techniques)'),
    p('jul-w1-3', 1, 'Sat', 'Reassure', 'Single image', 'IG + Telegram',
      'To the parent whose child “used to be good at math.”',
      'Sec 3 is where E-Math confidence meets A-Math abstraction. Normal and fixable.',
      'Message me for an honest chat about where they stand'),
    p('jul-w2-1', 2, 'Mon', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      '9 weeks to prelims: the only revision schedule you actually need.',
      'wks 1–3 rebuild weak topics, 4–6 timed topical practice, 7–9 full papers under time. One slide per phase.',
      'Save + share with a friend sitting prelims'),
    p('jul-w2-2', 2, 'Wed', 'Teach', 'Carousel', 'Instagram',
      'Spot the error: this bottle-scaling answer looks right. It isn’t.',
      '(49/100)³×200 = 24g for similar solids; reveal next day: (100/149)³×200 ≈ 60g.',
      'Comment your answer — reveal tomorrow',
      'Marking benchmark case (similar solids)'),
    p('jul-w2-3', 2, 'Fri', 'Proof', 'Single image', 'IG + Telegram',
      'E8 → A2 in two terms. Here’s what actually changed.',
      'Anonymised before/after + 3 bullets on what shifted.',
      'Prelim intensive slots opening — DM to enquire'),
    p('jul-w3-1', 3, 'Mon', 'Teach', 'Reel', 'Instagram',
      'The 4 trig identities you’ll actually use in the A-Math paper.',
      'Montage of core identities + where each shows up. Under 30s.',
      'Practice → /revise am trigonometry',
      'QB worked examples — Trigonometry'),
    p('jul-w3-2', 3, 'Wed', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'How to answer “Show that…” questions without losing method marks.',
      'Trap: jumping to the answer. Fix: show every stated step. Before/after of a marked attempt.',
      'Save for your next timed paper'),
    p('jul-w3-3', 3, 'Fri', 'Proof', 'Carousel', 'Instagram',
      'This is what real feedback looks like (a marked prelim question).',
      'Show the bot’s typeset marking + annotated overlay on a solved question.',
      'Every submission gets this — ask how',
      'Bot marking output (transcription + overlay PNG)'),
    p('jul-w4-1', 4, 'Mon', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'The 5 topics that appear in almost every A-Math prelim.',
      'Frequency-based; one slide each with the usual question type.',
      'Drill these first → /revise',
      'QB — topic frequency across prelim papers'),
    p('jul-w4-2', 4, 'Wed', 'Teach', 'Reel', 'Instagram',
      'One question, three methods — markers reward this.',
      'Solve one problem three ways.',
      'More worked methods → /revise',
      'QB — multi-method worked example'),
    p('jul-w4-3', 4, 'Fri', 'Reassure', 'Single image', 'IG + Telegram',
      'Cramming doesn’t work for math. Here’s what does.',
      'Spaced, active practice beats re-reading. Sets up the intensive.',
      'Join the prelim sprint — limited slots'),
  ],
};

// ── AUGUST ────────────────────────────────────────────────────────────────────
export const AUGUST: MonthCalendar = {
  month: 'August',
  seasonNote: 'PRELIMS begin · peak demand — lead with timed practice + composure.',
  posts: [
    p('aug-1', 1, 'Mon', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'Prelim season: how to review a paper so you don’t repeat mistakes.',
      'Error log, categorise, re-attempt cold after 3 days. One slide each.',
      'Save this'),
    p('aug-2', 2, 'Wed', 'Teach', 'Reel', 'Instagram',
      'The integration set-up most students get backwards.',
      'Limits + area-under-curve orientation. Quick reel.',
      'Practice → /revise am integration',
      'QB worked example — Integration'),
    p('aug-3', 3, 'Fri', 'Reassure', 'Single image', 'IG + Telegram',
      'Prelims are a rehearsal, not the verdict. Use them like one.',
      'Lower the stakes; extract the lessons. For students + parents.',
      'Turn prelim gaps into a final-runway plan'),
    p('aug-4', 4, 'Mon', 'Proof', 'Single image', 'Instagram',
      'From “I always run out of time” to finishing with 10 minutes to check.',
      'Anonymised timing turnaround via timed practice.',
      'Final-stretch coaching — DM'),
  ],
};

// ── SEPTEMBER ─────────────────────────────────────────────────────────────────
export const SEPTEMBER: MonthCalendar = {
  month: 'September',
  seasonNote: 'Prelims wrap · PSLE season (market to incoming Sec 1) · O/A-level final runway.',
  posts: [
    p('sep-1', 1, 'Tue', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'Prelim results back: your final-6-weeks plan to O-Levels.',
      'Triage by marks lost, secure easy topics, targeted hard-topic drills.',
      'Book a final-runway review'),
    p('sep-2', 2, 'Thu', 'Reassure', 'Single image', 'IG + Telegram',
      'To PSLE parents eyeing Sec 1: the math jump is real, but plannable.',
      'Set expectations for the PSLE → Sec 1 transition. Top-of-funnel for next year.',
      'Ask about Sec 1 head-start'),
    p('sep-3', 3, 'Mon', 'Teach', 'Reel', 'Instagram',
      'The vectors mistake that quietly loses marks in the last question.',
      'Position vs displacement vector mix-up.',
      'More → /revise'),
  ],
};

// ── OCTOBER ───────────────────────────────────────────────────────────────────
export const OCTOBER: MonthCalendar = {
  month: 'October',
  seasonNote: 'O-LEVELS (written papers) · lead with execution + calm, not new content.',
  posts: [
    p('oct-1', 1, 'Mon', 'Exam-strategy', 'Single image', 'IG + Telegram',
      'Night before the A-Math paper: do this, not that.',
      'Light formula recall + sleep, not new topics. Checklist format.',
      'You’re ready — trust the prep'),
    p('oct-2', 2, 'Wed', 'Reassure', 'Single image', 'IG + Telegram',
      'A wobble on Paper 1 doesn’t decide Paper 2. Reset and go again.',
      'Between-papers composure message.',
      'One paper at a time'),
    p('oct-3', 3, 'Fri', 'Exam-strategy', 'Carousel', 'Instagram',
      'The 3-minute checking routine that catches careless mistakes.',
      'Units, sign, re-read the question, sanity-check magnitude.',
      'Save for exam day'),
  ],
};

// ── NOVEMBER ──────────────────────────────────────────────────────────────────
export const NOVEMBER: MonthCalendar = {
  month: 'November',
  seasonNote: 'A-LEVELS · O-levels wrapping up · next-year enrolment opens — start filling slots.',
  posts: [
    p('nov-1', 1, 'Mon', 'Exam-strategy', 'Single image', 'IG + Telegram',
      'H2 Math: the formula-list skills you must have automatic by now.',
      'What to have at fingertips going into A-Levels.',
      'Final H2 prep — DM'),
    p('nov-2', 2, 'Wed', 'Reassure', 'Single image', 'IG + Telegram',
      'Exams are ending. However it went, the next step is yours to choose.',
      'Post-exam decompression + forward-looking.',
      'Planning next year? Let’s talk'),
    p('nov-3', 3, 'Fri', 'Proof', 'Carousel', 'Instagram',
      'A year in review: real (anonymised) student journeys.',
      'Montage of turnarounds — builds trust for enrolment season.',
      '2027 slots opening — enquire early'),
    p('nov-4', 4, 'Mon', 'Exam-strategy', 'Single image', 'IG + Telegram',
      'Moving up to Sec 3 A-Math next year? Here’s your head-start reading list.',
      'Bridge topics to pre-learn over the holidays.',
      'Head-start programme — DM'),
  ],
};

// ── DECEMBER ──────────────────────────────────────────────────────────────────
export const DECEMBER: MonthCalendar = {
  month: 'December',
  seasonNote: 'Year-end break · head-start programmes for incoming Sec 3 / JC1 · lock in 2027 enrolment.',
  posts: [
    p('dec-1', 1, 'Tue', 'Exam-strategy', 'Carousel', 'IG + Telegram',
      'The December head-start: get ahead before Sec 3 A-Math even begins.',
      'Which foundation topics to pre-learn; how a head-start compounds all year.',
      'DM “HEADSTART” for the plan'),
    p('dec-2', 2, 'Thu', 'Reassure', 'Single image', 'IG + Telegram',
      'Rest first. Then a little math. The holiday balance that keeps momentum.',
      'Permission to rest + a light plan. Parent-friendly.',
      'A gentle December plan — message me'),
    p('dec-3', 3, 'Mon', 'Proof', 'Single image', 'Instagram',
      'What a year of consistent practice looks like (anonymised).',
      'Year-end reflection + social proof. Enrolment nudge.',
      'Start 2027 strong — slots filling'),
  ],
};

export const MARKETING_CALENDAR: MonthCalendar[] = [
  JANUARY, FEBRUARY, MARCH, APRIL, MAY, JUNE,
  JULY, AUGUST, SEPTEMBER, OCTOBER, NOVEMBER, DECEMBER,
];
