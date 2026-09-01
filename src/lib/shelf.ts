// 🧺 The student shelf — pure logic (IDEAS.md "wave 2 waiting", design agreed
// 2026-08-30; SPEC-TEACHING-CYCLE step 4).
//
// A shelf entry is a topic Adrian DELIBERATELY chose not to teach in the
// current round, carrying the evidence that decides the next one: per failed
// question the prompt, the part scores and the student's own annotated page —
// so wave 2 is picked off the shelf, never re-diagnosed from scratch.
//
// Everything with shape or state arithmetic lives here and is unit-tested
// (repo policy); the route and the pages only orchestrate. Non-mutating
// throughout — same contract as mark-triage.ts.

export const SHELF_STATUSES = ['waiting', 'started', 'done'] as const;
export type ShelfStatus = (typeof SHELF_STATUSES)[number];

/** One failed question's evidence, exactly as the design specifies. `error`
 *  (the marker's diagnosis) is optional extra context the profile view shows. */
export interface ShelfEvidence {
  question_number: string;
  prompt: string;
  awarded: number;
  max: number;
  annotated_page_url: string;
  error?: string;
}

export const MAX_EVIDENCE_PER_ENTRY = 12;

const MAX = { question: 24, prompt: 600, url: 500, error: 400, skill: 200, topic: 120 };

function cleanStr(v: unknown, cap: number): string {
  return String(v ?? '').trim().slice(0, cap);
}
function finiteNonNeg(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Validate a POSTed evidence list against the agreed element shape
 * { question_number, prompt, awarded, max, annotated_page_url }.
 * Returns the cleaned list or a human-readable refusal — never throws.
 */
export function parseEvidence(input: unknown):
  | { ok: true; evidence: ShelfEvidence[] }
  | { ok: false; error: string } {
  if (input == null) return { ok: true, evidence: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'evidence must be an array' };
  if (input.length > MAX_EVIDENCE_PER_ENTRY) {
    return { ok: false, error: `evidence is capped at ${MAX_EVIDENCE_PER_ENTRY} questions` };
  }
  const out: ShelfEvidence[] = [];
  for (let i = 0; i < input.length; i++) {
    const e = input[i] as Record<string, unknown> | null;
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      return { ok: false, error: `evidence[${i}] must be an object` };
    }
    const question_number = cleanStr(e.question_number, MAX.question);
    if (!question_number) return { ok: false, error: `evidence[${i}].question_number is required` };
    const awarded = finiteNonNeg(e.awarded);
    const max = finiteNonNeg(e.max);
    if (awarded == null) return { ok: false, error: `evidence[${i}].awarded must be a number ≥ 0` };
    if (max == null) return { ok: false, error: `evidence[${i}].max must be a number ≥ 0` };
    const item: ShelfEvidence = {
      question_number,
      prompt: cleanStr(e.prompt, MAX.prompt),
      awarded,
      max,
      annotated_page_url: cleanStr(e.annotated_page_url, MAX.url),
    };
    const error = cleanStr(e.error, MAX.error);
    if (error) item.error = error;
    out.push(item);
  }
  return { ok: true, evidence: out };
}

/**
 * GET's grouping: the shelf is a to-decide list, so waiting leads. An unknown
 * status (a legacy row the migration missed) folds into `done` — visible in the
 * history, never resurrected into the queue.
 */
export function groupShelf<T extends { status: string }>(rows: T[]): {
  waiting: T[]; started: T[]; done: T[];
} {
  const grouped = { waiting: [] as T[], started: [] as T[], done: [] as T[] };
  for (const r of rows) {
    if (r.status === 'waiting') grouped.waiting.push(r);
    else if (r.status === 'started') grouped.started.push(r);
    else grouped.done.push(r);
  }
  return grouped;
}

export type ShelfAction = 'start' | 'done' | 'reopen' | 'edit';

/**
 * PATCH's state machine. Returns the row patch to apply, or a refusal.
 * decided_at stamps the moment an entry left the queue (done); reopen clears it.
 */
export function applyShelfAction(
  row: { status: string },
  action: string,
  skillLabel?: unknown,
  now: Date = new Date(),
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  const at = now.toISOString();
  switch (action) {
    case 'start':
      if (row.status === 'done') return { ok: false, error: 'already done — reopen it first' };
      return { ok: true, patch: { status: 'started', updated_at: at } };
    case 'done':
      return { ok: true, patch: { status: 'done', decided_at: at, updated_at: at } };
    case 'reopen':
      if (row.status === 'waiting') return { ok: false, error: 'already waiting' };
      return { ok: true, patch: { status: 'waiting', decided_at: null, updated_at: at } };
    case 'edit': {
      const skill_label = cleanStr(skillLabel, MAX.skill);
      if (!skill_label) return { ok: false, error: 'skill_label is required' };
      return { ok: true, patch: { skill_label, updated_at: at } };
    }
    default:
      return { ok: false, error: `action must be one of start/done/reopen/edit` };
  }
}

// ── evidence auto-grab from a marking run ────────────────────────────────────
//
// The 🧺 Shelve buttons (triage, papers, game-plan pruning) send only
// { runId, questionNumber }; the server grabs the evidence from the run's own
// result_json here. Shapes follow the bot's marker output — see docs/MARKING.md.

