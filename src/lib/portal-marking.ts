// Student-facing view of their own marked scripts — the data behind /app/marking.
//
// Two rules shape everything here, and both are invariants, not preferences:
//
//   1. RELEASED ONLY. Adrian's review is the trust gate on AI marking
//      (HANDOFF-MARKING-LOOP.md, locked decision 2). The route filters on
//      `released_at`, and so does this file — a student must never read a mark
//      that Adrian hasn't signed off, and one forgotten `.not(...)` in a future
//      query should not be the only thing standing between them and one.
//   2. NO TRIAGE INTERNALS. `review_recommended`, `match_confidence`,
//      `marking_confidence` and the override note are Adrian's working notes
//      about how much he trusts the machine. A student reading "marking
//      confidence: low" learns nothing about their maths and everything about
//      our plumbing.
//
// Pure (repo testing policy: marks logic never inline in a route or component).
// Input is already-fetched rows; no I/O.

import { aggregateTopicBleed, type TopicBleed, type ReportPaper } from '@/lib/report-facts';
import { recomputeTotals } from '@/lib/mark-triage';
import { topicSlug } from '@/lib/topic-slug';

/** A `paper_marking_runs` row, reduced to the columns this view reads. */
export interface MarkingRunRow {
  id: string;
  created_at: string;
  paper_name: string | null;
  total_awarded: number | null;
  total_max: number | null;
  annotated_pdf_url: string | null;
  /** The 🖼 images-only PDF — red pen on the student's own pages. */
  photos_pdf_url: string | null;
  pdf_url: string | null;
  released_at: string | null;
  result_json: unknown;
  /**
   * 'A Math' | 'E Math' | 'H2 Math' | 'Other' | null (SPEC-PORTAL-V2 §1) —
   * the pill on the card and which per-subject tile block the paper counts
   * in. Optional: callers that never show a subject (the PDF routes, the
   * notebook) select without it and read `undefined`.
   */
  paper_subject?: string | null;
}

export interface StudentQuestion {
  questionNumber: string;
  awarded: number;
  max: number;
  topic: string | null;
  /** The marker's sentence about the attempt as a whole. */
  comment: string;
  /** Per-part "what went wrong" lines, in paper order, blanks dropped. */
  slips: string[];
  /** Full marks — the page greys these down so the losses stand out. */
  full: boolean;
  /** The printed question as the marker read it, when it extracted one. */
  prompt: string | null;
  /**
   * Per-part SEAB scheme codes ("M1 A0", "B1") — teacher-margin shorthand the
   * marker emits since 2026-08-24, plus that part's red-ink reason and ✱
   * teaching note for the annotated-solution view. Empty for older runs.
   */
  schemes: { label: string | null; scheme: string; why: string | null; teach: string | null }[];
  /** The complete correct solution, one step per line ($…$ TeX). */
  solution: string | null;
  /**
   * "Practise this" follow-up for a dropped-marks question, when the
   * release-time mapper (`result_json.revise`, lib/revise-map) matched it to a
   * sub-group with published cards. `href` deep-links into graded practice
   * (`/app/practice?level=&topic=` — the student is already signed in here);
   * `examplesHref` keeps the no-login worked-examples deck as a secondary
   * "see it done first" link. Null for full-mark questions and whenever no
   * mapping was confident enough — a missing chip is fine, a wrong or dead
   * link is not.
   */
  revise: { name: string; href: string; examplesHref: string } | null;
}

/**
 * One follow-up question from `result_json.practice.items` — the bot builds
 * one per dropped-marks question at release time (or when Adrian presses 📝).
 * `source`/`id` stay internal: whether it came from the bank or was written
 * fresh is plumbing, not maths.
 */
export interface StudentPracticeItem {
  /** Question number on their paper this was picked for. */
  for: string;
  /**
   * Question-bank id when the item is a bank pick, null when written fresh.
   * Internal plumbing (the notebook uses it to fetch the worked solution at
   * reveal time) — never shown to the student.
   */
  id: string | null;
  question: string;
  /** Final answer for self-checking; may be empty on generated items. */
  answer: string;
  topic: string | null;
  /** "School 2023" for bank picks; null when written for this error. */
  origin: string | null;
  note: string | null;
}

