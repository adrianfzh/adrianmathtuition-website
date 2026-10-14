// 🩺 Question health — a maths bank question is checked the first time it is about to reach a
// student (14 Oct 2026, Adrian: "yes"). SPEC-QUESTION-HEALTH.md is the law; this file is every
// decision that is not a database read. Pure, no I/O — tested in question-health.test.ts.
//
//   · completenessProblems(q) — the checks a script can make with no model: parts intact,
//     marks add up, a key for every part, a figure where the text points at one, topic + level set.
//   · decide(q, report)        — the worker's report (blind solve, the compare, the school's
//     scheme, proposed copy fixes, a twin rewrite) → one status + the edits to apply.
//
// The moat line (CLAUDE.md, Building doctrine): where our solver and the SCHOOL's scheme disagree
// with each other, the question is paused for Adrian. A key is corrected on its own only when the
// solver AND the school's scheme both say our stored key is wrong — the stored key was a copy slip.
import { flatParts, plainNumber, type MathPart } from './twin-gates';

/** What a health row can say. `paused` and `retired` are never served; `passed`/`fixed` are served FIRST. */
export type HealthStatus = 'queued' | 'checking' | 'passed' | 'fixed' | 'paused' | 'retired';
export const BLOCKED_STATUSES: readonly HealthStatus[] = ['paused', 'retired'];
export const READY_STATUSES: readonly HealthStatus[] = ['passed', 'fixed'];

/** Why a question was put in the queue — which door asked. */
export const HEALTH_REASONS = ['practice', 'prefetch', 'sheet', 'worksheet', 'assign', 'paper', 'after-fix', 'suspect', 'manual'] as const;
export type HealthReason = (typeof HEALTH_REASONS)[number];

/** A worker that keeps a question longer than this lost it — the next run may take it again. */
export const LEASE_MINUTES = 30;
/** A question goes back in the queue after a copy fix; at this many checks it is retired instead. */
export const MAX_CHECKS = 3;
/** App practice: when a topic opens, this many unchecked questions of it are queued. */
export const PREFETCH = 4;

export type BankRow = {
  id: string;
  question_text?: string | null;
  answer?: string | null;
  solution?: string | null;
  parts?: MathPart[] | null;
  total_marks?: number | null;
  topics?: string[] | null;
  level?: string | null;
  has_image?: boolean | null;
  image_url?: string | null;
  images?: unknown;
  figure_url?: string | null;
  question_image_url?: string | null;
  ai_generated?: boolean | null;
  school?: string | null;
};

export const BANK_LEVELS = ['S1', 'S2', 'S3_EM', 'S3_AM', 'EM', 'AM', 'JC1', 'JC2'] as const;

export type Completeness = { code: 'parts' | 'marks' | 'key' | 'figure' | 'topic' | 'level' | 'text'; note: string };

const FIGURE_WORDS = /\b(the diagram|in the diagram|diagram (?:below|above|shows)|figure (?:below|above|shows)|the figure|graph (?:below|above) shows|shown (?:below|above|in the))\b/i;

function hasFigure(q: BankRow): boolean {
  const imgs = Array.isArray(q.images) ? q.images.length > 0 : false;
  return !!(q.figure_url || q.image_url || q.question_image_url || imgs || q.has_image);
}

function allText(q: BankRow): string {
  const parts = flatParts(q.parts ?? []).map((p) => p.text).join(' ');
  return `${q.question_text ?? ''} ${parts}`;
}

/**
 * The script's half of the completeness check — no model needed. The worker's own read
 * (a number missing mid-sentence, a figure that does not match the words) comes on top.
 */
