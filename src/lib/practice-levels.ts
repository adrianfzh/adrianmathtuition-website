// 🎚 The three practice levels a student picks from, maths and science alike (SPEC-TWINS.md §12,
// Adrian 15 Oct 2026: "core should be B3-A1, advanced should be A1 and above", challenge =
// the bonus questions top schools set). Not wired to the picker yet — the twins are sorted first.

export type PracticeLevel = 'core' | 'advanced' | 'challenge';

export const PRACTICE_LEVELS: readonly PracticeLevel[] = ['core', 'advanced', 'challenge'];

export const PRACTICE_LEVEL_LABEL: Record<PracticeLevel, string> = {
  core: 'Core', advanced: 'Advanced', challenge: 'Challenge',
};

/** The one line under each button. */
export const PRACTICE_LEVEL_LINE: Record<PracticeLevel, string> = {
  core: 'Every exam question you must be able to do.',
  advanced: 'For A1 and above, and harder school papers.',
  challenge: 'Beyond the exam.',
};

/** Inside Core: Short (1–4 marks) or Long (5+ marks). */
export type CoreLength = 'short' | 'long';
export const SHORT_MAX_MARKS = 4;
export function coreLength(totalMarks: number | null | undefined): CoreLength | null {
  if (totalMarks == null || !Number.isFinite(totalMarks) || totalMarks <= 0) return null;
  return totalMarks <= SHORT_MAX_MARKS ? 'short' : 'long';
}

/** Science's results-based sort (lib/practice-difficulty) shown under the same names. */
export function fromScienceLevel(l: 'core' | 'exam' | 'challenge'): PracticeLevel {
  return l === 'challenge' ? 'advanced' : 'core';
}
