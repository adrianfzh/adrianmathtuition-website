// "Print a paper" — pure helpers for the student self-serve printable papers
// (SPEC-PRINT-PAPER.md). Week math, QB→renderer markdown flattening, pool
// scoping and weak-topic ranking live here so they stay unit-testable; all I/O
// stays in the /api/portal/print-paper routes.
//
// questionMarkdown / answerMarkdown / storageUrl started life inside
// /api/admin/prelim-builder/export and moved here 2026-08-26 so the student
// print routes and the admin export render papers identically (the admin route
// now imports them from here).

import type { TopicMastery } from './mastery';
import {
  landTotal,
  pickForSlot,
  type Candidate,
  type SlotPick,
} from './prelim-builder';
import { addDaysISO, sgtClock, sgtDayStartISO } from './sgt';

/** Papers a student may generate per SGT week (Monday-anchored). Cost brake —
 * Puppeteer renders + figure bandwidth — and it keeps each paper meaningful. */
export const WEEKLY_PRINT_CAP = 2;

/** Questions on a topics/weak-spots sheet. */
export const DEFAULT_QUESTION_COUNT = 8;
export const MAX_QUESTION_COUNT = 15;
export const MAX_TOPICS_PER_PAPER = 4;

/** UTC ISO timestamp of the most recent Monday 00:00 in Singapore. */
export function sgtStartOfWeekIso(now: Date = new Date()): string {
  const { weekday, dateISO } = sgtClock(now);
  // weekday: Sunday=0 … Monday=1. Roll back to the week's Monday.
  const back = (weekday + 6) % 7;
  return sgtDayStartISO(addDaysISO(dateISO, -back));
}

/** One pre-registered question on a generated paper (ordered). */
export interface PrintQuestionRef {
  id: string;
  pos: number;
  marks: number;
}

/** Portal QB level key → kiosk_pool RPC scope. Mirrors lib/kiosk-session's
 * KIOSK_LEVELS groupings (O-Level tokens include the Sec-3 bank) and
 * lib/qb-levels' bankScope sub-group keys, so the topics a student saw in the
 * picker and the pool the draw runs over stay the same universe. */
export const PRINT_POOL_SCOPE: Record<string, { tagLevels: string[]; topicsKey: string }> = {
  EM: { tagLevels: ['EM', 'S3_EM'], topicsKey: 'EM' },
  AM: { tagLevels: ['AM', 'S3_AM'], topicsKey: 'AM' },
  S3_EM: { tagLevels: ['S3_EM'], topicsKey: 'EM' },
  S3_AM: { tagLevels: ['S3_AM'], topicsKey: 'AM' },
  JC1: { tagLevels: ['JC', 'JC1', 'JC2'], topicsKey: 'JC' },
  JC2: { tagLevels: ['JC', 'JC1', 'JC2'], topicsKey: 'JC' },
  S1: { tagLevels: ['S1'], topicsKey: 'S1' },
  S2: { tagLevels: ['S2'], topicsKey: 'S2' },
};

/** Mock papers exist only where data/paper-blueprints.json has a blueprint.
 * JC1/JC2 both sit the same H2 9758 papers — the 'JC' blueprint family via
 * blueprintKeyFor. */
export const MOCK_LEVELS = ['EM', 'AM', 'JC1', 'JC2'] as const;

/** Blueprint family for a portal level: the JC1/JC2 student levels share one
 * H2 9758 syllabus, so both map to the 'JC' blueprint family; AM/EM (and the
 * admin builder's own 'JC') map to themselves. */
export function blueprintFamily(level: string): string {
  return level === 'JC1' || level === 'JC2' ? 'JC' : level;
}

/** The data/paper-blueprints.json key (and DURATIONS key) for a level+paper —
 * use this everywhere a `<level>-<paper>` key is built so the JC1/JC2 → 'JC'
 * mapping can never be forgotten at one call site. */
export function blueprintKeyFor(level: string, paper: string): string {
  return `${blueprintFamily(level)}-${paper}`;
}

// ── Exam-format facts (cover page + the /app/print duration chip) ────────────

/** Real exam paper durations, keyed by blueprint family `<family>-<paper>`.
 * One table, read by BOTH the renderer's cover and the /app/print client, so
 * the chip and the printed cover can never disagree. Read it via
 * paperDuration(), which maps student levels (JC1/JC2 → 'JC') first. */