export function completenessProblems(q: BankRow): Completeness[] {
  const out: Completeness[] = [];
  const text = allText(q).trim();
  if (text.length < 15 && !hasFigure(q)) out.push({ code: 'text', note: 'the question has almost no words' });
  const flat = flatParts(q.parts ?? []);
  const labels = flat.map((p) => p.label.toLowerCase());
  if (new Set(labels).size !== labels.length) out.push({ code: 'parts', note: 'two parts carry the same label' });
  if (flat.length > 1 && flat.some((p) => !p.text.trim())) out.push({ code: 'parts', note: 'a part has no words' });
  const sum = flat.reduce((s, p) => s + (p.marks || 0), 0);
  if (flat.length && q.total_marks && sum > 0 && sum !== q.total_marks) out.push({ code: 'marks', note: `parts add to ${sum} marks, the question says ${q.total_marks}` });
  const keyed = flat.length ? flat.every((p) => String(p.answer ?? '').trim()) : !!String(q.answer ?? '').trim();
  if (!keyed && !String(q.solution ?? '').trim()) out.push({ code: 'key', note: 'no answer to check against' });
  if (FIGURE_WORDS.test(text) && !hasFigure(q)) out.push({ code: 'figure', note: 'the words point at a figure the question does not have' });
  if (!(q.topics ?? []).some((t) => String(t).trim())) out.push({ code: 'topic', note: 'no topic' });
  if (!q.level || !(BANK_LEVELS as readonly string[]).includes(q.level)) out.push({ code: 'level', note: `level "${q.level ?? ''}" is not one we serve` });
  return out;
}

// ── the worker's report ────────────────────────────────────────────────────────────────

/** One part as the worker compared it. `ours` = our stored key (or the solution's final line), `solver` = the blind solve, `scheme` = the school's own answer when found. */
export type PartCompare = { label: string; ours: string | null; solver: string | null; scheme?: string | null; agree: boolean };

/** A copy fix the worker read off the SOURCE PAGE (never guessed). */
export type ProposedFix = {
  kind: 'copy' | 'topic' | 'level';
  field: 'question_text' | 'parts' | 'topics' | 'level';
  after: unknown;
  /** Where the true value was read: "<paper file> page N". Required — no evidence, no fix. */
  evidence: string;
};

export type HealthReport = {
  question_id: string;
  /** the model that solved blind — admin-only, never shown to a student */
  solver_model: string;
  parts: PartCompare[];
  /** the worker's own read of the question, beyond the script's checks */
  completeness: Completeness[];
  /** was the school's own answer found (paper_schemes or the paper's answer pages)? */
  scheme_found: boolean;
  scheme_source?: string | null;
  fixes?: ProposedFix[];
  /** our own twin whose wording tripped the solver: the rewrite, already solved blind again */
  twin_rewrite?: { question_text?: string; parts?: MathPart[]; blind_agrees: boolean } | null;
  /** nothing can save it (out of syllabus, the figure is gone and no page has it) */
  retire?: string | null;
  /** one plain line: what is wrong, for the list Adrian reads */
  problem?: string | null;
};

export type EditField = 'question_text' | 'parts' | 'topics' | 'level' | 'answer';
export type Edit = { field: EditField; after: unknown; kind: 'copy' | 'topic' | 'level' | 'key' | 'twin-rewrite'; evidence: string };

export type Decision = {
  status: HealthStatus;
  edits: Edit[];
  /** one plain line for the logbook and Adrian's list */
  note: string;
  /** a copy fix: check it again rather than stamping it */
  requeue?: boolean;
};

const norm = (s: unknown) => String(s ?? '').toLowerCase()
  .replace(/\*\*|answer:?/g, '').replace(/\\[dt]frac/g, '\\frac').replace(/\\left|\\right/g, '')
  .replace(/\$|\\[,;! ]|\s+/g, '');

/** Do two answers say the same thing? Plain numbers to 3 s.f.; anything else by its written form. */
export function sameAnswer(a: unknown, b: unknown): boolean {
  if (a == null || b == null || !String(a).trim() || !String(b).trim()) return false;
  const x = plainNumber(a), y = plainNumber(b);
  if (x != null && y != null) return x === y || Number(x.toPrecision(3)) === Number(y.toPrecision(3));
  return norm(a) === norm(b);
}

