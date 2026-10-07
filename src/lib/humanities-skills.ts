// The skill picture (SPEC-HUMANITIES.md §A2, 7 Oct 2026): for each skill a
// student has answered, how many answers were read and the level they usually
// reach. No new marking — it only reads the levels already on humanities_runs.
// Pure; the Home card and "practice by skill" (weakest first) both use it.

/** The columns the picture needs from a humanities_runs row. */
export interface SkillRunRow {
  skill: string;
  status: string;
  level_lo: number | null;
  level_hi: number | null;
  levels_max: number | null;
  created_at: string;
}

export type SkillStanding = 'top' | 'steady' | 'practise';

export interface SkillLine {
  skill: string;
  /** Read answers of this skill, all time. */
  answered: number;
  /** The usual level range over the latest answers (the middle one of each end). */
  lo: number;
  hi: number;
  max: number;
  standing: SkillStanding;
}

/** The usual level looks at this many of the newest answers — older ones stop counting. */
export const SKILL_WINDOW = 5;

const middle = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  // An even count takes the lower middle: never flatter than the answers were.
  return s[Math.floor((s.length - 1) / 2)];
};

/** 'top' at the top level; 'practise' two or more levels below it; otherwise 'steady'. */
export function standingOf(lo: number, hi: number, max: number): SkillStanding {
  if (lo >= max) return 'top';
  if (hi <= max - 2) return 'practise';
  return 'steady';
}

/**
 * One line per skill with a read answer, weakest first (the usual level as a
 * share of the top level; fewer answers first on a tie, then the skill's name).
 */
export function skillPicture(rows: SkillRunRow[]): SkillLine[] {
  const by = new Map<string, SkillRunRow[]>();
  for (const r of rows) {
    if (r.status !== 'marked' && r.status !== 'held') continue;
    if (!r.level_lo || !r.level_hi || !r.levels_max) continue;
    by.set(r.skill, [...(by.get(r.skill) ?? []), r]);
  }
  const lines: SkillLine[] = [];
  for (const [skill, list] of by) {
    const latest = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, SKILL_WINDOW);
    const max = latest[0].levels_max!;
    const lo = middle(latest.map(r => Math.min(r.level_lo!, r.level_hi!)));
    const hi = Math.max(lo, middle(latest.map(r => Math.max(r.level_lo!, r.level_hi!))));
    lines.push({ skill, answered: list.length, lo, hi, max, standing: standingOf(lo, hi, max) });
  }
  const share = (l: SkillLine) => (l.lo + l.hi) / 2 / l.max;
  return lines.sort((a, b) => share(a) - share(b) || a.answered - b.answered || a.skill.localeCompare(b.skill));
}

/** "steady at Level 3" · "Level 1–2, practise this" · "at the top, Level 4". */
export function skillLineText(l: SkillLine): string {
  const level = l.lo === l.hi ? `Level ${l.lo}` : `Level ${l.lo}–${l.hi}`;
  if (l.standing === 'top') return `at the top, ${level}`;
  if (l.standing === 'practise') return `${level}, practise this`;
  return `steady at ${level}`;
}
