import { describe, it, expect } from 'vitest';
import { ensureAnswerLine, skillNotesBySubgroup, type SkillNoteRow } from './notes-skill';

const row = (p: Partial<SkillNoteRow>): SkillNoteRow => ({
  subgroup_id: 1,
  content_kind: 'skill_idea',
  card_title: null,
  content: 'x',
  order_index: 0,
  ...p,
});

describe('skillNotesBySubgroup', () => {
  it('files the idea, its intro and the mistake under their skill', () => {
    const m = skillNotesBySubgroup([
      row({ content_kind: 'skill_mistake', content: 'Forgetting the sign.' }),
      row({ card_title: 'Read off the turning point.', content: '$(h, k)$' }),
      row({ subgroup_id: 2, content: 'Other skill.' }),
    ]);
    expect(m.get(1)).toEqual({
      intro: 'Read off the turning point.',
      idea: '$(h, k)$',
      mistake: 'Forgetting the sign.',
    });
    expect(m.get(2)?.idea).toBe('Other skill.');
    expect(m.get(2)?.mistake).toBeNull();
  });

  it('joins a second row of the same kind in order instead of dropping it', () => {
    const m = skillNotesBySubgroup([
      row({ content: 'second', order_index: 2 }),
      row({ content: 'first', order_index: 1, card_title: 'Intro' }),
    ]);
    expect(m.get(1)?.idea).toBe('first\n\nsecond');
    expect(m.get(1)?.intro).toBe('Intro');
  });

  it('ignores rows with no skill, no content or another kind', () => {
    const m = skillNotesBySubgroup([
      row({ subgroup_id: null }),
      row({ content: '   ' }),
      row({ content_kind: 'worked_example' }),
    ]);
    expect(m.size).toBe(0);
  });
});

describe('ensureAnswerLine', () => {
  it('turns a closing boxed result into a bold Answer line', () => {
    const md = 'Working.\n\n$$\\boxed{-6 < k < 6}$$\n';
    expect(ensureAnswerLine(md)).toBe('Working.\n\n**Answer:** $-6 < k < 6$\n');
  });

  it('keeps nested braces inside the box', () => {
    const md = 'W.\n\n$$\\boxed{\\tfrac{41}{16}}$$';
    expect(ensureAnswerLine(md)).toBe('W.\n\n**Answer:** $\\tfrac{41}{16}$\n');
  });

  it('leaves an example that already has an Answer line alone', () => {
    const md = 'W.\n\n**Answer:** $k = 0$\n\n$$\\boxed{k = 0}$$';
    expect(ensureAnswerLine(md)).toBe(md);
  });

  it('leaves a box that is not the last block alone', () => {
    const md = '$$\\boxed{x = 2}$$\n\nThen more working.';
    expect(ensureAnswerLine(md)).toBe(md);
  });

  it('leaves a block where the box does not span the whole line alone', () => {
    const md = 'W.\n\n$$\\boxed{a} + \\boxed{b}$$';
    expect(ensureAnswerLine(md)).toBe(md);
  });
});