export interface StudentPaper {
  id: string;
  /** YYYY-MM-DD, from created_at. */
  date: string;
  name: string;
  awarded: number;
  max: number;
  /** Null when the paper carries no marks at all (nothing to be a percent of). */
  pct: number | null;
  /**
   * The paper's subject as stamped on the run — 'A Math' | 'E Math' | 'H2 Math'
   * | 'Other' | null. Always set by toPaper; optional in the type so the
   * notebook/plan/mastery test fixtures that hand-build papers need not know it.
   */
  subject?: string | null;
  /** Every marked question, paper order. */
  questions: StudentQuestion[];
  /** Questions that dropped marks, biggest loss first — the revision list. */
  dropped: StudentQuestion[];
  /**
   * The marked script the student opens first: Adrian's own pen when he
   * annotated a copy, else the 🖼 images-only PDF (red pen on their own
   * pages, worked solutions in the footer), else the full report. Same
   * precedence as the admin send row (docs/MARKING.md): once Adrian's pen is
   * on a copy, that copy IS the paper — and the images copy beats the full
   * report because it reads like a hand-marked script, not a dossier.
   */
  pdfUrl: string | null;
  /**
   * The 📄 full assembled report (marked pages + typeset transcript sheets),
   * kept reachable as a secondary link when it isn't already the primary.
   */
  fullPdfUrl: string | null;
  /**
   * The annotated page images (result_json.annotated_photos), page order —
   * what the ✂️ Save-to-My-Notes clipper draws on. Only the index and the
   * plain-annotation url cross over; `method`/`url_with_solutions` are
   * plumbing. Empty for runs that never rendered annotations (the clipper
   * simply doesn't offer itself).
   */
  pages: { index: number; url: string }[];
  /** Follow-up practice, one item per dropped-marks question. Often empty. */
  practice: StudentPracticeItem[];
  /**
   * House-style Word file of the practice list, if the bot built one. The UI
   * no longer links it (students download /api/portal/practice-pdf instead,
   * 2026-08-14); kept because the bot still writes it and Adrian's own tools use it.
   */
  practiceDocxUrl: string | null;
}

export interface StudentMarking {
  /** Newest first — the paper they just sat is the one they came to look at. */
  papers: StudentPaper[];
  /** Mean of paper percentages, 0–100. Null with no scored paper. */
  averagePct: number | null;
  /** Oldest → newest change in points. Null with fewer than 2 scored papers. */
  trendPts: number | null;
  /** Topics to work on next, worst first. */
  focus: TopicBleed[];
  /**
   * One true, specific "the system noticed" line — a streak of strong papers
   * or a personal best — or null. Truth over cheer: no note beats a hollow one.
   */
  streakNote: string | null;
}

/** ≥ this on consecutive papers counts as a streak worth naming. */
const STREAK_PCT = 70;

function noticeStreak(papers: StudentPaper[]): string | null {
  // Newest first. Count the run of scored papers at/above the bar.
  const scored = papers.filter(p => p.pct !== null);
  if (scored.length < 2) return null;
  let run = 0;
  for (const p of scored) {
    if (p.pct! >= STREAK_PCT) run++;
    else break;
  }
  if (run >= 2) {
    return `📈 ${run} papers in a row at ${STREAK_PCT}% or better — that's a streak.`;
  }
  // Personal best: strictly above every earlier scored paper.
  const [latest, ...rest] = scored;
  if (rest.length && rest.every(p => latest.pct! > p.pct!)) {
    return '🔝 Your best paper yet.';
  }
  return null;
}

// A topic needs this many marks behind it before its percentage means anything —
// below it, one 2-mark slip reads to a 16-year-old as "you are bad at vectors".
// Same thresholds as the parent report (`report-facts.ts`) on purpose: the
// student and their parent should never be shown two different focus lists.
const MIN_TOPIC_MARKS = 4;
const WEAK_PCT_CEILING = 75;
const MAX_FOCUS = 3;

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toQuestion(raw: unknown): StudentQuestion | null {
  const r = asRecord(raw);
  if (!r) return null;
  const marking = asRecord(r.marking);
  if (!marking) return null;

  const max = num(marking.total_max);
  const awarded = num(marking.total_awarded);
  const output = asRecord(r.marking_output);
  const meta = asRecord(output?.meta) ?? {};
  const parts = Array.isArray(marking.parts) ? marking.parts : [];

  const slips: string[] = [];
  const schemes: { label: string | null; scheme: string; why: string | null; teach: string | null }[] = [];
  for (const p of parts) {
    const part = asRecord(p);
    if (!part) continue;
    const scheme = str(part.scheme);
    if (scheme) {
      schemes.push({
        label: str(part.label) || null,
        scheme,
        why: str(part.error_summary) || null,
        teach: str(part.study_note) || null,
      });
    }
    // A part that scored full marks has nothing to say; `error_summary` on a
    // correct part (some markers write "no errors") would read as a criticism.
    if (num(part.awarded) >= num(part.max)) continue;
    const why = str(part.error_summary);
    if (!why) continue;
    const label = str(part.label);
    slips.push(label ? `${label}: ${why}` : why);
  }

  return {
    questionNumber: str(r.question_number) || '?',
    awarded,
    max,
    topic: str(meta.topic_detected) || null,
    comment: str(marking.overall_comment),
    slips,
    full: max > 0 && awarded >= max,
    prompt: str(asRecord(output?.question)?.prompt) || null,
    schemes,
    solution: str(asRecord(output?.correct)?.full_solution_latex) || null,
    revise: null, // attached per-paper from result_json.revise in toPaper
  };
}