export const DURATIONS: Record<string, string> = {
  'AM-P1': '2 hours 15 minutes',
  'AM-P2': '2 hours 15 minutes',
  // 4052 (first exam 2025, the 90-mark shape these blueprints match): SEAB
  // gives BOTH EM papers 2 h 15 min — '2 hours' was the old 4048 P1 habit.
  'EM-P1': '2 hours 15 minutes',
  'EM-P2': '2 hours 15 minutes',
  // H2 Math 9758: both papers are 3 hours.
  'JC-P1': '3 hours',
  'JC-P2': '3 hours',
};

export function paperDuration(level: string, paper: string): string | null {
  return DURATIONS[blueprintKeyFor(level, paper)] ?? null;
}

/** SEAB subject codes — the same derivation /api/admin/prelim-builder/export
 * ships on Adrian's own exports (moved here 2026-08-28 so both surfaces share
 * one copy): 4049 = Additional Mathematics, 4052 = Mathematics,
 * 9758 = H2 Mathematics (JC/JC1/JC2). */
export function subjectCode(level: string): string {
  if (level === 'AM') return '4049';
  if (blueprintFamily(level) === 'JC') return '9758';
  return '4052';
}

export function subjectName(level: string): string {
  // H2 9758's official cover title is also plain MATHEMATICS.
  return level === 'AM' ? 'ADDITIONAL MATHEMATICS' : 'MATHEMATICS';
}

/** Full paper code, exam-cover style: `4049/01`. */
export function paperCodeFull(level: string, paper: string): string {
  return `${subjectCode(level)}/${paper === 'P1' ? '01' : '02'}`;
}

/** The page-1 cover block render-prelim draws for a mock (type lives here so
 * the client-safe helpers and the Puppeteer renderer share it without this
 * module ever importing the renderer). */
export interface PrelimCover {
  centre: string;
  examLabel: string;
  subjectName: string;
  subjectCode: string; // full: "4049/01"
  paperLabel: string; // "Paper 1"
  duration: string;
  materials: string[];
  candidateLine?: string; // small provenance line, e.g. "Printed for … · AdrianMath"
}

/** Cover instructions for a student mock (rendered on page 1, exam style).
 * O-Level (EM/AM) wording — H2 has its own twin below; pick per level via
 * mockCoverInstructions(). */
export const MOCK_COVER_INSTRUCTIONS: string[] = [
  'Write your name, class and index number in the spaces at the top of this page.',
  'Answer all the questions.',
  'Write your answers and working in the spaces provided on the question paper.',
  'Give non-exact numerical answers correct to 3 significant figures, or 1 decimal place in the case of angles in degrees, unless a different level of accuracy is specified in the question.',
  'The use of an approved scientific calculator is expected, where appropriate.',
  'The number of marks is given in brackets [ ] at the end of each question or part question.',
];

/** H2 9758 twin of the cover instructions — the calculator lines every JC
 * paper carries in place of the O-Level scientific-calculator line: an
 * approved GRAPHING calculator is expected, and unsupported answers from it
 * are allowed unless a question says otherwise. */
export const MOCK_COVER_INSTRUCTIONS_H2: string[] = [
  'Write your name, class and index number in the spaces at the top of this page.',
  'Answer all the questions.',
  'Write your answers and working in the spaces provided on the question paper.',
  'Give non-exact numerical answers correct to 3 significant figures, or 1 decimal place in the case of angles in degrees, unless a different level of accuracy is specified in the question.',
  'The use of an approved graphing calculator is expected, where appropriate.',
  'Unsupported answers from a graphing calculator are allowed unless a question specifically states otherwise.',
  'The number of marks is given in brackets [ ] at the end of each question or part question.',
];

/** The right cover-instruction block for a level (H2 → graphing calculator). */
export function mockCoverInstructions(level: string): string[] {
  return blueprintFamily(level) === 'JC' ? MOCK_COVER_INSTRUCTIONS_H2 : MOCK_COVER_INSTRUCTIONS;
}

/** Assemble the cover block for a generated mock. Pure + unit-tested; the PDF
 * route passes the result straight to renderPrelimPDF. */
