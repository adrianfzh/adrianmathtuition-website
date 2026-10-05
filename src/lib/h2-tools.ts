// 🧭 + ✍️ The two JC H2 practice tools (Adrian, 5 Oct 2026: "build the which method
// drills and stats trainer") — the PURE half. SPEC-H2-TOOLS.md.
//
//   1. "Which method?" drills (`method_drills`): the START of a problem, 3–4
//      approaches, tap one WITHOUT solving. Marked by comparing an index — no model,
//      no cap. Feedback = one line on why that method + one line on why the tempting
//      wrong one fails.
//   2. The statistics write-up trainer (`stats_writeup_items`): the student TYPES
//      the worded part H2 papers mark (hypotheses, the conclusion in context, an
//      assumption, r, the regression line). Checked element by element against a
//      scheme-style checklist: a deterministic substring rule first (free); only the
//      elements the rule could not find go to a cheap model (capped per day), so a
//      paraphrase still counts. Each element: ✓/✗, "The scheme says" / "You wrote",
//      then the model answer.
//
// Items are OUR OWN wording, each grounded on a school-prelim H2 question
// (source_question_id) — never a national row (docs/CONTENT-POLICY.md).

// ── Who sees them ───────────────────────────────────────────────────────────

export type H2Tool = 'methods' | 'stats';

/** A JC student (Airtable level JC1 / JC2, or a bare "JC"). */
export function isJcLevel(level: string | null | undefined): boolean {
  const l = (level ?? '').trim().toUpperCase();
  return l === 'JC' || l === 'JC1' || l === 'JC2' || l.startsWith('JC ');
}

/**
 * The door rule: Adrian's admin cookie and the preview (demo) student always; any
 * other student only once the tool's switch is open AND they are a JC student.
 */
export function h2ToolVisible(o: {
  open: boolean; isAdmin: boolean; identity?: string | null; level?: string | null; previewIdentities: readonly string[];
}): boolean {
  if (o.isAdmin) return true;
  if (o.identity && o.previewIdentities.includes(o.identity)) return true;
  return o.open && isJcLevel(o.level);
}

// ── 1. "Which method?" drills ───────────────────────────────────────────────

export type MethodArea = 'integration' | 'vectors' | 'distributions';
export const METHOD_AREAS: readonly { key: MethodArea; label: string; blurb: string }[] = [
  { key: 'integration', label: 'Integration', blurb: 'Substitution, by parts, partial fractions or a standard form?' },
  { key: 'vectors', label: 'Vectors', blurb: 'Which formula starts the part?' },
  { key: 'distributions', label: 'Distributions and tests', blurb: 'Binomial, normal, the sample mean — and which test?' },
];
export function parseMethodArea(v: unknown): MethodArea | null {
  return v === 'integration' || v === 'vectors' || v === 'distributions' ? v : null;
}

export type MethodDrill = {
  id: string;
  area: MethodArea;
  skill: string;
  stem: string;
  ask: string | null;
  options: string[];
  answer: number;
  why: string;
  trap: number | null;
  trap_why: string | null;
};

export const DEFAULT_METHOD_ASK = 'Which method gets you started?';

/** A row from the table → a drill, or null when it is malformed (never served). */
export function toMethodDrill(r: Record<string, unknown>): MethodDrill | null {
  const area = parseMethodArea(r.area);
  const options = Array.isArray(r.options) ? (r.options as unknown[]).map(o => String(o ?? '').trim()) : [];
  const answer = typeof r.answer === 'number' ? r.answer : NaN;
  if (!area || typeof r.id !== 'string' || typeof r.stem !== 'string' || !r.stem.trim()) return null;
  if (options.length < 3 || options.length > 4 || options.some(o => !o)) return null;
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  const trap = typeof r.trap === 'number' && Number.isInteger(r.trap) && r.trap >= 0 && r.trap < options.length && r.trap !== answer ? r.trap : null;
  return {
    id: r.id, area, skill: String(r.skill ?? ''), stem: r.stem.trim(),
    ask: typeof r.ask === 'string' && r.ask.trim() ? r.ask.trim() : null,
    options, answer, why: String(r.why ?? '').trim(),
    trap, trap_why: trap !== null && typeof r.trap_why === 'string' && r.trap_why.trim() ? r.trap_why.trim() : null,
  };
}