/**
 * result_json.revise → question-number → follow-up links. Every field is
 * re-validated here even though lib/revise-map validated on write — this is
 * student-facing, and a malformed block must degrade to "no chip", never to a
 * broken href.
 *
 * Deck level → QB practice level key. `jc` maps to JC2 (the common case); a
 * JC1 student's practice page falls back to their own level and still opens
 * the topic sheet when the topic exists there, so the link degrades softly.
 */
const PRACTICE_LEVEL: Record<string, string> = {
  am: 'AM', em: 'EM', jc: 'JC2', s1: 'S1', s2: 'S2',
};

function reviseLinks(
  raw: unknown,
): Map<string, { name: string; href: string; examplesHref: string }> {
  const links = new Map<string, { name: string; href: string; examplesHref: string }>();
  const block = asRecord(raw);
  const level = str(block?.level).toLowerCase();
  const items = block?.items;
  if (!/^(am|em|jc|s1|s2)$/.test(level) || !Array.isArray(items)) return links;

  for (const rawItem of items) {
    const item = asRecord(rawItem);
    if (!item) continue;
    const forQ = str(item.for);
    const name = str(item.name);
    const topic = str(item.topic);
    const id = Number(item.subgroup_id);
    if (!forQ || !name || !topic || !Number.isInteger(id) || links.has(forQ)) continue;
    links.set(forQ, {
      name,
      href: `/app/practice?level=${PRACTICE_LEVEL[level]}&topic=${encodeURIComponent(topic)}`,
      examplesHref: `/revise/${level}/${topicSlug(topic)}/worked-examples?subgroup=${id}`,
    });
  }
  return links;
}

/**
 * result_json.annotated_photos → the clipper's page list. Student-facing, so
 * every entry is re-validated: a malformed block degrades to no clipper, never
 * to a broken image. https-only — these are public Vercel Blob JPEGs.
 */
function annotatedPages(raw: unknown): { index: number; url: string }[] {
  if (!Array.isArray(raw)) return [];
  const pages: { index: number; url: string }[] = [];
  for (const rawEntry of raw) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const url = str(entry.url);
    const index = Number(entry.photo_index);
    if (!/^https:\/\//.test(url) || !Number.isInteger(index)) continue;
    pages.push({ index, url });
  }
  return pages.sort((a, b) => a.index - b.index);
}

/**
 * Split a practice answer into display lines. Bank answers pack multi-part
 * results into one string — "(i) $p=4$. (ii) $3p=12$ …" — which crammed the
 * Show-answer reveal onto a single wrapped line (Adrian's phone review, 7c).
 * Breaks happen at real newlines, before a part marker ((i), (b), …) that
 * follows whitespace, and after a top-level "; " — but never inside $…$, so a
 * semicolon in set-builder notation or a piecewise definition stays put.
 */
