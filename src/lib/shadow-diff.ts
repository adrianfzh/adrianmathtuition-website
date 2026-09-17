// 📏 lib/shadow-diff — the part-by-part comparison of two readings of ONE paper
// (17 Sep 2026). The TS twin of the bot repo's `lib/shadow-diff.js`.
//
// TWINS, on purpose. The bot writes the shadow readings (it owns the marker);
// the website reads them (it owns the report and the desk). The two repos
// deploy separately, so the comparison exists on both sides — like
// lib/student-files.{js,ts}. **Change one, change the other**, and keep the
// worked examples in the tests identical so a drift shows up as a failing test
// rather than as two different numbers in two places.
//
// WHAT A "PART" IS. The same key the calibration harness uses: the question
// number's leading integer is the question, and the part is that number's own
// suffix joined to the part label — "9(a)" with part "(i)" files under
// 9 / "(a)(i)". A label seen twice in one question is summed.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not judge. A part that moved is not
// a part that got better; only a truth marking says that. This answers "did the
// marking move", which is what a consistency measure may answer on its own.

export type MarkedPart = {
  label?: string | null;
  part?: string | null;
  awarded?: number | string | null;
  max?: number | string | null;
};
export type MarkedResult = {
  question_number?: string | number | null;
  question?: string | number | null;
  q?: string | number | null;
  marking_output?: { parts?: MarkedPart[] } | null;
  marking?: { parts?: MarkedPart[] } | null;
};
export type Assembly = MarkedResult[] | { results?: MarkedResult[] | null } | null | undefined;

export type FlatPart = { key: string; question: string; label: string; awarded: number; max: number };
export type MovedPart = FlatPart extends never ? never : {
  key: string; question: string; label: string;
  before: number; after: number; delta: number; max: number; max_before?: number;
};

export type ShadowDiff = {
  parts: { total: number; moved: number; same: number; appeared: number; disappeared: number };
  moved: MovedPart[];
  appeared: FlatPart[];
  disappeared: FlatPart[];
  totals: { before: { awarded: number; max: number }; after: { awarded: number; max: number }; delta: number };
  summary: string;
  before_at: string | null;
  after_at: string | null;
};

export type PaperRollup = {
  label: string; parts: number; moved: number; delta: number; abs_delta: number; summary: string;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── the label rules, mirrored from the bot's lib/calibration.js ──────────────
const WHOLE_LABELS = new Set(['', '-', '—', 'whole', 'all', 'total', 'q', 'question']);
const NOISE_TOKENS = new Set(['part', 'parts', 'q', 'question', 'no', 'number']);

function isWholeQuestionLabel(s: string, questionNumber: string | number): boolean {
  const q = String(questionNumber).trim().toLowerCase();
  return s === q || s === `q${q}` || s === `question ${q}`;
}

/** "(a) (i)" → "(a)(i)"; a label that just names the whole question → "". */
export function normalizeLabel(label: unknown, questionNumber?: string | number): string {
  if (label == null) return '';
  const s = String(label).trim().toLowerCase();
  if (WHOLE_LABELS.has(s)) return '';
  if (questionNumber != null && isWholeQuestionLabel(s, questionNumber)) return '';
  const tokens = s.replace(/[–—]/g, '-').match(/[a-z]+|\d+|[-,/]/g) || [];
  return tokens
    .filter((t) => !NOISE_TOKENS.has(t))
    .map((t) => (/^[-,/]$/.test(t) ? t : `(${t})`))
    .join('');
}

/** "9(a)" → { key: '9', suffix: '(a)' }. */
export function questionKey(questionNumber: unknown): { key: string; suffix: string } {
  if (questionNumber == null) return { key: '?', suffix: '' };
  const s = String(questionNumber).trim();
  const m = s.match(/^(\d+)(.*)$/);
  if (m) return { key: String(parseInt(m[1], 10)), suffix: normalizeLabel(m[2]) };
  return { key: s.toLowerCase().replace(/\s+/g, '') || '?', suffix: '' };
}

/** The parts of one result, whichever of the two stored shapes it carries. */
export function partsOf(result: MarkedResult | null | undefined): MarkedPart[] {
  if (!result || typeof result !== 'object') return [];
  const a = result.marking_output?.parts;
  const b = result.marking?.parts;
  const parts = Array.isArray(a) ? a : Array.isArray(b) ? b : [];
  return parts.filter((p): p is MarkedPart => !!p && typeof p === 'object');
}

function questionNumberOf(result: MarkedResult): string | number | null {
  for (const k of ['question_number', 'question', 'q'] as const) {
    const v = result[k];
    if (v != null && String(v).trim()) return v as string | number;
  }
  return null;
}

/** One assembly → canonical part key → the marks on it. */
export function flattenParts(assembly: Assembly): Map<string, FlatPart> {
  const results = Array.isArray(assembly) ? assembly
    : (assembly && Array.isArray(assembly.results)) ? assembly.results : [];
  const out = new Map<string, FlatPart>();
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const { key, suffix } = questionKey(questionNumberOf(r));
    for (const p of partsOf(r)) {
      const label = suffix + normalizeLabel(p.label != null ? p.label : p.part, key);
      const id = `${key}${label}`;
      const e = out.get(id) || { key: id, question: key, label, awarded: 0, max: 0 };
      e.awarded += num(p.awarded);
      e.max += num(p.max);
      out.set(id, e);
    }
  }
  return out;
}

function totalsOf(flat: Map<string, FlatPart>): { awarded: number; max: number } {
  let awarded = 0, max = 0;
  for (const e of flat.values()) { awarded += e.awarded; max += e.max; }
  return { awarded, max };
}

