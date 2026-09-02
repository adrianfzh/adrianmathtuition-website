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