export function answerLines(answer: string): string[] {
  const out: string[] = [];
  const partAhead = /^\((?:[ivx]{1,4}|[a-h])\)\s/;
  for (const rawLine of answer.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let cur = '';
    let inMath = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '$') inMath = !inMath;
      if (!inMath && ch === '(' && /\s$/.test(cur) && cur.trim() && partAhead.test(line.slice(i))) {
        out.push(cur.trim());
        cur = '';
      }
      cur += ch;
      if (!inMath && ch === ';' && line[i + 1] === ' ' && cur.trim()) {
        out.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

/**
 * Split a packed multi-part question stem into display lines, one per part.
 * Markers pack the printed stem into one string — "Given that … find (i) …
 * (ii) …" — which read as a wall of text on the phone (Adrian's phone review,
 * round 5: "the questions itself should also have better readability — parts
 * should be on its own line"). Same walking technique as `answerLines`:
 * breaks happen at real newlines and before a part marker ((i), (b), …) that
 * follows whitespace, but never inside $…$, so function notation like
 * "f(i) = 2i" stays whole. Unlike `answerLines`, there is deliberately no
 * semicolon rule — prose stems use semicolons as ordinary punctuation
 * ("hence, or otherwise; find …"), and splitting there would chop a sentence
 * in half. A stem with no markers returns as a single line.
 */
export function promptLines(prompt: string): string[] {
  const out: string[] = [];
  const partAhead = /^\((?:[ivx]{1,4}|[a-h])\)\s/;
  for (const rawLine of prompt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let cur = '';
    let inMath = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '$') inMath = !inMath;
      if (!inMath && ch === '(' && /\s$/.test(cur) && cur.trim() && partAhead.test(line.slice(i))) {
        out.push(cur.trim());
        cur = '';
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

function toPracticeItem(raw: unknown): StudentPracticeItem | null {
  const r = asRecord(raw);
  if (!r) return null;
  const question = str(r.question);
  if (!question) return null;
  return {
    for: str(r.for) || '?',
    id: str(r.id) || null,
    question,
    answer: str(r.answer),
    topic: str(r.topic) || null,
    origin: str(r.origin) || null,
    note: str(r.note) || null,
  };
}

function toPaper(row: MarkingRunRow): StudentPaper | null {
  const rj = asRecord(row.result_json);
  const results = rj?.results;
  // No `results` means the run failed or is still queued. It has nothing to
  // show, and listing it as "0/0" reads as a paper they scored nothing on.
  if (!Array.isArray(results)) return null;

  const questions = results.map(toQuestion).filter((q): q is StudentQuestion => q !== null);

  // Attach revise links to their questions. Full-mark questions never get one
  // (there is nothing to fix), even if a stale mapping names them.
  const links = reviseLinks(rj?.revise);
  if (links.size) {
    for (const q of questions) {
      if (!q.full) q.revise = links.get(q.questionNumber) ?? null;
    }
  }

  // Prefer the stored totals — triage overrides write both — and recompute only
  // when they're absent, which older rows sometimes are.
  const totals =
    row.total_max == null || row.total_awarded == null
      ? recomputeTotals(row.result_json)
      : { awarded: num(row.total_awarded), max: num(row.total_max) };

  const practiceRec = asRecord(rj?.practice);
  const practice = Array.isArray(practiceRec?.items)
    ? practiceRec.items.map(toPracticeItem).filter((x): x is StudentPracticeItem => x !== null)
    : [];

  // Adrian's pen > red-pen page images > full report (see the StudentPaper
  // field docs). `photos_pdf_url` is absent from rows selected by callers that
  // never show a script (they read `undefined`, which the chain skips).
  const pdfUrl = row.annotated_pdf_url || row.photos_pdf_url || row.pdf_url || null;

  return {
    id: row.id,
    date: String(row.created_at).slice(0, 10),
    name: str(row.paper_name) || 'Marked paper',
    awarded: totals.awarded,
    max: totals.max,
    pct: totals.max > 0 ? Math.round((totals.awarded / totals.max) * 100) : null,
    subject: str(row.paper_subject) || null,
    questions,
    dropped: questions
      .filter(q => q.max > 0 && q.awarded < q.max)
      .sort((a, b) => (b.max - b.awarded) - (a.max - a.awarded) || a.questionNumber.localeCompare(b.questionNumber)),
    pdfUrl,
    fullPdfUrl: row.pdf_url && row.pdf_url !== pdfUrl ? row.pdf_url : null,
    pages: annotatedPages(rj?.annotated_photos),
    practice,
    practiceDocxUrl: str(practiceRec?.docx_url) || null,
  };
}

/**
 * Build one student's marked-paper view from their `paper_marking_runs` rows.
 *
 * `rows` must already be scoped to this student — this function has no way to
 * check ownership and will happily render whatever it is handed.
 */
export function buildStudentMarking(rows: MarkingRunRow[]): StudentMarking {
  // Release gate, enforced again here — see the header.
  const released = rows.filter(r => !!r.released_at);

  const papers = released
    .map(toPaper)
    .filter((p): p is StudentPaper => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const scored = papers.filter(p => p.pct !== null).map(p => ({ date: p.date, pct: p.pct! }));
  const averagePct = scored.length
    ? Math.round(scored.reduce((s, p) => s + p.pct, 0) / scored.length)
    : null;

  // Oldest → newest, so a rising trend is a positive number regardless of the
  // display order above.
  const chronological = [...scored].sort((a, b) => a.date.localeCompare(b.date));
  const trendPts = chronological.length >= 2
    ? chronological[chronological.length - 1].pct - chronological[0].pct
    : null;

  const bleedInput: ReportPaper[] = released.map(r => ({
    id: r.id,
    date: String(r.created_at).slice(0, 10),
    name: str(r.paper_name) || 'Marked paper',
    totalAwarded: r.total_awarded,
    totalMax: r.total_max,
    resultJson: r.result_json,
  }));
  const focus = aggregateTopicBleed(bleedInput)
    .filter(t => t.max >= MIN_TOPIC_MARKS && t.pct < WEAK_PCT_CEILING)
    .slice(0, MAX_FOCUS);

  return { papers, averagePct, trendPts, focus, streakNote: noticeStreak(papers) };
}
