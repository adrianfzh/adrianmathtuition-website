// 🔁 The learning loop (Adrian, 30 Oct 2026: "Video clip explanation for a type of
// question, then present with question, they write on iPad or on paper, submit, get
// marked > wrong, explain, do another question, until okay then next question").
// SPEC-LEARN-LOOP.md. Stage 1 = one topic (A Math Binomial Theorem), behind
// LEARN_LOOP_OPEN_TO_STUDENTS.
//
// Pure: the topic list, the order of question types, and where a student stands —
// derived on read from their own 'portal-loop' attempts, so nothing extra is stored.

/** One loop topic. `levels` = the bank levels it serves, best first (a Sec 3 gets S3_AM). */
export type LoopTopic = {
  key: string;
  title: string;
  topic: string;
  levels: readonly string[];
  /** The topic clip (lib/lesson-catalog slug) shown before the first question type. */
  clipSlug: string | null;
};

export const LOOP_TOPICS: readonly LoopTopic[] = [
  { key: 'am-binomial', title: 'Binomial Theorem', topic: 'Binomial Theorem', levels: ['S3_AM', 'AM'], clipSlug: 'binomial-theorem-am' },
];

export function loopTopic(key: unknown): LoopTopic | null {
  return LOOP_TOPICS.find(t => t.key === key) ?? null;
}

/** The first of the topic's levels this student may practise, or null. */
export function loopLevelFor(topic: LoopTopic, allowedLevels: readonly string[]): string | null {
  return topic.levels.find(l => allowedLevels.includes(l)) ?? null;
}

/** Marked loop answers a student may send in one day (24 h). Separate from Practice's 20. */
export const LOOP_DAILY_CAP = 30;

/** Misses on one type after which the page offers to move on and tells the student their tutor will go over it. */
export const LOOP_MISSES_BEFORE_HELP = 4;

export type LoopType = { id: number; name: string; order: number | null };

/** What every loop attempt carries in `marking_json.loop`. */
export type LoopMeta = { topic: string; subgroupId: number };

export function readLoopMeta(raw: unknown): LoopMeta | null {
  const m = raw && typeof raw === 'object' ? (raw as { loop?: unknown }).loop : null;
  if (!m || typeof m !== 'object') return null;
  const { topic, subgroupId } = m as { topic?: unknown; subgroupId?: unknown };
  if (typeof topic !== 'string' || !Number.isInteger(subgroupId)) return null;
  return { topic, subgroupId: subgroupId as number };
}

export type LoopAttempt = { question_id: string | null; marking_verdict: string | null; marking_json: unknown };

export type TypeProgress = LoopType & {
  tries: number;
  misses: number;
  done: boolean;
  /** Question ids already answered in this type — never served again. */
  seen: string[];
};

/** Question types in teaching order (order_index, then id), each with the student's tries. */
export function loopProgress(topicKey: string, types: LoopType[], attempts: LoopAttempt[]): TypeProgress[] {
  const ordered = [...types].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.id - b.id);
  return ordered.map(t => {
    const mine = attempts.filter(a => {
      const m = readLoopMeta(a.marking_json);
      return m && m.topic === topicKey && m.subgroupId === t.id;
    });
    // "Until okay" = one answer with full marks clears the type (the grader's 'correct').
    const done = mine.some(a => a.marking_verdict === 'correct');
    const misses = mine.filter(a => a.marking_verdict !== 'correct').length;
    return { ...t, tries: mine.length, misses, done, seen: [...new Set(mine.map(a => a.question_id).filter((x): x is string => !!x))] };
  });
}

/** The type to work on: the first not done, else null (the topic is finished). */
export function currentType(progress: TypeProgress[]): TypeProgress | null {
  return progress.find(p => !p.done) ?? null;
}

/** Show the clip card first: nothing answered in this topic yet. */
export function showClipFirst(progress: TypeProgress[]): boolean {
  return progress.every(p => p.tries === 0);
}
