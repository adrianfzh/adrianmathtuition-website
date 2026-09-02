// The teaching-knowledge layer — ONE accessor over Adrian's mined teaching
// material (Supabase `method_templates`, `pitfalls`, `formula_ref`) for every
// surface that wants it: the practice hint, the practice grader, the paper
// marker (bot), question generation (bot), the self-study sheet skill and the
// Reference page. Adrian, 2026-09-03: "shouldn't these extractions be available
// in all different surfaces and be used whenever/wherever it sees fit?"
//
// The rules live in ONE place — the `teaching_knowledge` Postgres function
// (migration `teaching_knowledge_layer`): strict canonical-topic match,
// approved-only on both tables, duplicates collapsed, and when the question
// text is supplied the rows are ranked by content-word overlap with it so a
// broad topic sends the closest few. This module is the typed doorway plus the
// pure formatters; it never re-implements the selection.
//
// Fail-soft by contract: every loader returns EMPTY_KNOWLEDGE on any error, so
// a knowledge outage can never stop a student being graded or a paper marked.

export type KnowledgeMethod = {
  id: string;
  topic: string | null;
  question_type: string;
  method: string;
  watch_out: string | null;
};

export type KnowledgePitfall = {
  id: string;
  topic: string | null;
  context: string | null;
  wrong_move: string;
  why_wrong: string | null;
  corrective_cue: string | null;
};

export type KnowledgeFormula = {
  area: string | null;
  result: string;
  statement: string | null;
  given_status: string | null; // given | memorise | derive
};

export type TeachingKnowledge = {
  subject: string | null; // AM | EM | JC | S1 | S2, or null when the level has no knowledge shelf
  methods: KnowledgeMethod[];
  pitfalls: KnowledgePitfall[];
  formulae: KnowledgeFormula[];
};

export const EMPTY_KNOWLEDGE: TeachingKnowledge = Object.freeze({
  subject: null, methods: [], pitfalls: [], formulae: [],
}) as TeachingKnowledge;

/**
 * Level → knowledge subject. TS mirror of the SQL `teaching_subject_for_level`
 * (kept in step by the test): questions carry fine levels (S3_AM, EM_NA,
 * JC2_H1…), the knowledge tables carry AM/EM/JC/S1/S2. Science levels are
 * excluded explicitly — 'CHEM' would otherwise match the EM rule.
 */
export function knowledgeSubjectForLevel(level: string | null | undefined): string | null {
  const l = String(level || '').trim().toUpperCase();
  if (!l) return null;
  if (/^(PHY|CHEM|BIO|SCI)/.test(l) || /_(PHY|CHEM|BIO)/.test(l)) return null;
  if (l === 'S1') return 'S1';
  if (l === 'S2') return 'S2';
  if (l.startsWith('JC')) return 'JC';
  if (l.includes('AM')) return 'AM';
  if (l.includes('EM')) return 'EM';
  return null;
}

export type KnowledgeQuery = {
  level: string | null | undefined;
  topics: unknown;          // questions.topics (text[]) — anything non-array → no topics
  context?: string;         // the question text (+ answer): drives the relevance ranking
  methods?: number;         // caps; 0 skips that table
  pitfalls?: number;
  formulae?: number;
};

/** Normalise a `questions.topics` value into the string list the RPC wants. */
export function topicList(topics: unknown): string[] {
  if (Array.isArray(topics)) return topics.map(t => String(t ?? '').trim()).filter(Boolean);
  if (typeof topics === 'string' && topics.trim()) return [topics.trim()];
  return [];
}

/**
 * Load the knowledge for one question. `admin` is the service-key Supabase
 * client (deliberately untyped: threading the generated generics through an
 * RPC call trips "type instantiation is excessively deep", and the payload is
 * shaped defensively below anyway). Never throws.
 */
export async function loadTeachingKnowledge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  q: KnowledgeQuery,
): Promise<TeachingKnowledge> {
  try {
    const topics = topicList(q.topics);
    if (!knowledgeSubjectForLevel(q.level) || !topics.length) return EMPTY_KNOWLEDGE;
    const { data, error } = await admin.rpc('teaching_knowledge', {
      p_level: String(q.level),
      p_topics: topics,
      p_context: String(q.context || '').slice(0, 4000),
      p_methods: q.methods ?? 4,
      p_pitfalls: q.pitfalls ?? 4,
      p_formulae: q.formulae ?? 0,
    });
    if (error || !data || typeof data !== 'object') return EMPTY_KNOWLEDGE;
    return shapeKnowledge(data);
  } catch {
    return EMPTY_KNOWLEDGE;
  }
}

