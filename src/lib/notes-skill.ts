// ── Notes portal: the fixed order inside one skill ───────────────────────────
//
// Adrian, 15 Oct 2026 ("okay go ahead" to organising the notes): every skill on
// a topic page reads the same way —
//
//   1. Key idea     — the formula / rule, one line each   (content_kind 'skill_idea')
//   2. Worked examples, easiest first, each ending **Answer:** ('worked_example')
//   3. Common mistake                                      ('skill_mistake')
//
// The idea and the mistake are ordinary `content_snippets` rows filed under the
// skill's `subgroup_id`, so the content lives in one place and the /revise swipe
// decks (which read only 'worked_example' / 'recall_card') never see them. The
// idea row's `card_title` is the one-line "what this skill is" shown under the
// heading — it replaces the sub-group `description`, which was written for the
// question filer, not for a student. Rules: SPEC-NOTES-PORTAL.md §Skill layout.
//
// Pure — see notes-skill.test.ts.

export const SKILL_IDEA_KIND = 'skill_idea';
export const SKILL_MISTAKE_KIND = 'skill_mistake';
export const SKILL_NOTE_KINDS = [SKILL_IDEA_KIND, SKILL_MISTAKE_KIND] as const;

export interface SkillNoteRow {
  subgroup_id: number | null;
  content_kind: string;
  card_title: string | null;
  content: string;
  order_index: number | null;
}

export interface SkillNotes {
  /** One plain sentence: what this skill is. Null when not written yet. */
  intro: string | null;
  /** The key idea, markdown + TeX. */
  idea: string | null;
  /** The common mistake, markdown + TeX. */
  mistake: string | null;
}

export const NO_SKILL_NOTES: SkillNotes = { intro: null, idea: null, mistake: null };

/** Group skill-note rows by sub-group. A second row of the same kind is
 *  appended (lowest order_index first) rather than silently dropped. */
export function skillNotesBySubgroup(rows: SkillNoteRow[]): Map<number, SkillNotes> {
  const sorted = [...rows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const out = new Map<number, SkillNotes>();
  for (const r of sorted) {
    if (r.subgroup_id == null || !r.content.trim()) continue;
    const cur = out.get(r.subgroup_id) ?? { ...NO_SKILL_NOTES };
    const join = (a: string | null, b: string) => (a ? `${a}\n\n${b.trim()}` : b.trim());
    if (r.content_kind === SKILL_IDEA_KIND) {
      cur.idea = join(cur.idea, r.content);
      if (!cur.intro && r.card_title?.trim()) cur.intro = r.card_title.trim();
    } else if (r.content_kind === SKILL_MISTAKE_KIND) {
      cur.mistake = join(cur.mistake, r.content);
    } else continue;
    out.set(r.subgroup_id, cur);
  }
  return out;
}

/**
 * Renderer's net for older examples: the result must stand out as a bold
 * **Answer:** line (CLAUDE.md "Readability — everything"). When an example has
 * no Answer label and its LAST block is a lone display `$$\boxed{X}$$`, that
 * block becomes `**Answer:** $X$`. Anything else is left exactly as written —
 * a guess at which line is "the answer" would be worse than none.
 */
export function ensureAnswerLine(md: string): string {
  if (/\*\*\s*(final\s+)?answer\s*:?\s*\*\*/i.test(md)) return md;
  const trimmed = md.replace(/\s+$/, '');
  const m = /(^|\n\n)\$\$\s*\\boxed\{([\s\S]+)\}\s*\$\$$/.exec(trimmed);
  if (!m) return md;
  const inner = m[2].trim();
  // A nested brace imbalance means the boxed{} did not span the whole block.
  let depth = 0;
  for (const ch of inner) {
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth < 0) return md;
  }
  if (depth !== 0) return md;
  return `${trimmed.slice(0, m.index)}${m[1]}**Answer:** $${inner}$\n`;
}
