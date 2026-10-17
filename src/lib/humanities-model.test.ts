import { describe, it, expect } from 'vitest';
import { parseModel, modelPrompt, isTop } from './humanities-model';

describe('parseModel', () => {
  it('splits the student\'s words from the added pieces', () => {
    const r = parseModel('Both sources say the rules made centres cleaner. [[+ However, they differ: Source A says stallholders welcome the rules, while Source B says they should be more flexible for elderly diners. +]] So they are mostly similar.')!;
    expect(r.segments.filter(s => s.text.trim()).map(s => s.added)).toEqual([false, true, false]);
    expect(r.segments.find(s => s.added)!.text).toMatch(/^However/);
    expect(r.text).not.toContain('[[+');
    expect(r.text).toContain('cleaner. However');
  });
  it('keeps the paragraph breaks between added points', () => {
    const r = parseModel('Both say it is cleaner, quoting each source in full here.\n\n[[+ However, Source B wants the rules changed for elderly diners. +]]\n\n[[+ Overall they are only partly similar. +]]')!;
    expect(r.text).toContain('\n\nHowever');
    expect(r.text).toContain('diners.\n\nOverall');
    expect(r.segments.filter(s => s.added).every(s => s.text === s.text.trim())).toBe(true);
  });
  it('refuses an empty or a too-short reply', () => {
    expect(parseModel('')).toBeNull();
    expect(parseModel('[[+ Yes. +]]')).toBeNull();
  });
});

describe('modelPrompt', () => {
  it('carries the student\'s answer, the scheme and the marker\'s advice', () => {
    const p = modelPrompt({ answer: 'My answer.', question: 'How similar?', subject: 'Social Studies', scheme: { levels: [{ level: 4, does: 'Compares tone' }] } }, { lift: 'Add a difference.', gap: ['A quote from both sources'] });
    expect(p).toContain("THE STUDENT'S ANSWER\nMy answer.");
    expect(p).toContain('Level 4: Compares tone');
    expect(p).toContain('WHAT THE MARKER SAID TO ADD: Add a difference.');
    expect(p).toContain('[[+');
  });
});

describe('isTop', () => {
  it('only the top of the scale', () => {
    expect(isTop(4, 4)).toBe(true);
    expect(isTop(3, 4)).toBe(false);
    expect(isTop(null, 4)).toBe(false);
  });
});
