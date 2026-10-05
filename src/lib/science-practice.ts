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

/** The run: the same PracticeFlow, mounted under the Science family (app/science/practice/run) so the bottom bar stays Science. */
export function sciencePracticeHref(levelKey: string, topic: string, kind: PracticeKind, skill?: string | null): string {
  return `/app/science/practice/run?level=${encodeURIComponent(levelKey)}&topic=${encodeURIComponent(topic)}&mode=${kind}${skill ? `&skill=${encodeURIComponent(skill)}` : ''}`;
}

/**
 * One skill at a time inside a topic (3 Oct 2026, Adrian: "for stoichiometry >
 * allow them to choose that particular skill … so students can practice on that
 * skill"). The science bank's `questions.skill` column holds the slug; a row
 * that fits none (electrolysis charge, energy per mole) stays null and is only
 * met under "All skills, mixed". MCQ rows only are filed. The order is the
 * teaching order.
 */
export type TopicSkill = { slug: string; label: string };
export const TOPIC_SKILLS: Record<string, { topic: string; skills: readonly TopicSkill[] }> = {
  CHEM: {
    topic: 'Chemical Calculations',
    skills: [
      { slug: 'formula-mass', label: 'Relative formula mass and % by mass' },
      { slug: 'mass-moles', label: 'Mass ↔ moles' },
      { slug: 'gas-volume', label: 'Gas volume ↔ moles (24 dm³)' },
      { slug: 'concentration', label: 'Concentration (mol/dm³ and g/dm³)' },
      { slug: 'mole-ratio', label: 'Mole ratio from the equation' },
      { slug: 'limiting-reagent', label: 'Limiting reagent' },
      { slug: 'yield-purity', label: 'Percentage yield and purity' },
      { slug: 'empirical-formula', label: 'Empirical and molecular formula' },
      { slug: 'titration', label: 'Titration calculations' },
    ],
  },
};

/** The skills a topic can be narrowed to — MCQ only; none for any other topic. */
export function skillsFor(levelKey: string, topic: string, kind: PracticeKind): readonly TopicSkill[] {
  const t = TOPIC_SKILLS[levelKey];
  return kind === 'mcq' && t && t.topic === topic ? t.skills : [];
}

/** A skill slug from a URL or a request body: kept only when the topic really has it. */
export function parseSkill(levelKey: string, topic: string, v: unknown): string | null {
  return typeof v === 'string' && skillsFor(levelKey, topic, 'mcq').some(s => s.slug === v) ? v : null;
}

export function skillLabel(levelKey: string, topic: string, slug: string | null | undefined): string | null {
  return skillsFor(levelKey, topic, 'mcq').find(s => s.slug === slug)?.label ?? null;
}

/**
 * "Don't show the answer immediately" (3 Oct 2026) — the switch at the top of an
 * MCQ run, kept per device. Off (the default): a tap is checked at once. On: a
 * tap only picks a letter, and "Check my answer" shows the verdict.
 */
export const MCQ_HOLD_KEY = 'portal_mcq_hold_answer';
export function mcqTapAction(hold: boolean): 'check' | 'select' { return hold ? 'select' : 'check'; }

/**
 * The per-topic switch (5 Oct 2026): is this topic open to students? `open` is
 * lib/portal-beta SCIENCE_PRACTICE_OPEN_TOPICS; null = no gate (Adrian's preview).
 * Exact names — a topic spelt differently is closed.
 */
export type OpenTopics = Readonly<Record<string, readonly string[]>>;
export function scienceTopicOpen(open: OpenTopics | null, levelKey: string, topic: string | null | undefined): boolean {
  if (!open) return true;
  return !!topic && (open[levelKey] ?? []).includes(topic);
}
/** A row may be marked / shown by id when ANY of its topics is open (the picker serves by `topics @> [topic]`). */
export function scienceRowOpen(open: OpenTopics | null, levelKey: string, topics: readonly string[] | null | undefined): boolean {
  if (!open) return true;
  return (topics ?? []).some(t => scienceTopicOpen(open, levelKey, t));
}