/** Defensive shaping of the RPC's jsonb — every array is real, every text field a string or null. */
export function shapeKnowledge(raw: unknown): TeachingKnowledge {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    subject: s(r.subject),
    methods: arr(r.methods)
      .filter(m => m && typeof m.method === 'string' && (m.method as string).trim())
      .map(m => ({ id: String(m.id ?? ''), topic: s(m.topic), question_type: String(m.question_type ?? ''), method: String(m.method), watch_out: s(m.watch_out) })),
    pitfalls: arr(r.pitfalls)
      .filter(p => p && typeof p.wrong_move === 'string' && (p.wrong_move as string).trim())
      .map(p => ({ id: String(p.id ?? ''), topic: s(p.topic), context: s(p.context), wrong_move: String(p.wrong_move), why_wrong: s(p.why_wrong), corrective_cue: s(p.corrective_cue) })),
    formulae: arr(r.formulae)
      .filter(f => f && typeof f.result === 'string')
      .map(f => ({ area: s(f.area), result: String(f.result), statement: s(f.statement), given_status: s(f.given_status) })),
  };
}

// ─── Formatters (pure) ────────────────────────────────────────────────────────

/**
 * The student-facing hint: Adrian's method for this question type, shown
 * BEFORE the solution on /app/practice. Deliberately answer-free — it says how
 * to start, never what comes out. Empty string when there is nothing to say.
 */
export function methodHintMarkdown(k: TeachingKnowledge, max = 2): string {
  const methods = k.methods.slice(0, Math.max(0, max));
  if (!methods.length) return '';
  const blocks = methods.map(m => {
    const head = m.question_type ? `**${m.question_type}**\n\n` : '';
    const watch = m.watch_out ? `\n\n⚠️ _${m.watch_out}_` : '';
    return `${head}${m.method}${watch}`;
  });
  return blocks.join('\n\n---\n\n');
}

/** Prompt lines for a method list — one bullet per template, watch-out attached. */
export function methodsPromptLines(methods: KnowledgeMethod[]): string {
  return methods
    .map(m => `- ${m.question_type ? `${m.question_type}: ` : ''}${m.method}${m.watch_out ? ` Watch out: ${m.watch_out}` : ''}`)
    .join('\n');
}

/** Prompt lines for a trap list — wrong move, why, and the cue in Adrian's words. */
export function pitfallsPromptLines(pitfalls: KnowledgePitfall[]): string {
  return pitfalls
    .map(p => `- ${p.wrong_move}${p.why_wrong ? ` — ${p.why_wrong}` : ''}${p.corrective_cue ? ` Say instead: ${p.corrective_cue}` : ''}`)
    .join('\n');
}

// ─── Deck plans: the method above a set of worked examples ─────────────────────
// Adrian, 3 Sep 2026 ("worked example swipe cards — yes, check for redundancy").
// The templates were mined from the same notes the cards come from, so a deck's
// card titles and sub-group ledes often already announce the move ("Solve by
// combining log terms", "Evaluate log_4 32 by change of base"). A template whose
// content words are mostly present in that announcing text is redundant there and
// is dropped; what remains is the general method the deck shows but never states.

const STOP_WORDS = new Set(['the','that','this','with','when','from','into','every','each','your','then','than',
  'which','what','have','there','their','find','show','given','value','values','hence','where','also','both',
  'such','using','write','express','state','calculate','determine','them','they','will','only']);

/** Distinct content-word stems of a text: ≥4 letters, no stop words, maths stripped, first five letters so
 *  combine/combining and logarithm/logarithms fall together. */
export function contentWords(text: string): string[] {
  return [...new Set(
    String(text || '').toLowerCase().replace(/\$[^$]*\$/g, ' ').split(/[^a-z]+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w)).map(w => w.slice(0, 5)),
  )];
}

/**
 * Drop the templates a deck already states. `deckText` is the deck's ANNOUNCING
 * text — card titles, sub-group names and ledes — never the worked steps (those
 * mention every law by name, and would flag everything). A template is redundant
 * when at least `threshold` of its content words appear in that text.
 */
export function filterRedundantMethods<T extends { question_type: string; method: string }>(
  methods: T[], deckText: string, threshold = 0.6,
): T[] {
  const deck = new Set(contentWords(deckText));
  return methods.filter(m => {
    const words = contentWords(`${m.question_type} ${m.method}`);
    if (!words.length) return false;
    const hits = words.filter(w => deck.has(w)).length;
    return hits / words.length < threshold;
  });
}

/**
 * The plan for one deck (level code + canonical topic): the closest approved
 * methods (ranked by overlap with the deck's announcing text), minus the ones the
 * deck already announces, capped at `max`. Used by /revise worked-example decks
 * and the /notes topic pages. Never throws; [] when the shelf has nothing.
 */
export async function loadDeckPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  q: { level: string; topic: string; deckText: string; max?: number },
): Promise<KnowledgeMethod[]> {
  const max = q.max ?? 3;
  const k = await loadTeachingKnowledge(admin, { level: q.level, topics: [q.topic], context: q.deckText, methods: max + 4, pitfalls: 0 });
  return filterRedundantMethods(k.methods, q.deckText).slice(0, max);
}