type Json = Record<string, unknown>;
function asRecord(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resultsOf(resultJson: unknown): Json[] {
  const raw = asRecord(resultJson)?.results;
  return Array.isArray(raw) ? raw.map(asRecord).filter((r): r is Json => r !== null) : [];
}

/** `marking_output.question` is usually { number, prompt, max_marks }; older
 *  runs carry a bare string. Either way the student-readable prompt comes out. */
function promptOf(result: Json): string {
  const q = asRecord(result.marking_output)?.question;
  if (typeof q === 'string') return q.trim().slice(0, MAX.prompt);
  const p = asRecord(q)?.prompt;
  return typeof p === 'string' ? p.trim().slice(0, MAX.prompt) : '';
}

function topicOf(result: Json): string | null {
  const t = asRecord(asRecord(result.marking_output)?.meta)?.topic_detected;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

/** The annotated page the question sits on — the plain copy, same as the runs'
 *  own photo listings (the -sol twin carries worked solutions, not needed here). */
function annotatedUrlFor(resultJson: unknown, photoIndex: unknown): string {
  if (typeof photoIndex !== 'number') return '';
  const photos = asRecord(resultJson)?.annotated_photos;
  if (!Array.isArray(photos)) return '';
  for (const p of photos) {
    const ph = asRecord(p);
    if (ph && num(ph.photo_index) === photoIndex && typeof ph.url === 'string') return ph.url;
  }
  return '';
}

const normLabel = (s: string) => s.replace(/[()\s]/g, '').toLowerCase();

/** "Q6(b)" / "6(b)" / "6" → { base: "6", part: "(b)" | "" }. Null when there is
 *  no leading question number to anchor on. */
export function parseQuestionRef(ref: unknown): { base: string; part: string } | null {
  const m = String(ref ?? '').trim().match(/^Q?\s*(\d+)\s*(.*)$/i);
  if (!m) return null;
  return { base: m[1], part: m[2].trim() };
}

export interface RunQuestionEvidence {
  evidence: ShelfEvidence;
  topic: string | null;
  /** Marks this question left on the table — the shelf row's marks_lost. */
  lost: number;
}

/**
 * One question's shelf evidence out of a run's result_json.
 * `questionNumber` may name a part ("6(b)") — then the part's own scores and
 * error ride the element; a bare number takes the question totals and joins
 * every below-max part's diagnosis. Null when the question isn't in the run.
 */
export function extractQuestionEvidence(resultJson: unknown, questionNumber: string): RunQuestionEvidence | null {
  const ref = parseQuestionRef(questionNumber);
  if (!ref) return null;
  const matches = resultsOf(resultJson).filter(r => String(r.question_number ?? '').trim() === ref.base);
  if (!matches.length) return null;
  // Reconciliation dedupes repeats, but be safe: prefer the read that lost marks.
  const result = matches.find(r => {
    const m = asRecord(r.marking);
    return m ? num(m.total_awarded) < num(m.total_max) : false;
  }) ?? matches[0];

  const marking = asRecord(result.marking) ?? {};
  const parts = (Array.isArray(marking.parts) ? marking.parts : []).map(asRecord).filter((p): p is Json => p !== null);
  const url = annotatedUrlFor(resultJson, result.photo_index);
  const prompt = promptOf(result);
  const topic = topicOf(result);

  if (ref.part) {
    const part = parts.find(p => normLabel(String(p.label ?? '')) === normLabel(ref.part));
    if (!part) return null;
    const awarded = num(part.awarded);
    const max = num(part.max);
    const item: ShelfEvidence = {
      question_number: `${ref.base}${ref.part}`,
      prompt, awarded, max, annotated_page_url: url,
    };
    const err = cleanStr(part.error_summary, MAX.error);
    if (err) item.error = err;
    return { evidence: item, topic, lost: Math.max(0, max - awarded) };
  }

  const awarded = num(marking.total_awarded);
  const max = num(marking.total_max);
  const diagnoses = parts
    .filter(p => num(p.awarded) < num(p.max) && cleanStr(p.error_summary, MAX.error))
    .map(p => `${cleanStr(p.label, 12)} ${num(p.awarded)}/${num(p.max)} — ${cleanStr(p.error_summary, MAX.error)}`.trim());
  const item: ShelfEvidence = { question_number: ref.base, prompt, awarded, max, annotated_page_url: url };
  const err = diagnoses.join('; ').slice(0, MAX.error);
  if (err) item.error = err;
  return { evidence: item, topic, lost: Math.max(0, max - awarded) };
}

/** A one-line default when the shelver types nothing: the marker's first
 *  diagnosis, else the topic, else the question — never empty. */
export function defaultSkillLabel(ev: ShelfEvidence, topic: string | null): string {
  const firstError = (ev.error ?? '').split(';')[0].replace(/^\([a-z0-9]+\)\s*\d+\/\d+\s*—\s*/i, '').trim();
  if (firstError) return firstError.slice(0, MAX.skill);
  if (topic) return `Fix: ${topic}`.slice(0, MAX.skill);
  return `Fix Q${ev.question_number}`.slice(0, MAX.skill);
}

export interface LostQuestion {
  questionNumber: string;
  awarded: number;
  max: number;
  topic: string | null;
}

/** Every question that lost marks, in paper order — the papers page's 🧺 list. */
export function lostMarkQuestions(resultJson: unknown): LostQuestion[] {
  const seen = new Set<string>();
  const out: LostQuestion[] = [];
  for (const r of resultsOf(resultJson)) {
    const q = String(r.question_number ?? '').trim();
    if (!q || seen.has(q)) continue;
    const marking = asRecord(r.marking);
    if (!marking) continue;
    const awarded = num(marking.total_awarded);
    const max = num(marking.total_max);
    if (max <= 0 || awarded >= max) continue;
    seen.add(q);
    out.push({ questionNumber: q, awarded, max, topic: topicOf(r) });
  }
  return out;
}