const isTwin = (q: BankRow) => q.ai_generated === true;
const labelKey = (l: unknown) => String(l ?? '').toLowerCase().replace(/[\s()]/g, '');

/** Our key on the disputed parts, replaced by the school's answer (which the solver shares). */
export function keyEdits(q: BankRow, bad: PartCompare[], source: string): Edit[] {
  const flat = flatParts(q.parts ?? []);
  if (!flat.length || (bad.length === 1 && labelKey(bad[0].label) === 'single')) {
    return [{ field: 'answer', after: String(bad[0].scheme), kind: 'key', evidence: source }];
  }
  const fix = new Map(bad.map((p) => [labelKey(p.label), p.scheme]));
  const walk = (parts: MathPart[], prefix = ''): MathPart[] => parts.map((p) => {
    const lab = `${prefix}(${String(p.label ?? '').replace(/^\(|\)$/g, '')})`;
    if (p.subparts?.length) return { ...p, subparts: walk(p.subparts, lab) };
    const k = labelKey(lab);
    return fix.has(k) ? { ...p, answer: String(fix.get(k)) } : p;
  });
  return [{ field: 'parts', after: walk(q.parts ?? []), kind: 'key', evidence: source }];
}

/**
 * The worker's report → what happens to the question. `checksSoFar` = earlier checks of this
 * row (a copy fix sends it round again; MAX_CHECKS stops a loop).
 */
export function decide(q: BankRow, r: HealthReport, checksSoFar = 0): Decision {
  const problems = [...completenessProblems(q), ...(r.completeness ?? [])];
  const bad = (r.parts ?? []).filter((p) => !p.agree);
  const fixes = (r.fixes ?? []).filter((f) => String(f.evidence ?? '').trim().length >= 4);

  if (r.retire) return { status: 'retired', edits: [], note: r.retire };

  // 1. Something is missing or wrong in the row itself.
  if (problems.length) {
    if (isTwin(q)) {
      if (r.twin_rewrite?.blind_agrees) return twinRewrite(r);
      return { status: 'retired', edits: [], note: `our own question: ${problems[0].note}; the twin lane writes another` };
    }
    if (fixes.length && checksSoFar + 1 < MAX_CHECKS) {
      return {
        status: 'queued', requeue: true,
        edits: fixes.map((f) => ({ field: f.field, after: f.after, kind: f.kind, evidence: f.evidence })),
        note: `fixed from the source (${problems.map((p) => p.note).join('; ')}) — checking again`,
      };
    }
    // No key to check against: Adrian may want to give one rather than lose the question.
    if (problems.every((p) => p.code === 'key')) return { status: 'paused', edits: [], note: r.problem || 'no answer to check against' };
    return { status: 'retired', edits: [], note: r.problem || problems.map((p) => p.note).join('; ') };
  }

  // 2. Every part agrees: healthy.
  if (!bad.length) return checksSoFar > 0
    ? { status: 'fixed', edits: [], note: 'healthy after the fix' }
    : { status: 'passed', edits: [], note: 'the solver agrees with our key' };

  // 3. Our own twin whose wording tripped the solver.
  if (isTwin(q)) {
    if (r.twin_rewrite?.blind_agrees) return twinRewrite(r);
    return { status: 'retired', edits: [], note: `our own question, the solver disagrees on ${bad.map((p) => p.label).join(', ')}; the twin lane writes another` };
  }

  // 4. A school question whose key the solver disputes. Only when the SCHOOL's scheme sides with
  //    the solver on EVERY disputed part is our key a copy slip we correct ourselves.
  const schemeSidesWithSolver = r.scheme_found && bad.every((p) => p.scheme != null && sameAnswer(p.scheme, p.solver) && !sameAnswer(p.scheme, p.ours));
  if (schemeSidesWithSolver) {
    return { status: 'fixed', edits: keyEdits(q, bad, r.scheme_source || "the school's scheme"), note: `key corrected on ${bad.map((p) => p.label).join(', ')} — the solver and the school's scheme agree` };
  }
  return {
    status: 'paused', edits: [],
    note: r.problem || bad.map((p) => `${p.label}: our key ${p.ours ?? '—'}, solver ${p.solver ?? '—'}${p.scheme ? `, school ${p.scheme}` : ''}`).join('; '),
  };
}

