// Shared types + helpers for the curriculum-intelligence "strategy layer".
//
// A topic_meta row is a per-subject×topic pedagogy model: three orderings that
// coexist without collapsing into one —
//   default_order  — school/syllabus presentation order (browsing default)
//   prerequisites  — pedagogical dependency DAG (READINESS HINTS only)
//   (lesson-log spotlight lives elsewhere — out of scope here)
// plus strategic metadata (exam_weight, difficulty, emphasis, notes, must_master).
//
// Pure types + constants — safe to import from server routes and client components.

export type Emphasis = 'mcq' | 'structured' | 'both';

export type MustMasterKind = 'diagram' | 'comparison' | 'drill' | 'chain';
export const MUST_MASTER_KINDS: MustMasterKind[] = ['diagram', 'comparison', 'drill', 'chain'];

export interface MustMasterItem {
  kind: MustMasterKind;
  label: string;
}

export interface TopicMeta {
  subject: string;
  topic: string;
  default_order: number | null;
  prerequisites: string[];
  exam_weight: number;     // 1–5
  difficulty: number;      // 1–5
  emphasis: Emphasis;
  emphasis_note: string | null;
  leverage_note: string | null;
  must_master: MustMasterItem[];
  watch_for: string | null;
  updated_at?: string;
}

// Selectable subjects for the curriculum editor. BIO is seeded; the maths keys
// mirror the learning_units subject codes (see lib/learn.ts) and may be empty
// until someone starts filling them in.
export const CURRICULUM_SUBJECTS: { key: string; label: string }[] = [
  { key: 'BIO', label: 'Biology' },
  { key: 'AM', label: 'A Math' },
  { key: 'EM', label: 'E Math' },
  { key: 'JC', label: 'H2 Math' },
  { key: 'S1', label: 'Sec 1' },
  { key: 'S2', label: 'Sec 2' },
];

export const EMPHASIS_BADGE: Record<Emphasis, string> = {
  mcq: 'MCQ',
  structured: 'STRUCT',
  both: 'BOTH',
};

export const MUST_MASTER_ICON: Record<MustMasterKind, string> = {
  diagram: '▦',
  comparison: '⇄',
  drill: '⟳',
  chain: '⛓',
};

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(v)));
};

const strOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

// Coerce arbitrary input into a clean, DB-shaped topic_meta patch. Only the keys
// actually present on `body` are written (so a partial autosave patch stays
// partial); subject/topic are handled by the caller.
export function sanitizeMustMaster(v: unknown): MustMasterItem[] {
  if (!Array.isArray(v)) return [];
  const out: MustMasterItem[] = [];
  for (const it of v) {
    if (!it || typeof it !== 'object') continue;
    const kind = (it as { kind?: unknown }).kind;
    const label = strOrNull((it as { label?: unknown }).label);
    if (!label) continue;
    if (!MUST_MASTER_KINDS.includes(kind as MustMasterKind)) continue;
    out.push({ kind: kind as MustMasterKind, label });
  }
  return out;
}

export function buildTopicMetaPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ('default_order' in body) {
    patch.default_order = body.default_order === null ? null : Number(body.default_order);
  }
  if ('prerequisites' in body) {
    patch.prerequisites = Array.isArray(body.prerequisites)
      ? [...new Set(body.prerequisites.map(String).map(s => s.trim()).filter(Boolean))]
      : [];
  }
  if ('exam_weight' in body) patch.exam_weight = clamp(body.exam_weight, 1, 5, 3);
  if ('difficulty' in body) patch.difficulty = clamp(body.difficulty, 1, 5, 3);
  if ('emphasis' in body) {
    patch.emphasis = ['mcq', 'structured', 'both'].includes(body.emphasis as string)
      ? body.emphasis : 'both';
  }
  if ('emphasis_note' in body) patch.emphasis_note = strOrNull(body.emphasis_note);
  if ('leverage_note' in body) patch.leverage_note = strOrNull(body.leverage_note);
  if ('watch_for' in body) patch.watch_for = strOrNull(body.watch_for);
  if ('must_master' in body) patch.must_master = sanitizeMustMaster(body.must_master);
  return patch;
}

export const TOPIC_META_COLS =
  'subject, topic, default_order, prerequisites, exam_weight, difficulty, emphasis, emphasis_note, leverage_note, must_master, watch_for, updated_at';
