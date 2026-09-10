import { describe, expect, it } from 'vitest';
import { MAX_TITLE, cleanTitle, groupSavesByTopic, nearestAskSkill, saveTitleFrom, type SaveRow } from './notebook-saves';

describe('saveTitleFrom', () => {
  it('takes the question\'s first real line, stripped of maths and markdown', () => {
    expect(saveTitleFrom('**Prove** that $\\sin^2 x + \\cos^2 x = 1$ for all x\nmore', 'Sure!')).toBe('Prove that for all x');
  });
  it('falls back to the answer, then to a plain label, and clips long titles on a word', () => {
    expect(saveTitleFrom('', 'Use the R-formula: write it as R sin(x + a)')).toBe('Use the R-formula: write it as R sin(x + a)');
    expect(saveTitleFrom(null, null)).toBe('Saved answer');
    // a photo question stores '[image]' as its text — the title comes from the answer instead
    expect(saveTitleFrom('[image]', 'Differentiate $y = \\sin 2x$ using the chain rule')).toBe('Differentiate using the chain rule');
    const long = saveTitleFrom('word '.repeat(40), '');
    expect(long.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('cleanTitle', () => {
  it('trims and clips; blank means keep the old one', () => {
    expect(cleanTitle('  R-formula   trick ')).toBe('R-formula trick');
    expect(cleanTitle('   ')).toBeNull();
    expect(cleanTitle(42)).toBeNull();
    expect(cleanTitle('x'.repeat(200))!.length).toBe(MAX_TITLE);
  });
});

describe('nearestAskSkill', () => {
  const rows = [
    { skill: 'far', asked_at: '2026-09-11T00:00:00Z' },
    { skill: 'near', asked_at: '2026-09-11T00:20:00Z' },
    { skill: 'nearer', asked_at: '2026-09-11T00:24:00Z' },
  ];
  it('picks the closest row inside the window', () => {
    expect(nearestAskSkill(rows, '2026-09-11T00:25:00Z')?.skill).toBe('nearer');
    expect(nearestAskSkill(rows, '2026-09-11T00:17:00Z')?.skill).toBe('near');
  });
  it('returns null when nothing is within the window or the time is bad', () => {
    expect(nearestAskSkill(rows, '2026-09-11T03:00:00Z')).toBeNull();
    expect(nearestAskSkill(rows, 'yesterday')).toBeNull();
    expect(nearestAskSkill([], '2026-09-11T00:25:00Z')).toBeNull();
  });
});

describe('groupSavesByTopic', () => {
  const row = (id: string, topic: string | null, created_at: string): SaveRow => ({
    id, kind: 'ask', source: id, question_text: null, answer_text: 'a', image_url: null, title: id, topic, skill: null, created_at,
  });
  it('groups by topic, newest topic first, untagged last as Other', () => {
    const groups = groupSavesByTopic([
      row('a', 'Vectors', '2026-09-01T00:00:00Z'),
      row('b', null, '2026-09-10T00:00:00Z'),
      row('c', 'Logarithms', '2026-09-05T00:00:00Z'),
      row('d', 'Vectors', '2026-09-09T00:00:00Z'),
    ]);
    expect(groups.map(g => g.topic)).toEqual(['Vectors', 'Logarithms', 'Other']);
    expect(groups[0].saves.map(s => s.id)).toEqual(['d', 'a']);
  });
});