function twinRewrite(r: HealthReport): Decision {
  const edits: Edit[] = [];
  const why = 'reworded, solved blind again, agreed';
  if (r.twin_rewrite?.question_text) edits.push({ field: 'question_text', after: r.twin_rewrite.question_text, kind: 'twin-rewrite', evidence: why });
  if (r.twin_rewrite?.parts) edits.push({ field: 'parts', after: r.twin_rewrite.parts, kind: 'twin-rewrite', evidence: why });
  return edits.length
    ? { status: 'fixed', edits, note: 'our own question reworded; the fresh blind solve agrees' }
    : { status: 'retired', edits: [], note: 'our own question: the rewrite carried no text' };
}

/** The report has the shape the door needs, before anything is written. */
export function parseReport(raw: unknown): { ok: true; value: HealthReport } | { ok: false; error: string } {
  const o = raw as Partial<HealthReport> | null;
  if (!o || typeof o !== 'object') return { ok: false, error: 'report must be an object' };
  if (typeof o.question_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(o.question_id)) return { ok: false, error: 'question_id' };
  if (!Array.isArray(o.parts)) return { ok: false, error: 'parts must be a list (one row per part; one row labelled "single" for a one-answer question)' };
  for (const p of o.parts) {
    if (!p || typeof p.label !== 'string' || typeof p.agree !== 'boolean') return { ok: false, error: 'each part needs label + agree' };
  }
  if (typeof o.scheme_found !== 'boolean') return { ok: false, error: 'scheme_found' };
  for (const f of o.fixes ?? []) {
    if (!f || !['copy', 'topic', 'level'].includes(f.kind) || !['question_text', 'parts', 'topics', 'level'].includes(f.field)) return { ok: false, error: 'a fix may only touch question_text, parts, topics or level' };
    if (f.field === 'level' && !(BANK_LEVELS as readonly string[]).includes(String(f.after))) return { ok: false, error: 'fix: unknown level' };
    if (f.field === 'topics' && (!Array.isArray(f.after) || !f.after.length)) return { ok: false, error: 'fix: topics must be a non-empty list' };
    if (f.field === 'parts' && !Array.isArray(f.after)) return { ok: false, error: 'fix: parts must be a list' };
    if (f.field === 'question_text' && typeof f.after !== 'string') return { ok: false, error: 'fix: question_text must be text' };
  }
  return { ok: true, value: { solver_model: 'unknown', ...o, completeness: Array.isArray(o.completeness) ? o.completeness : [] } as HealthReport };
}

// ── the weekly message ───────────────────────────────────────────────────────────────

export type WeekCounts = { on: boolean; checked: number; passed: number; fixed: number; paused: number; pausedWaiting: number; retired: number; queued: number; oldestQueuedHours: number | null };

/** Monday's one Telegram message. Plain words (CLAUDE.md, Talking to Adrian). */
export function weeklyMessage(c: WeekCounts): string {
  if (!c.on && !c.checked) return '🩺 Question check: switched off — nothing was checked this week.';
  const lines = [
    '🩺 <b>Question check — last 7 days</b>',
    `Checked: ${c.checked} (${c.passed} fine)`,
    `Fixed: ${c.fixed}`,
    `Paused for you: ${c.paused} new, ${c.pausedWaiting} waiting in all`,
    `Retired: ${c.retired}`,
  ];
  if (c.oldestQueuedHours != null && c.oldestQueuedHours >= 24) lines.push(`⚠️ ${c.queued} waiting, the oldest for ${Math.round(c.oldestQueuedHours)} hours — is the checker running?`);
  if (c.pausedWaiting) lines.push('Your list: https://www.adrianmathtuition.com/admin/question-health');
  return lines.join('\n');
}