export function mockCover(
  level: string,
  paper: string,
  opts: { printedFor?: string | null; printedOn?: string | null } = {},
): PrelimCover {
  const who = opts.printedFor?.trim();
  return {
    centre: 'ADRIAN MATH TUITION',
    examLabel: 'MOCK EXAMINATION',
    subjectName: subjectName(level),
    subjectCode: paperCodeFull(level, paper),
    paperLabel: paper === 'P1' ? 'Paper 1' : 'Paper 2',
    duration: paperDuration(level, paper) ?? '2 hours 15 minutes',
    materials: ['Candidates answer on the Question Paper.', 'No additional materials are required.'],
    candidateLine: [who ? `Printed for ${who}` : null, opts.printedOn ?? null, 'AdrianMath']
      .filter(Boolean)
      .join(' · '),
  };
}

// ── Section headings (H2 P2) ─────────────────────────────────────────────────

/** A bold centred heading the renderer draws immediately before the question
 * whose pos is `beforePos`. */
export interface SectionHeading {
  beforePos: number;
  label: string;
}

/** Headings for a sectioned paper — H2 9758 P2's "Section A: Pure Mathematics"
 * before slot 1 and "Section B: Probability and Statistics" before the
 * blueprint's section_boundary slot. Section marks are summed from the
 * blueprint's typical slot marks (40/60 on JC-P2). Papers without a
 * section_boundary get no headings. Safe on refs positions: sectioned papers
 * must fill EVERY slot (MOCK_FILL_THRESHOLD on 10 slots), so rendered
 * positions equal blueprint positions. */
export function sectionHeadings(
  paperDef: { section_boundary?: number; slots: { pos: number; typ: number }[] } | null | undefined,
): SectionHeading[] {
  const boundary = paperDef?.section_boundary;
  if (!paperDef || !boundary) return [];
  const sum = (pred: (pos: number) => boolean) =>
    paperDef.slots.filter(s => pred(s.pos)).reduce((t, s) => t + s.typ, 0);
  return [
    { beforePos: 1, label: `Section A: Pure Mathematics [${sum(p => p < boundary)} marks]` },
    { beforePos: boundary, label: `Section B: Probability and Statistics [${sum(p => p >= boundary)} marks]` },
  ];
}

// ── Mock assembly (pure) ─────────────────────────────────────────────────────

/** A mock must fill ~all of its blueprint slots — a 90-mark paper with a third
 * of its questions missing is not a mock. At 0.95, EM-P1 (26 slots) tolerates
 * one unfilled slot; every other paper must fill completely. */
export const MOCK_FILL_THRESHOLD = 0.95;

/** After landTotal, the assembled total may miss the blueprint total by at
 * most this many marks — beyond that the paper is refused, never shipped short. */
export const MOCK_TOTAL_TOLERANCE = 2;

export interface MockSlotInput {
  pos: number;
  topic: string;
  target: number;
  candidates: Candidate[];
}

export type MockAssembly =
  | { ok: true; refs: PrintQuestionRef[]; totalMarks: number; landed: boolean }
  | { ok: false; error: string };

/**
 * The mock slot walk, pure: pick per slot (school-spread + mark-closeness
 * scoring via pickForSlot), enforce the fill gate, then LAND THE PAPER TOTAL
 * by swapping picks for alternates inside slot bands (landTotal — the step the
 * v1 route skipped, which let a "90-mark mock" ship at whatever the picks
 * summed to).
 *
 * Leakage boundary: the refs returned carry ONLY {id, pos, marks} — school,
 * year, answer presence and the rest of the Candidate are used for scoring in
 * here and never leave this function.
 */