export type MethodVerdict = {
  correct: boolean;
  answer: number;
  /** Why the right method works — always shown. */
  why: string;
  /** Why the tempting wrong one fails — shown when the student chose it, or under a right answer as "Not …". */
  trapWhy: string | null;
  trap: number | null;
  /** The student picked the item's named trap. */
  choseTrap: boolean;
};

export function checkMethodChoice(d: Pick<MethodDrill, 'answer' | 'why' | 'trap' | 'trap_why' | 'options'>, choice: number): MethodVerdict {
  const correct = choice === d.answer;
  return { correct, answer: d.answer, why: d.why, trapWhy: d.trap_why, trap: d.trap, choseTrap: !correct && d.trap !== null && choice === d.trap };
}

/** Deterministic shuffle (mulberry32 on a string seed) — the same order all day for one student. */
export function seededOrder<T>(items: readonly T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const rand = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * The run order: items the student has not answered right yet first (missed ones
 * before unseen ones, so a miss comes back), then the rest; within each group the
 * day's shuffle. `history` maps item id → was the LAST answer right.
 */
export function drillOrder<T extends { id: string }>(items: readonly T[], history: ReadonlyMap<string, boolean>, seed: string): T[] {
  const shuffled = seededOrder(items, seed);
  const missed = shuffled.filter(i => history.get(i.id) === false);
  const unseen = shuffled.filter(i => !history.has(i.id));
  const right = shuffled.filter(i => history.get(i.id) === true);
  return [...missed, ...unseen, ...right];
}

/** The score line for a run: "7 of 9 right". */
export function runScoreLine(right: number, done: number): string {
  return done === 0 ? '' : `${right} of ${done} right`;
}

// ── 2. The statistics write-up trainer ──────────────────────────────────────

export type StatsKind = 'hypotheses' | 'conclusion' | 'test-statistic' | 'assumption' | 'tail' | 'correlation' | 'regression';
export const STATS_KINDS: readonly { key: StatsKind; label: string }[] = [
  { key: 'hypotheses', label: 'Hypotheses' },
  { key: 'test-statistic', label: 'The test statistic' },
  { key: 'tail', label: 'One tail or two?' },
  { key: 'conclusion', label: 'Conclusions in context' },
  { key: 'assumption', label: 'Assumptions' },
  { key: 'correlation', label: 'Correlation' },
  { key: 'regression', label: 'Regression lines' },
];
export function parseStatsKind(v: unknown): StatsKind | null {
  return STATS_KINDS.some(k => k.key === v) ? (v as StatsKind) : null;
}

export type StatsElement = {
  id: string;
  label: string;
  scheme: string;
  /** Groups of alternatives: every group needs one alternative as a substring of the normalised answer. */
  match: string[][];
  /** Any of these in the answer fails the element ("accept h0", "prove"). */
  forbid?: string[];
};

export type StatsItem = {
  id: string;
  kind: StatsKind;
  context: string;
  task: string;
  elements: StatsElement[];
  model_answer: string;
};

export function toStatsItem(r: Record<string, unknown>): StatsItem | null {
  const kind = parseStatsKind(r.kind);
  if (!kind || typeof r.id !== 'string' || typeof r.context !== 'string' || typeof r.task !== 'string' || typeof r.model_answer !== 'string') return null;
  const els = Array.isArray(r.elements) ? (r.elements as Record<string, unknown>[]) : [];
  const elements: StatsElement[] = [];
  for (const e of els) {
    if (!e || typeof e.id !== 'string' || typeof e.label !== 'string' || typeof e.scheme !== 'string' || !Array.isArray(e.match)) return null;
    const match = (e.match as unknown[]).map(g => (Array.isArray(g) ? g.map(x => normaliseAnswer(String(x))).filter(Boolean) : [])).filter(g => g.length > 0);
    const forbid = Array.isArray(e.forbid) ? (e.forbid as unknown[]).map(x => normaliseAnswer(String(x))).filter(Boolean) : [];
    elements.push({ id: e.id, label: e.label, scheme: e.scheme, match, ...(forbid.length ? { forbid } : {}) });
  }
  if (elements.length === 0) return null;
  return { id: r.id, kind, context: r.context, task: r.task, elements, model_answer: r.model_answer };
}

/**
 * The text both the rule and the scheme are compared in: lowercase, μ → "mu",
 * σ → "sigma", ≠ ≤ ≥ spelled as ASCII, LaTeX dollars and backslashes dropped
 * (`\mu` → "mu", `\bar{x}` → "bar{x}"), whitespace collapsed.
 */
export function normaliseAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/μ/g, 'mu').replace(/σ/g, 'sigma').replace(/ρ/g, 'rho')
    .replace(/≠/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\\neq\b/g, '!=').replace(/\\ne\b/g, '!=').replace(/\\leq?\b/g, '<=').replace(/\\geq?\b/g, '>=')
    .replace(/\\(lt)\b/g, '<').replace(/\\(gt)\b/g, '>')
    .replace(/[$\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchElement(el: Pick<StatsElement, 'match' | 'forbid'>, normalised: string): boolean {
  if (el.forbid?.some(f => normalised.includes(f))) return false;
  return el.match.every(group => group.some(alt => normalised.includes(alt)));
}

export type ElementResult = {
  id: string;
  label: string;
  ok: boolean;
  scheme: string;
  /** The student's own words for this element (a line of their answer), or null when they did not write it. */
  yours: string | null;
  /** 'rule' = the substring rule found it; 'model' = the cheap model judged it; 'none' = not judged by a model (cap / failure). */
  how: 'rule' | 'model' | 'none';
};

/** The rule pass: which elements the substring rule already finds. */
export function ruleCheck(item: Pick<StatsItem, 'elements'>, answer: string): Map<string, boolean> {
  const n = normaliseAnswer(answer);
  return new Map(item.elements.map(e => [e.id, matchElement(e, n)]));
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'is', 'that', 'at', 'in', 'and', 'be', 'we', 'there', 'are', 'for', 'this', 'it', 'on', 'as', 'by', 'with', 'level']);
function words(s: string): Set<string> {
  return new Set(normaliseAnswer(s).split(/[^a-z0-9.<>=!%]+/).filter(w => w && !STOP.has(w)));
}

/** The sentences / lines of an answer (empty pieces dropped). */
export function answerPieces(answer: string): string[] {
  return answer.split(/\n+|(?<=[.;])\s+/).map(s => s.trim()).filter(Boolean);
}

/**
 * "You wrote": the piece of the student's answer that shares most words with the
 * scheme's wording for this element, or null when no piece shares any.
 */
export function closestPiece(answer: string, scheme: string): string | null {
  const want = words(scheme);
  let best: string | null = null; let bestN = 0;
  for (const p of answerPieces(answer)) {
    let n = 0; for (const w of words(p)) if (want.has(w)) n++;
    if (n > bestN) { bestN = n; best = p; }
  }
  return best;
}

/** What the model returns for each element it was asked about. */
export type ModelElementVerdict = { id: string; ok: boolean; quote: string | null };

/**
 * Merge the rule pass with the model's verdicts into the student's checklist.
 * The rule's ✓ stands (a found substring is never overruled); an element the rule
 * missed takes the model's verdict when there is one; otherwise it is ✗ with
 * how='none'. A forbid hit is a ✗ the model cannot overturn.
 */
export function mergeChecklist(
  item: Pick<StatsItem, 'elements'>, answer: string, rule: ReadonlyMap<string, boolean>, model: readonly ModelElementVerdict[] | null,
): ElementResult[] {
  const n = normaliseAnswer(answer);
  const byId = new Map((model ?? []).map(m => [m.id, m]));
  return item.elements.map(e => {
    const forbidden = !!e.forbid?.some(f => n.includes(f));
    if (rule.get(e.id)) return { id: e.id, label: e.label, ok: true, scheme: e.scheme, yours: closestPiece(answer, e.scheme), how: 'rule' as const };
    const m = byId.get(e.id);
    if (m && !forbidden) {
      const quote = m.quote && m.quote.trim() ? m.quote.trim().slice(0, 300) : null;
      return { id: e.id, label: e.label, ok: m.ok, scheme: e.scheme, yours: quote ?? closestPiece(answer, e.scheme), how: 'model' as const };
    }
    return { id: e.id, label: e.label, ok: false, scheme: e.scheme, yours: closestPiece(answer, e.scheme), how: m ? 'model' as const : 'none' as const };
  });
}

/** The ids the model still has to judge (rule missed, no forbid hit). */
export function idsForModel(item: Pick<StatsItem, 'elements'>, answer: string, rule: ReadonlyMap<string, boolean>): string[] {
  const n = normaliseAnswer(answer);
  return item.elements.filter(e => !rule.get(e.id) && !e.forbid?.some(f => n.includes(f))).map(e => e.id);
}

export function checklistLine(results: readonly ElementResult[]): string {
  const ok = results.filter(r => r.ok).length;
  return ok === results.length ? `All ${results.length} points there` : `${ok} of ${results.length} points there`;
}

/** Model calls a student may spend on the write-up trainer per Singapore day (the rule pass is free and unlimited). */
export const DAILY_STATS_MODEL_CAP = 30;
export const STATS_CHECK_MODEL = 'claude-haiku-4-5';
export const STATS_ANSWER_MAX = 1200;

/** The cheap model's prompt: judge ONLY the listed elements, quote the student's words, JSON back. */
export function buildElementCheckPrompt(item: Pick<StatsItem, 'context' | 'task' | 'elements'>, answer: string, ids: readonly string[]): string {
  const els = item.elements.filter(e => ids.includes(e.id));
  return [
    'You check a JC H2 Mathematics statistics answer against a mark scheme checklist.',
    'For EACH checklist element below, decide whether the student\'s answer contains it — the same meaning counts, the exact words do not matter, but the meaning must be fully there (the parameter named, the context stated, the level given, the direction right).',
    'Be strict the way an H2 marker is: "accept H0" or "proves" is wrong; a hypothesis about the SAMPLE mean is wrong; an assumption not in context is wrong; a wrong number or direction is wrong.',
    '',
    `Situation: ${item.context}`,
    `Task: ${item.task}`,
    '',
    'Checklist elements:',
    ...els.map(e => `- id "${e.id}": ${e.label} — the scheme says: "${e.scheme}"`),
    '',
    'Student\'s answer (between the lines):',
    '-----',
    answer,
    '-----',
    '',
    'Reply with ONLY a JSON object: {"elements":[{"id":"<id>","ok":true|false,"quote":"<the student\'s own words for this element, copied exactly, or empty>"}]} — one entry per element listed above.',
  ].join('\n');
}

export function parseElementCheckReply(text: string, ids: readonly string[]): ModelElementVerdict[] | null {
  try {
    const raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { elements?: unknown };
    if (!Array.isArray(raw.elements)) return null;
    const out: ModelElementVerdict[] = [];
    for (const e of raw.elements as Record<string, unknown>[]) {
      if (!e || typeof e.id !== 'string' || !ids.includes(e.id) || typeof e.ok !== 'boolean') continue;
      out.push({ id: e.id, ok: e.ok, quote: typeof e.quote === 'string' && e.quote.trim() ? e.quote.trim() : null });
    }
    return out.length ? out : null;
  } catch { return null; }
}
