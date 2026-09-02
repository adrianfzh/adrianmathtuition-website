// Which topics have an animated lesson (/app/lesson/[slug]) — the tiny map the
// entry points read. Pure data, client-safe (the practice topic sheet imports
// it), like lib/portal-theme.ts. The actual scripts live in data/lessons/ and
// load server-side only (lib/lesson-load.ts); this catalog deliberately holds
// just what a link needs, so nothing scene-shaped enters the client bundle.
//
// Adding a lesson = author data/lessons/<slug>.json + add ONE row here (the
// coherence test in lesson-script.test.ts fails if the two drift apart).
//
// `topic` must be the EXACT canonical topic string (lib/canonical-topics.ts)
// and `level` the bank taxonomy level (bankScope(levelKey).level) — that's what
// the practice picker matches on.

export interface LessonCatalogEntry {
  slug: string;
  /** Bank taxonomy level: AM / EM / JC / S1 / S2. */
  level: string;
  /** Exact canonical topic string. */
  topic: string;
  title: string;
  minutes: number;
}

export const LESSON_CATALOG: LessonCatalogEntry[] = [
  {
    slug: 'binomial-theorem-am',
    level: 'AM',
    topic: 'Binomial Theorem',
    title: 'The Binomial Theorem',
    // The narrated runtime (6.8 min of voice + two checks); a silent read is
    // shorter. Keep it honest — it's the promise on the entry row.
    minutes: 7,
  },
  {
    slug: 'quadratic-functions-am',
    level: 'AM',
    topic: 'Quadratic Functions',
    title: 'Completing the Square',
    minutes: 8,
  },
];

/**
 * The lesson for a topic, or null. This is also the helper a Home focus card
 * could use later ("Learn <topic> first — N min" beside a weak-topic chip):
 * hand it the student's bank level + the topic string, link to
 * `/app/lesson/${entry.slug}` when it returns one.
 */
export function lessonForTopic(level: string, topic: string): LessonCatalogEntry | null {
  return LESSON_CATALOG.find(l => l.level === level && l.topic === topic) ?? null;
}

export function lessonBySlug(slug: string): LessonCatalogEntry | null {
  return LESSON_CATALOG.find(l => l.slug === slug) ?? null;
}
