// Report facts — the COMPUTED half of a parent progress report.
//
// A parent report has two halves and they must not blur into each other:
//
//   FACTS  (this file)  — attendance, homework, topics, paper scores, weak
//                         topics. Derived arithmetically from lesson records
//                         and marked-paper JSON. Never written by a model.
//   PROSE  (progress-digest.ts) — the warm paragraph. Written by Claude, and
//                         given these facts so it can't invent a different
//                         story than the numbers tell.
//
// Keeping them separate is the whole point: if the model drifts, the numbers
// above it are still right, and Adrian can see the drift immediately. Anything
// a parent could hold us to ("she attended 4 of 5 lessons") lives HERE.
//
// Everything is pure — repo testing policy: marks/money/date logic never inline
// in a route. Inputs are already-fetched records; no I/O.

import type { DigestLesson } from '@/lib/progress-digest';

// ── Inputs ────────────────────────────────────────────────────────────────────

/** One AI-marked paper, as stored in Supabase `paper_marking_runs`. */
export interface ReportPaper {
  id: string;
  /** YYYY-MM-DD (created_at date part). */
  date: string;
  name: string;
  totalAwarded: number | null;
  totalMax: number | null;
  /** Raw result_json — mined for per-topic marks. Unknown shapes are ignored. */
  resultJson: unknown;
}

// ── Outputs ───────────────────────────────────────────────────────────────────

export interface TopicBleed {
  /** Display form (most common original casing seen). */
  topic: string;
  awarded: number;
  max: number;
  /** Marks lost = max - awarded. */
  lost: number;
  /** 0–100, rounded to whole percent. */
  pct: number;
  /** How many marked questions fed this row — the credibility of the number. */
  questions: number;
}

export interface PaperFact {
  date: string;
  name: string;
  awarded: number;
  max: number;
  pct: number;
}

export interface ReportFacts {
  attended: number;
  missed: number;
  /** Lessons moved to another date — made up, so neither attended nor missed. */
  moved: number;
  /** Past lessons still at Status='Scheduled' — Adrian never wrote them up. */
  unlogged: number;
  /** attended / (attended + missed), 0–100. Null when nothing was due. */
  attendancePct: number | null;

  homework: {
    returned: number;
    partial: number;
    missed: number;
    /** returned / (returned + partial + missed), 0–100. Null when never recorded. */
    rate: number | null;
  };

  mastery: { strong: number; ok: number; slow: number; logged: number };

  /** Deduped, most-taught first. */
  topics: { topic: string; lessons: number }[];

  papers: PaperFact[];
  /** Mean of paper percentages, 0–100. Null when no scored paper. */
  paperAverage: number | null;
  /** last pct − first pct, in points. Null with fewer than 2 scored papers. */
  paperTrendPts: number | null;

  /** Weakest topics across marked papers (worst first), already thresholded. */
  weakTopics: TopicBleed[];
  /** Best-scoring topics across marked papers (best first). */
  strongTopics: TopicBleed[];

  /** True when there is genuinely nothing to report on. */
  empty: boolean;
}

// A topic needs at least this many marks before its percentage means anything.
// Below it, one 2-mark slip reads as "40% — major weakness".
const MIN_TOPIC_MARKS = 4;
const WEAK_PCT_CEILING = 75;
const STRONG_PCT_FLOOR = 85;
const MAX_WEAK = 3;
const MAX_STRONG = 2;

// ── Small helpers ─────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pct(awarded: number, max: number): number | null {
  if (!(max > 0)) return null;
  return Math.round((awarded / max) * 100);
}

/**
 * Topics come from two free-text sources (Airtable `Topics Free Text` and the
 * marker's `meta.topic_detected`), so "Differentiation", "differentiation " and
 * "Differentiation." are three strings for one topic. Fold on a normalised key
 * and display the most common original spelling.
 *
 * ⚠ This is casing/whitespace folding only — it will NOT merge genuinely
 * different phrasings ("Integration by parts" vs "Integration — by parts").
 * Clustering those against `lib/canonical-topics.ts` is a separate job; until
 * then a split topic shows as two rows rather than being silently merged wrong.
 */