function sortKey(a: { question: string; label: string }, b: { question: string; label: string }): number {
  const na = Number(a.question), nb = Number(b.question);
  const fa = Number.isFinite(na) ? na : Number.POSITIVE_INFINITY;
  const fb = Number.isFinite(nb) ? nb : Number.POSITIVE_INFINITY;
  return (fa - fb) || String(a.question).localeCompare(String(b.question))
    || String(a.label).localeCompare(String(b.label));
}

/** "3 of 42 parts moved, total 74 → 73" — one line, no jargon, no verdict. */
export function summaryLine(
  counts: { total: number; moved: number; appeared: number; disappeared: number },
  ta: { awarded: number }, tb: { awarded: number },
): string {
  const bits = [`${counts.moved} of ${counts.total} part${counts.total === 1 ? '' : 's'} moved`];
  if (counts.appeared) bits.push(`${counts.appeared} new`);
  if (counts.disappeared) bits.push(`${counts.disappeared} gone`);
  const totals = ta.awarded === tb.awarded ? `total ${tb.awarded} unchanged` : `total ${ta.awarded} → ${tb.awarded}`;
  return `${bits.join(', ')}, ${totals}`;
}

/**
 * The diff of two markings of one paper. `parts.total` counts every part either
 * marking scored — a part only one of them has still had to be looked at.
 * `moved` is by AWARDED only: a part whose max changed but whose award did not
 * is an allocation difference, not a mark that moved.
 */
export function diffAssemblies(
  before: Assembly, after: Assembly,
  opts: { beforeAt?: string | null; afterAt?: string | null } = {},
): ShadowDiff {
  const A = flattenParts(before);
  const B = flattenParts(after);
  const moved: MovedPart[] = [], appeared: FlatPart[] = [], disappeared: FlatPart[] = [];
  let same = 0;
  for (const [key, a] of A) {
    const b = B.get(key);
    if (!b) { disappeared.push({ key, question: a.question, label: a.label, awarded: a.awarded, max: a.max }); continue; }
    if (b.awarded !== a.awarded) {
      moved.push({
        key, question: a.question, label: a.label,
        before: a.awarded, after: b.awarded, delta: b.awarded - a.awarded,
        max: b.max, ...(b.max !== a.max ? { max_before: a.max } : {}),
      });
    } else same += 1;
  }
  for (const [key, b] of B) {
    if (!A.has(key)) appeared.push({ key, question: b.question, label: b.label, awarded: b.awarded, max: b.max });
  }
  moved.sort(sortKey); appeared.sort(sortKey); disappeared.sort(sortKey);
  const ta = totalsOf(A), tb = totalsOf(B);
  const total = A.size + appeared.length;
  return {
    parts: { total, moved: moved.length, same, appeared: appeared.length, disappeared: disappeared.length },
    moved, appeared, disappeared,
    totals: { before: ta, after: tb, delta: tb.awarded - ta.awarded },
    summary: summaryLine({ total, moved: moved.length, appeared: appeared.length, disappeared: disappeared.length }, ta, tb),
    before_at: opts.beforeAt ?? null,
    after_at: opts.afterAt ?? null,
  };
}

/** The paper-level roll-up the Monday line is built from. */
export function paperRollup(label: string, diff: ShadowDiff): PaperRollup {
  return {
    label: label || 'paper',
    parts: diff.parts.total,
    moved: diff.parts.moved,
    delta: diff.totals.delta,
    abs_delta: Math.abs(diff.totals.delta),
    summary: diff.summary,
  };
}

/**
 * The Monday report's ONE line, over every paper re-read this week.
 *
 *   "📏 Consistency: 8 papers re-read; parts moved 5 of 310; largest total move
 *    2 marks (Isabelle EM 2023 P2)."
 *   "📏 Consistency: 8 papers re-read; no part moved."
 *
 * null when nothing could be compared at all — the first week, or a week where
 * every read failed. A missing line is the honest answer to "we have no number
 * yet"; the job's ABSENCE from job_runs is what alarms.
 */
export function consistencyLine(rollups: PaperRollup[] | null | undefined): string | null {
  const rs = (Array.isArray(rollups) ? rollups : []).filter(Boolean);
  if (!rs.length) return null;
  const papers = rs.length;
  const moved = rs.reduce((s, r) => s + num(r.moved), 0);
  const parts = rs.reduce((s, r) => s + num(r.parts), 0);
  const head = `📏 Consistency: ${papers} paper${papers === 1 ? '' : 's'} re-read`;
  if (!moved) return `${head}; no part moved.`;
  const worst = rs.slice().sort((a, b) => num(b.abs_delta) - num(a.abs_delta) || num(b.moved) - num(a.moved))[0];
  const move = worst && num(worst.abs_delta)
    ? `; largest total move ${worst.abs_delta} mark${worst.abs_delta === 1 ? '' : 's'} (${worst.label})`
    : '';
  return `${head}; parts moved ${moved} of ${parts}${move}.`;
}

// ── the stored shape the bot writes (paper_marking_runs.result_json) ─────────

export type ShadowReading = {
  at: string;
  results: MarkedResult[];
  totals: { awarded?: number; max?: number } | null;
  rules_version: string | null;
  marked_by: string | null;
  model?: string | null;
};

/** The latest reading and the one before it — what the weekly diff compares. */
export function latestPair(shadowRuns: ShadowReading[] | null | undefined): { latest: ShadowReading | null; previous: ShadowReading | null } {
  const arr = (Array.isArray(shadowRuns) ? shadowRuns : []).filter(Boolean);
  return { latest: arr[arr.length - 1] ?? null, previous: arr[arr.length - 2] ?? null };
}
