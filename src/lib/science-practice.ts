// 🧪 Science practice — the pure half of /app/science/practice (Adrian, 1 Oct 2026:
// "option 2, but there is no need to show the number of questions"): one Practise
// item in the Science family's menu, one tab per science the student takes, an
// MCQ | Structured switch on top, the topics they LOST marks on first, then the
// plain topic list with no counts. MCQ is marked by comparing a letter (no model,
// no cap); a structured answer goes to the practice grader, which has not yet been
// checked against science scheme answers — so Structured stays behind Adrian's
// cookie (lib/portal-beta SCIENCE_STRUCTURED_PRACTICE_OPEN_TO_STUDENTS).
import type { ScienceSubject } from './science-levels';

export type PracticeKind = 'mcq' | 'structured';
export const PRACTICE_KINDS: readonly PracticeKind[] = ['mcq', 'structured'];
export function parsePracticeKind(v: unknown, fallback: PracticeKind = 'mcq'): PracticeKind {
  return v === 'mcq' || v === 'structured' ? v : fallback;
}

/** The mistakes-list subject label a science carries (lib/notebook-mistakes rows). */
export const SCIENCE_MISTAKE_SUBJECT: Record<ScienceSubject, string> = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology' };

export type LostTopic = { topic: string; lost: number };

/**
 * "Practise what you lost": the topics of a student's LIVE mistakes in one science
 * (state dark or light — fixed ones are done with), most mistakes first, ties by
 * name, at most `max`. A topic name is matched exactly against the bank's topic
 * list when one is given, so a chip never opens an empty run.
 */
export function lostTopics(
  rows: readonly { subject: string | null; topic: string | null; state: string }[],
  subject: ScienceSubject,
  bankTopics?: readonly string[] | null,
  max = 3,
): LostTopic[] {
  const want = SCIENCE_MISTAKE_SUBJECT[subject];
  const bank = bankTopics ? new Map(bankTopics.map(t => [t.toLowerCase(), t])) : null;
  const acc = new Map<string, number>();
  for (const r of rows) {
    if (r.subject !== want || !r.topic || (r.state !== 'dark' && r.state !== 'light')) continue;
    const key = bank ? bank.get(r.topic.trim().toLowerCase()) : r.topic.trim();
    if (!key) continue;
    acc.set(key, (acc.get(key) ?? 0) + 1);
  }
  return [...acc.entries()].map(([topic, lost]) => ({ topic, lost }))
    .sort((a, b) => b.lost - a.lost || a.topic.localeCompare(b.topic)).slice(0, max);
}

/** The topics a mode can serve: MCQ needs a lettered answer on file, structured needs a non-MCQ row. No counts are shown. */
export function topicsForKind(counts: readonly { topic: string; n: number; mcq_count: number }[], kind: PracticeKind): string[] {
  return counts.filter(c => (kind === 'mcq' ? c.mcq_count : c.n - c.mcq_count) > 0).map(c => c.topic);
}

/** The run lives on the existing practice page, told the level, the topic and the kind. */
export function sciencePracticeHref(levelKey: string, topic: string, kind: PracticeKind): string {
  return `/app/practice?level=${encodeURIComponent(levelKey)}&topic=${encodeURIComponent(topic)}&mode=${kind}`;
}
