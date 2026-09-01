import { describe, it, expect } from 'vitest';
import { analyse, classify, worstQuestions, headline, type LostPart } from './paper-analysis';

const NEW = 'run-newest';
const OLD = 'run-older';

const part = (over: Partial<LostPart> = {}): LostPart => ({
  paperId: NEW, paperName: 'tys 2022 p2', createdAt: '2026-08-30',
  question: '5', label: '(a)', lost: 2, max: 2, blank: false, why: 'something', ...over,
});

describe('classify', () => {
  it('a blank part is blank, whatever its topic', () => {
    // A sector question nobody attempted teaches nothing about sectors.
    expect(classify({ why: 'Not attempted: area of the sector = …', blank: true })).toBe('blank');
    expect(classify({ why: 'No working or answer given; use the sector formula', blank: false })).toBe('blank');
  });

  it('recognises the themes Eva actually showed', () => {
    expect(classify({ why: 'saying compound gives more interest just repeats the claim', blank: false })).toBe('explain');
    expect(classify({ why: 'Volume of a half cylinder is ½πr²h', blank: false })).toBe('shape');
    expect(classify({ why: 'Areas scale as (length)², and lengths come from the CUBE root', blank: false })).toBe('scale');
    expect(classify({ why: 'must be given as −10.52 (2 d.p.), not −10.5', blank: false })).toBe('accuracy');
    expect(classify({ why: 'Q₃ = 32, not 30, so IQR = 12', blank: false })).toBe('stats');
  });

  it('returns null rather than forcing a theme', () => {
    expect(classify({ why: 'the wheels came off entirely', blank: false })).toBeNull();
    expect(classify({ why: '', blank: false })).toBeNull();
  });
});

describe('analyse — the newest paper decides what is live', () => {
  it('a theme still in the newest paper outranks a bigger one that has stopped', () => {
    // Eva exactly: blanks are bigger in total but gone from the latest paper;
    // shape is smaller but still happening. Shape must come first.
    const parts = [
      ...Array.from({ length: 6 }, () => part({ paperId: OLD, paperName: 'older', lost: 5, blank: true, why: 'no attempt' })),
      part({ paperId: NEW, lost: 3, why: 'Volume of a half cylinder is ½πr²h' }),
    ];
    const themes = analyse(parts, NEW);
    expect(themes[0].key).toBe('shape');
    expect(themes[0].live).toBe(true);
    const blanks = themes.find(t => t.key === 'blank')!;
    expect(blanks.marks).toBeGreaterThan(themes[0].marks);   // bigger…
    expect(blanks.live).toBe(false);                          // …but finished
  });

  it('a stopped theme is still reported, never dropped', () => {
    const themes = analyse([part({ paperId: OLD, blank: true, why: 'left completely blank' })], NEW);
    expect(themes.find(t => t.key === 'blank')).toBeTruthy();
  });

  it('counts marks, occasions and papers separately', () => {
    const parts = [
      part({ paperId: NEW, lost: 1, why: 'repeats the claim' }),
      part({ paperId: OLD, paperName: 'a', lost: 1, why: 'no figures given' }),
      part({ paperId: 'run-3', paperName: 'b', lost: 2, why: 'you needed to say why' }),
    ];
    const t = analyse(parts, NEW)[0];
    expect(t.key).toBe('explain');
    expect(t.marks).toBe(4);
    expect(t.occasions).toBe(3);
    expect(t.papers).toBe(3);
    expect(t.latestMarks).toBe(1);
  });

  it('keeps a few examples as the evidence, not just a number', () => {
    const parts = Array.from({ length: 8 }, (_, i) =>
      part({ question: String(i), why: 'Areas scale as (length)² here' }));
    const t = analyse(parts, NEW)[0];
    expect(t.examples.length).toBe(3);
    expect(t.examples[0].question).toContain('Q');
  });

  it('survives an empty script', () => {
    expect(analyse([], NEW)).toEqual([]);
    expect(analyse(null as unknown as LostPart[], NEW)).toEqual([]);
  });
});

describe('worstQuestions', () => {
  it('ranks this paper’s questions by marks lost, summing parts', () => {
    const parts = [
      part({ question: '10', label: '(c)', lost: 6, max: 8 }),
      part({ question: '5', label: '(a)', lost: 2, max: 2 }),
      part({ question: '5', label: '(b)', lost: 3, max: 3 }),
      part({ paperId: OLD, question: '9', lost: 9, max: 9 }),   // other paper — excluded
    ];
    const w = worstQuestions(parts, NEW);
    expect(w[0]).toMatchObject({ question: 'Q10', lost: 6 });
    expect(w[1]).toMatchObject({ question: 'Q5', lost: 5 });
    expect(w.find(x => x.question === 'Q9')).toBeUndefined();
  });
});

describe('headline', () => {
  it('names the biggest live theme and how widely it recurs', () => {
    const themes = analyse([
      part({ paperId: NEW, lost: 4, why: 'half cylinder surface' }),
      part({ paperId: OLD, paperName: 'x', lost: 3, why: 'sector arc left out' }),
    ], NEW);
    const h = headline(themes, 60, 90);
    expect(h).toContain('60/90');
    expect(h).toContain('67%');
    expect(h).toContain('2 papers');
  });

  it('says so honestly when nothing repeats', () => {
    expect(headline([], 80, 90)).toMatch(/scattered/);
  });
});
