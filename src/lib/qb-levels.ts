// Pure QB-level helpers — split out of lib/practice.ts (2026-08-22) because
// that module imports the server-only Supabase client and the admin Send-work
// card (a client component) needs `qbLevelsFor` too. No I/O here.

// The full QB level list — what admin (Adrian's testing) sees. Mirrors
// ADMIN_LEVELS in the practice page so both the picker UI and the overview
// endpoint agree on the admin view.
export const ALL_QB_LEVELS: { key: string; label: string }[] = [
  { key: 'S1', label: 'Sec 1' }, { key: 'S2', label: 'Sec 2' },
  { key: 'S3_EM', label: 'Sec 3 E-Math' }, { key: 'S3_AM', label: 'Sec 3 A-Math' },
  { key: 'EM', label: 'O-Level E-Math' }, { key: 'EM_NA', label: 'E-Math (NA)' },
  { key: 'AM', label: 'O-Level A-Math' }, { key: 'JC1', label: 'JC1 H2 Math' },
  { key: 'JC2', label: 'JC2 H2 Math' },
];

// Airtable Subjects (multipleSelects) → the QB level keys that subject unlocks.
// A key survives subject-filtering if ANY of the student's subjects maps to it.
const SUBJECT_KEYS: Record<string, string[]> = {
  'E Math': ['EM', 'S3_EM'],
  'A Math': ['AM', 'S3_AM'],
  'H2 Math': ['JC1', 'JC2'],
  'H1 Math': ['JC1', 'JC2'],
  'Math': ['S1', 'S2'],
  'IP Math': ['S1', 'S2'],
};

// Airtable/portal level → QB levels a student may practise.
// When `subjects` is a non-empty array, the level-derived candidate list is
// further filtered to the keys their subjects unlock. If subjects are absent
// or the filter would empty the list, fall back to the level-only result.
export function qbLevelsFor(
  accountLevel: string | null,
  subjects?: string[] | null,
): { key: string; label: string }[] {
  const l = accountLevel || '';
  let base: { key: string; label: string }[];
  if (/^Sec\s?1/i.test(l)) base = [{ key: 'S1', label: 'Sec 1' }];
  else if (/^Sec\s?2/i.test(l)) base = [{ key: 'S2', label: 'Sec 2' }];
  else if (/^Sec\s?3/i.test(l)) base = [
    { key: 'S3_EM', label: 'E Math (Sec 3)' }, { key: 'S3_AM', label: 'A Math (Sec 3)' },
    { key: 'EM', label: 'E Math (Sec 4)' }, { key: 'AM', label: 'A Math (Sec 4)' },
  ];
  // Sec 4/5 (O-Level year): E Math + A Math only. Math (NA) is deliberately
  // not offered to students (Adrian 2026-08-21 — portal students are Express
  // Sec 4s); the EM_NA bank stays reachable through the admin view.
  else if (/^Sec/i.test(l)) base = [
    { key: 'EM', label: 'E Math' }, { key: 'AM', label: 'A Math' },
  ];
  else if (/^JC1/i.test(l)) base = [{ key: 'JC1', label: 'H2 Math (JC1)' }, { key: 'JC2', label: 'H2 Math (JC2)' }];
  else if (/^JC/i.test(l)) base = [{ key: 'JC2', label: 'H2 Math' }];
  else base = [{ key: 'EM', label: 'E Math' }, { key: 'AM', label: 'A Math' }, { key: 'JC2', label: 'H2 Math' }];

  if (subjects && subjects.length) {
    const allowed = new Set<string>();
    for (const s of subjects) for (const k of (SUBJECT_KEYS[s] || [])) allowed.add(k);
    if (allowed.size) {
      const filtered = base.filter(b => allowed.has(b.key));
      if (filtered.length) return filtered;
    }
  }
  return base;
}

// Portal level key → how the practice RPCs should scope the bank. The
// question-type taxonomy (`subgroups`) is keyed AM / EM / JC / S1 / S2 only,
// so JC1/JC2 share the JC tree and the Sec 3 keys share the Sec 4 trees while
// narrowing to questions tagged with the Sec 3 level. Before this (2026-08-22)
// the portal passed 'JC2' / 'S3_AM' straight through and those students saw
// an empty topic list.
export function bankScope(levelKey: string): { level: string; qlevel: string | null } {
  switch (levelKey) {
    case 'JC1':
    case 'JC2':
      return { level: 'JC', qlevel: null };
    case 'S3_AM':
      return { level: 'AM', qlevel: 'S3_AM' };
    case 'S3_EM':
      return { level: 'EM', qlevel: 'S3_EM' };
    default:
      return { level: levelKey, qlevel: null };
  }
}
