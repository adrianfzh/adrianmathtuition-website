// Pure, import-anywhere helpers for the Learn experience (no server-only deps).
import type { UnitKind } from './learn-types';

// The learning_units.subject codes, mirroring the KB subject codes used by
// /app/notes. Order = the order subject tabs appear in.
export const ALL_LEARN_SUBJECTS = ['S1', 'S2', 'EM', 'AM', 'JC'] as const;

export const LEARN_SUBJECT_LABEL: Record<string, string> = {
  S1: 'Sec 1', S2: 'Sec 2', EM: 'E Math', AM: 'A Math', JC: 'H2 Math',
};

// Airtable Level → learning_units subject codes. Same mapping as the notes page.
export function learnSubjectsForLevel(level: string | null): string[] {
  if (!level) return ['EM', 'AM', 'JC'];
  if (/^Sec\s?1/i.test(level)) return ['S1'];
  if (/^Sec\s?2/i.test(level)) return ['S2'];
  if (/^Sec/i.test(level)) return ['EM', 'AM'];
  if (/^JC/i.test(level)) return ['JC'];
  return ['EM', 'AM', 'JC'];
}

export const KIND_META: Record<UnitKind, { icon: string; label: string }> = {
  core:    { icon: '📘', label: 'Concept' },
  example: { icon: '🎬', label: 'Worked example' },
  check:   { icon: '⚡', label: 'Quick check' },
  autopsy: { icon: '🔍', label: 'Spot the error' },
  try:     { icon: '✏️', label: 'Your turn' },
};

// Display order for a topic's unit list: core → examples → checks → autopsy → try,
// with unit_order as the tie-breaker inside each kind.
export const KIND_RANK: Record<UnitKind, number> = {
  core: 0, example: 1, check: 2, autopsy: 3, try: 4,
};
