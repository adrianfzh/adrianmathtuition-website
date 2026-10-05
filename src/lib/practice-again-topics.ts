// 📘 Practice Again on the topics the student picks (Adrian, 5 Oct 2026: "for
// practice again sheets, when students are requesting them, allow them to say the
// topic they want, instead of generating all topics for the entire pdf").
//
// The Request button lists the topics this paper lost marks on (from the marking's
// own per-question topic), the student ticks one or more — the top one ticked to
// start — and may add a short note. The choice rides the sheet job's `focus` (the
// instruction slot the worker honours over its own judgement, WORKER_PROMPT.md
// §1e) as JSON, so `focus.topics` is read literally. Pure — tested.

/** A question as the paper page knows it (lib/portal-marking StudentQuestion). */
export type LostQuestion = { questionNumber: string; awarded: number; max: number; topic: string | null };

export type LostTopic = { topic: string; lost: number; questions: string[] };

/** The most topics the picker shows — a paper rarely loses marks on more. */
export const MAX_TOPICS = 8;
/** The note's length cap — a line, not a letter. */
export const NOTE_MAX = 200;

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The topics this paper lost marks on, most marks lost first (then by name),
 * each with the questions behind it. Questions with no topic are left out — a
 * paper whose marking named no topic shows no picker, and the request works
 * the old way (the whole paper).
 */
export function lostTopics(questions: readonly LostQuestion[]): LostTopic[] {
  const by = new Map<string, LostTopic>();
  for (const q of questions) {
    const lost = Number(q.max) - Number(q.awarded);
    const topic = clean(q.topic);
    if (!topic || !(lost > 0)) continue;
    const key = topic.toLowerCase();
    const t = by.get(key) ?? { topic, lost: 0, questions: [] };
    t.lost += lost;
    if (q.questionNumber && !t.questions.includes(q.questionNumber)) t.questions.push(q.questionNumber);
    by.set(key, t);
  }
  return [...by.values()]
    .sort((a, b) => b.lost - a.lost || a.topic.localeCompare(b.topic))
    .slice(0, MAX_TOPICS);
}

/**
 * What the student ticked, checked against the topics the paper really lost
 * marks on (the server recomputes that list — the browser's word is never
 * taken). Case-insensitive; kept in the list's order; unknown names dropped.
 */
export function pickTopics(chosen: unknown, available: readonly LostTopic[]): string[] {
  const want = new Set((Array.isArray(chosen) ? chosen : []).map(x => clean(x).toLowerCase()).filter(Boolean));
  return available.filter(t => want.has(t.topic.toLowerCase())).map(t => t.topic);
}

/** The optional note, one line, capped. */
export function cleanNote(raw: unknown): string {
  return clean(raw).slice(0, NOTE_MAX);
}

/**
 * The `sheet_jobs.focus` text for a topic request — JSON so the worker reads
 * `focus.topics` literally, with the instruction spelled out because a person
 * reads this column too.
 */
export function topicFocus(o: { topics: readonly string[]; note?: string | null }): string {
  const topics = o.topics.map(clean).filter(Boolean).slice(0, MAX_TOPICS);
  const note = cleanNote(o.note);
  return JSON.stringify({
    topics,
    ...(note ? { note } : {}),
    instruction: `The student asked for practice on ${topics.length === 1 ? 'ONE topic' : 'these topics'} only. Teach ONLY the gaps in ${topics.map(t => `"${t}"`).join(', ')}; every other topic is left out (not shelved as a next wave).${note ? ' Read their note.' : ''}`,
  });
}

/** The topics (and note) a job was asked for, or null for a whole-paper job. */
export function readTopicFocus(focus: unknown): { topics: string[]; note: string | null } | null {
  if (typeof focus !== 'string' || !focus.trim().startsWith('{')) return null;
  try {
    const j = JSON.parse(focus) as { topics?: unknown; note?: unknown };
    if (!Array.isArray(j.topics)) return null;
    const topics = j.topics.map(clean).filter(Boolean);
    if (!topics.length) return null;
    return { topics, note: cleanNote(j.note) || null };
  } catch { return null; }
}

/** "Quadratics", "Quadratics and Indices", "Quadratics, Indices and Surds". */
export function topicList(topics: readonly string[]): string {
  if (topics.length <= 1) return topics[0] ?? '';
  return `${topics.slice(0, -1).join(', ')} and ${topics[topics.length - 1]}`;
}