/** The allow-list key of a pool: 'CHEM' for the pure bank, 'CS_CHEM' for Combined Science (5 Oct 2026). */
export function serveTopicKey(levelKey: string, combined: boolean): string {
  return combined ? `CS_${levelKey}` : levelKey;
}

/**
 * Which pool serves this topic (5 Oct 2026). A Combined Science student is served ONLY the
 * Combined Science bank, and only a topic open under its CS_ key (Adrian: switch Combined
 * students off until their own questions pass the check — no pure-pool stand-in). A pure
 * student: the pure bank, open topics. `open` null = Adrian's preview: every topic open, in
 * the pool he asked for.
 */
export function resolveTopicPool(open: OpenTopics | null, levelKey: string, topic: string | null | undefined, wantsCombined: boolean): { open: boolean; combined: boolean } {
  if (!open) return { open: true, combined: wantsCombined };
  return { open: scienceTopicOpen(open, serveTopicKey(levelKey, wantsCombined), topic), combined: wantsCombined };
}

/** The merged allow-list a student is gated by: pure topics under PHY/CHEM/BIO, Combined Science under CS_PHY/CS_CHEM/CS_BIO. */
export function mergedOpenTopics(pure: OpenTopics, combined: OpenTopics): OpenTopics {
  const out: Record<string, readonly string[]> = { ...pure };
  for (const [k, v] of Object.entries(combined)) out[serveTopicKey(k, true)] = v;
  return out;
}

/** May a row (by its level + topics) be shown / marked for this caller? Mirrors the picker. */
export function scienceRowServable(open: OpenTopics | null, levelKey: string, row: { level?: string | null; topics?: readonly string[] | null }, wantsCombined: boolean, poolLevels: (combined: boolean) => string[]): boolean {
  if (!open) return true;
  return (row.topics ?? []).some(t => {
    const r = resolveTopicPool(open, levelKey, t, wantsCombined);
    return r.open && poolLevels(r.combined).includes(row.level ?? '');
  });
}

/**
 * 🎚 Core · Exam · Challenge · Mixed (5 Oct 2026) — the level choice on a science MCQ run.
 * A question's level is `practice_difficulty.level` (lib/practice-difficulty: from students'
 * first tries once there are 20, else the estimate). Mixed = every question of the topic,
 * including those with no level yet; it is the default. A level is offered only when the
 * topic has at least LEVEL_MIN_QUESTIONS servable questions at it — a thinner level would
 * repeat itself within a sitting. Remembered per device (SCIENCE_LEVEL_KEY).
 */
export type ScienceLevelChoice = 'mixed' | 'core' | 'exam' | 'challenge';
export const SCIENCE_LEVEL_CHOICES: readonly ScienceLevelChoice[] = ['core', 'exam', 'challenge', 'mixed'];
export const SCIENCE_LEVEL_LABEL: Record<ScienceLevelChoice, string> = { core: 'Core', exam: 'Exam', challenge: 'Challenge', mixed: 'Mixed' };
export const SCIENCE_LEVEL_KEY = 'portal_science_level';
export const LEVEL_MIN_QUESTIONS = 30;
export function parseLevelChoice(v: unknown): ScienceLevelChoice {
  return v === 'core' || v === 'exam' || v === 'challenge' ? v : 'mixed';
}
/** The levels a topic can offer, in order: those with ≥ LEVEL_MIN_QUESTIONS questions. */
export function levelsOffered(counts: Partial<Record<'core' | 'exam' | 'challenge', number>>, min = LEVEL_MIN_QUESTIONS): ('core' | 'exam' | 'challenge')[] {
  return (['core', 'exam', 'challenge'] as const).filter(l => (counts[l] ?? 0) >= min);
}
/** The level a run actually draws from: the choice when the topic offers it, else Mixed. */
export function servedLevel(choice: ScienceLevelChoice, offered: readonly string[]): ScienceLevelChoice {
  return choice !== 'mixed' && offered.includes(choice) ? choice : 'mixed';
}