export function topicKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    // Trim BEFORE stripping punctuation — a trailing space hides the `$`
    // anchor from the punctuation, so "Differentiation. " would never fold.
    .trim()
    .replace(/[.,;:!?]+$/g, '')
    .trim();
}

function pickDisplay(counts: Map<string, number>): string {
  let best = '';
  let bestN = -1;
  for (const [form, n] of counts) {
    if (n > bestN) { best = form; bestN = n; }
  }
  return best;
}

// ── Per-topic marks across marked papers ──────────────────────────────────────

/**
 * Fold every marked question in every paper into per-topic mark totals — the
 * "bleed table", scoped to one student and one period.
 *
 * Reads `results[].marking.total_awarded` / `.total_max` for the marks and
 * `results[].marking_output.meta.topic_detected` for the label, matching the
 * shapes `lib/mark-triage.ts` reads. Questions with no detected topic, or with
 * a zero/absent max, contribute nothing — a question worth 0 marks can't say
 * anything about mastery.
 */
export function aggregateTopicBleed(papers: ReportPaper[]): TopicBleed[] {
  const acc = new Map<string, { awarded: number; max: number; questions: number; forms: Map<string, number> }>();

  for (const p of papers) {
    const root = asRecord(p.resultJson);
    const results = Array.isArray(root?.results) ? root!.results : [];
    for (const raw of results) {
      const r = asRecord(raw);
      if (!r) continue;
      const meta = asRecord(asRecord(r.marking_output)?.meta) ?? {};
      const topicRaw = typeof meta.topic_detected === 'string' ? meta.topic_detected.trim() : '';
      if (!topicRaw) continue;
      const marking = asRecord(r.marking);
      if (!marking) continue;
      const max = num(marking.total_max);
      if (!(max > 0)) continue;

      const key = topicKey(topicRaw);
      if (!key) continue;
      let e = acc.get(key);
      if (!e) { e = { awarded: 0, max: 0, questions: 0, forms: new Map() }; acc.set(key, e); }
      e.awarded += num(marking.total_awarded);
      e.max += max;
      e.questions += 1;
      e.forms.set(topicRaw, (e.forms.get(topicRaw) ?? 0) + 1);
    }
  }

  return [...acc.values()]
    .map(e => ({
      topic: pickDisplay(e.forms),
      awarded: Math.round(e.awarded * 10) / 10,
      max: Math.round(e.max * 10) / 10,
      lost: Math.round((e.max - e.awarded) * 10) / 10,
      pct: pct(e.awarded, e.max) ?? 0,
      questions: e.questions,
    }))
    // Worst first; a tie goes to whichever bled more marks (bigger real impact).
    .sort((a, b) => a.pct - b.pct || b.lost - a.lost || a.topic.localeCompare(b.topic));
}

// ── The fact block ────────────────────────────────────────────────────────────

/**
 * Build one student's fact block for one period.
 *
 * `lessons` must already be filtered to this student and this window, with
 * Cancelled records dropped (that's what `fetchLessonsInRange` does).
 */