export function assembleMockFromCandidates(
  slots: MockSlotInput[],
  totalTarget: number,
  rng: () => number,
): MockAssembly {
  const usedSchools = new Set<string>();
  const usedIds = new Set<string>();
  const picks: SlotPick[] = [];
  for (const s of slots) {
    const { pick, alternates } = pickForSlot(
      s.candidates,
      { target: s.target, difficulty: 'standard', usedSchools, usedIds },
      rng,
    );
    if (pick) {
      usedIds.add(pick.id);
      if (pick.school) usedSchools.add(pick.school);
    }
    picks.push({ pos: s.pos, topic: s.topic, target: s.target, pick, alternates });
  }

  const filled = picks.filter(p => p.pick);
  if (filled.length < Math.ceil(slots.length * MOCK_FILL_THRESHOLD)) {
    return {
      ok: false,
      error: `Only ${filled.length} of ${slots.length} questions could be filled for this mix — the bank is short of servable questions right now. Try Generate again (each build draws a fresh topic mix), or print a topic sheet instead.`,
    };
  }

  // Make each slot's {pick + alternates} id-disjoint across the whole paper so
  // landTotal's swaps can never introduce a duplicate question: an alternate
  // that is another slot's pick (or an earlier slot's alternate) is dropped.
  const claimed = new Set(filled.map(p => p.pick!.id));
  for (const p of picks) {
    p.alternates = p.alternates.filter(a => !claimed.has(a.id));
    for (const a of p.alternates) claimed.add(a.id);
  }

  const { landed } = landTotal(picks, totalTarget);
  const totalMarks = picks.reduce((a, p) => a + (p.pick?.total_marks ?? 0), 0);
  if (Math.abs(totalMarks - totalTarget) > MOCK_TOTAL_TOLERANCE) {
    return {
      ok: false,
      error: `The draw landed on ${totalMarks} marks instead of ${totalTarget} — try Generate again (each build draws a fresh topic mix).`,
    };
  }

  const refs: PrintQuestionRef[] = picks
    .filter(p => p.pick)
    .map((p, i) => ({ id: p.pick!.id, pos: i + 1, marks: p.pick!.total_marks }));
  return { ok: true, refs, totalMarks, landed };
}

/** Weakest first: weak < shaky < solid, then ascending score. Topics outside
 * `available` (nothing servable in the pool) are dropped. */
export function rankWeakTopics(
  mastery: TopicMastery[],
  available: Set<string>,
  max: number = MAX_TOPICS_PER_PAPER,
): string[] {
  const stateRank = { weak: 0, shaky: 1, solid: 2 } as const;
  return mastery
    .filter(m => available.has(m.topic))
    .sort((a, b) => (stateRank[a.state] - stateRank[b.state]) || (a.score - b.score))
    .slice(0, max)
    .map(m => m.topic);
}

// ---- QB row → renderer markdown (shared with /api/admin/prelim-builder/export) ----

export interface QbPartRow {
  label?: string;
  text?: string;
  marks?: number;
  answer?: string;
  subparts?: QbPartRow[];
}

export interface QbPrintRow {
  id: string;
  question_text: string | null;
  total_marks: number;
  parts: QbPartRow[] | null;
  answer: string | null;
  has_image: boolean | null;
  image_url: string | null;
}

/** First image path out of a bare path or JSON-encoded array, as a public
 * question_images storage URL. */
export function storageUrl(raw: string | null): string | null {
  if (!raw) return null;
  let path = raw;
  if (path.startsWith('[')) {
    try {
      const arr = JSON.parse(path);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      path = String(arr[0]);
    } catch {
      return null;
    }
  }
  path = path.replace(/^question_images\//, '');
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/question_images/${path}`;
}

/** Flatten stem + parts (+subparts) into the markdown the renderer expects. */
export function questionMarkdown(q: QbPrintRow): string {
  const chunks: string[] = [];
  if (q.question_text?.trim()) chunks.push(q.question_text.trim());
  for (const p of q.parts ?? []) {
    const label = p.label ? `(${p.label}) ` : '';
    if (p.subparts?.length) {
      if (p.text?.trim() || label) chunks.push(`${label}${(p.text ?? '').trim()}`.trim());
      for (const s of p.subparts) {
        const sm = s.marks ? `  [${s.marks}]` : '';
        chunks.push(`(${p.label ?? ''})(${s.label ?? ''}) ${(s.text ?? '').trim()}${sm}`);
      }
    } else {
      const marks = p.marks ? `  [${p.marks}]` : '';
      chunks.push(`${label}${(p.text ?? '').trim()}${marks}`.trim());
    }
  }
  return chunks.filter(Boolean).join('\n\n');
}

/** Final answers only — top-level `answer`, else rolled up from parts. */
export function answerMarkdown(q: QbPrintRow): string {
  if (q.answer?.trim()) return q.answer.trim();
  const bits: string[] = [];
  for (const p of q.parts ?? []) {
    if (p.answer?.trim()) bits.push(`(${p.label ?? '?'}) ${p.answer.trim()}`);
    for (const s of p.subparts ?? []) {
      if (s.answer?.trim()) bits.push(`(${p.label ?? '?'})(${s.label ?? '?'}) ${s.answer.trim()}`);
    }
  }
  return bits.join('  ');
}