export function buildReportFacts(opts: {
  lessons: DigestLesson[];
  papers?: ReportPaper[];
  /** YYYY-MM-DD; lessons on or before this date can be "unlogged". */
  today: string;
}): ReportFacts {
  const { lessons, today } = opts;
  const papers = opts.papers ?? [];

  let attended = 0, missed = 0, moved = 0, unlogged = 0;
  for (const l of lessons) {
    if (l.status === 'Rescheduled') { moved++; continue; }
    if (l.status === 'Absent') { missed++; continue; }
    if (l.status === 'Completed') { attended++; continue; }
    // 'Scheduled' in the past means attendance was never marked. Counting it as
    // attended would overstate the report; counting it as missed would slander
    // the student. It's excluded and reported separately so Adrian can fix it.
    if (l.status === 'Scheduled' && l.date && l.date <= today) unlogged++;
  }
  const due = attended + missed;

  let hwYes = 0, hwPartial = 0, hwNo = 0;
  for (const l of lessons) {
    if (l.homeworkReturned === 'Yes') hwYes++;
    else if (l.homeworkReturned === 'Partial') hwPartial++;
    else if (l.homeworkReturned === 'No') hwNo++;
  }
  const hwTotal = hwYes + hwPartial + hwNo;

  let strong = 0, ok = 0, slow = 0;
  for (const l of lessons) {
    if (l.mastery === 'Strong') strong++;
    else if (l.mastery === 'OK') ok++;
    else if (l.mastery === 'Slow') slow++;
  }

  // Topics: lessons-per-topic, folded on the same key as the bleed table.
  const topicAcc = new Map<string, { lessons: number; forms: Map<string, number> }>();
  for (const l of lessons) {
    // Dedupe within the lesson on the FOLDED key, not the raw string — otherwise
    // ['Trig', 'trig'] counts the same lesson twice against the same topic.
    const seenInLesson = new Set<string>();
    for (const t of l.topics.map(x => x.trim()).filter(Boolean)) {
      const key = topicKey(t);
      if (!key || seenInLesson.has(key)) continue;
      seenInLesson.add(key);
      let e = topicAcc.get(key);
      if (!e) { e = { lessons: 0, forms: new Map() }; topicAcc.set(key, e); }
      e.lessons += 1;
      e.forms.set(t, (e.forms.get(t) ?? 0) + 1);
    }
  }
  const topics = [...topicAcc.values()]
    .map(e => ({ topic: pickDisplay(e.forms), lessons: e.lessons }))
    .sort((a, b) => b.lessons - a.lessons || a.topic.localeCompare(b.topic));

  // Papers, oldest first so "trend" reads left-to-right in time.
  const paperFacts: PaperFact[] = papers
    .map(p => {
      const awarded = num(p.totalAwarded);
      const max = num(p.totalMax);
      const percent = pct(awarded, max);
      return percent === null ? null : { date: p.date, name: p.name, awarded, max, pct: percent };
    })
    .filter((p): p is PaperFact => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const paperAverage = paperFacts.length
    ? Math.round(paperFacts.reduce((s, p) => s + p.pct, 0) / paperFacts.length)
    : null;
  const paperTrendPts = paperFacts.length >= 2
    ? paperFacts[paperFacts.length - 1].pct - paperFacts[0].pct
    : null;

  const bleed = aggregateTopicBleed(papers).filter(t => t.max >= MIN_TOPIC_MARKS);
  const weakTopics = bleed.filter(t => t.pct < WEAK_PCT_CEILING).slice(0, MAX_WEAK);
  const strongTopics = [...bleed]
    .filter(t => t.pct >= STRONG_PCT_FLOOR)
    .sort((a, b) => b.pct - a.pct || b.max - a.max || a.topic.localeCompare(b.topic))
    .slice(0, MAX_STRONG);

  const empty =
    attended === 0 && missed === 0 && hwTotal === 0 &&
    topics.length === 0 && paperFacts.length === 0 &&
    strong + ok + slow === 0;

  return {
    attended, missed, moved, unlogged,
    attendancePct: due > 0 ? Math.round((attended / due) * 100) : null,
    homework: {
      returned: hwYes, partial: hwPartial, missed: hwNo,
      rate: hwTotal > 0 ? Math.round((hwYes / hwTotal) * 100) : null,
    },
    mastery: { strong, ok, slow, logged: strong + ok + slow },
    topics,
    papers: paperFacts,
    paperAverage,
    paperTrendPts,
    weakTopics,
    strongTopics,
    empty,
  };
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function trendArrow(pts: number | null): string {
  if (pts === null) return '';
  if (pts >= 5) return ` ↑${pts}`;
  if (pts <= -5) return ` ↓${Math.abs(pts)}`;
  return ' →';
}

/**
 * Parent-facing "at a glance" block, prepended to the draft body.
 *
 * Lines with no data are omitted entirely rather than printed as zeros —
 * "Homework returned: 0 of 0" reads to a parent as a failing grade.
 */
export function renderFactsMarkdown(facts: ReportFacts, periodLabel: string): string {
  if (facts.empty) return '';
  const lines: string[] = [];

  const due = facts.attended + facts.missed;
  if (due > 0) {
    const madeUp = facts.moved > 0 ? ` (${facts.moved} rescheduled)` : '';
    lines.push(`- **Lessons attended:** ${facts.attended} of ${due}${madeUp}`);
  }

  const hw = facts.homework;
  const hwTotal = hw.returned + hw.partial + hw.missed;
  if (hwTotal > 0) {
    const detail = [
      hw.partial ? `${hw.partial} partial` : '',
      hw.missed ? `${hw.missed} not done` : '',
    ].filter(Boolean).join(', ');
    lines.push(`- **Homework returned:** ${hw.returned} of ${hwTotal}${detail ? ` (${detail})` : ''}`);
  }

  if (facts.topics.length) {
    lines.push(`- **Topics covered:** ${facts.topics.slice(0, 6).map(t => t.topic).join(', ')}`);
  }

  if (facts.papers.length) {
    const scores = facts.papers.map(p => `${p.pct}%`).join(' → ');
    const avg = facts.paperAverage !== null ? ` · average ${facts.paperAverage}%` : '';
    lines.push(`- **Marked papers:** ${facts.papers.length} (${scores})${avg}${trendArrow(facts.paperTrendPts)}`);
  }

  if (facts.strongTopics.length) {
    lines.push(`- **Strongest:** ${facts.strongTopics.map(t => `${t.topic} (${t.pct}%)`).join(', ')}`);
  }
  if (facts.weakTopics.length) {
    lines.push(`- **Focus areas:** ${facts.weakTopics.map(t => `${t.topic} (${t.pct}%)`).join(', ')}`);
  }

  if (!lines.length) return '';
  return [`**${periodLabel} at a glance**`, '', ...lines].join('\n');
}

/**
 * Compact form fed to Claude alongside the lesson logs. Deliberately includes
 * the caveats (unlogged lessons, thin topic samples) so the prose doesn't claim
 * more certainty than the data supports.
 */
export function renderFactsForPrompt(facts: ReportFacts): string {
  if (facts.empty) return '(no computed facts — lesson logs only)';
  const bits: string[] = [];

  const due = facts.attended + facts.missed;
  if (due > 0) bits.push(`attendance: ${facts.attended}/${due} attended${facts.moved ? `, ${facts.moved} rescheduled` : ''}`);
  if (facts.unlogged > 0) bits.push(`⚠ ${facts.unlogged} past lesson(s) never written up — do not comment on those`);

  const hw = facts.homework;
  const hwTotal = hw.returned + hw.partial + hw.missed;
  if (hwTotal > 0) bits.push(`homework: ${hw.returned} returned / ${hw.partial} partial / ${hw.missed} not done`);

  if (facts.mastery.logged > 0) {
    bits.push(`mastery taps: ${facts.mastery.strong} Strong, ${facts.mastery.ok} OK, ${facts.mastery.slow} Slow`);
  }
  if (facts.topics.length) {
    bits.push(`topics: ${facts.topics.map(t => `${t.topic} (×${t.lessons})`).join(', ')}`);
  }
  if (facts.papers.length) {
    bits.push(`marked papers: ${facts.papers.map(p => `${p.date} ${p.name} ${p.awarded}/${p.max} (${p.pct}%)`).join('; ')}`);
  }
  if (facts.strongTopics.length) {
    bits.push(`strongest topics: ${facts.strongTopics.map(t => `${t.topic} ${t.pct}% of ${t.max} marks`).join(', ')}`);
  }
  if (facts.weakTopics.length) {
    bits.push(`weakest topics: ${facts.weakTopics.map(t => `${t.topic} ${t.pct}% of ${t.max} marks`).join(', ')}`);
  }

  return bits.map(b => `- ${b}`).join('\n');
}
