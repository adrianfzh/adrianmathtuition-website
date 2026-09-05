import { describe, it, expect } from 'vitest';
import { analyse, classify, worstQuestions, headline, topicLabel, type LostPart } from './paper-analysis';

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

describe('topicLabel — the marker\'s topic, cut to fit beside a bar', () => {
  it('keeps the first clause: the syllabus topic, not the sub-skill list', () => {
    expect(topicLabel('Surds; sum and product of roots of a quadratic')).toBe('Surds');
    expect(topicLabel('Differentiation — maxima and minima')).toBe('Differentiation');
    expect(topicLabel('Integration (area under a curve)')).toBe('Integration');
    expect(topicLabel('Trigonometry: R-formula')).toBe('Trigonometry');
    expect(topicLabel('Indices / logarithms')).toBe('Indices');
  });
  it('caps a long first clause on a word boundary so a row never wraps', () => {
    const l = topicLabel('Coordinate geometry of circles and their tangents in the plane');
    expect(l.length).toBeLessThanOrEqual(35);
    expect(l.endsWith('…')).toBe(true);
    expect(l).not.toMatch(/\s…$/);
  });
  it('is empty for nothing, and never throws on junk', () => {
    expect(topicLabel(undefined)).toBe('');
    expect(topicLabel('   ')).toBe('');
    expect(topicLabel(42)).toBe('42');
  });
});

describe('worstQuestions carries the topic', () => {
  it('names each question with the marker\'s topic, shortened, once per question', () => {
    const parts = [
      part({ question: '9', label: '(a)', lost: 1, max: 3, topic: 'Differentiation — maxima and minima' }),
      part({ question: '9', label: '(b)', lost: 2, max: 2, topic: 'Differentiation — maxima and minima' }),
      part({ question: '3', label: '', lost: 1, max: 5 }),                      // pre-field run: no topic
    ];
    const w = worstQuestions(parts, NEW);
    expect(w[0]).toMatchObject({ question: 'Q9', lost: 3, topic: 'Differentiation' });
    expect(w[1]).toMatchObject({ question: 'Q3', lost: 1, topic: '' });
  });
});

describe('headline', () => {
  it('names the biggest live theme and what it cost on this paper — never "across N papers"', () => {
    const themes = analyse([
      part({ paperId: NEW, lost: 4, why: 'half cylinder surface' }),
      part({ paperId: NEW, question: '7', lost: 3, why: 'sector arc left out' }),
    ], NEW);
    const h = headline(themes, 60, 90);
    expect(h).toContain('60/90');
    expect(h).toContain('67%');
    expect(h).toContain('7 marks on this paper');
    expect(h).not.toMatch(/across|\d+ papers/);
  });

  it('says so honestly when nothing repeats', () => {
    expect(headline([], 80, 90)).toMatch(/scattered/);
  });
});


describe('analyse — the marker\'s topic is the theme (Adrian, 5 Sep 2026: "the topics are not correct")', () => {
  const part = (over: Partial<import('./paper-analysis').LostPart>): import('./paper-analysis').LostPart => ({
    paperId: 'p1', paperName: 'TYS 2021 P1', createdAt: '2026-09-03', question: '8', label: '(b)', lost: 1, max: 4, blank: false, why: '', ...over,
  });
  it('a stationary-point note that mentions tangents is Differentiation, not Circle properties', () => {
    const themes = analyse([
      part({ why: 'your tangent sketches are drawn the wrong way round; A = 1600 is a minimum', topic: 'Differentiation — stationary points' }),
      part({ question: '14', label: '(b)', lost: 2, max: 5, why: 'the triangle base is 5½ − 4, giving 3 units²', topic: 'Differentiation and integration — normals and area' }),
    ], 'p1');
    expect(themes.map(t => t.title)).toEqual(['Differentiation and integration', 'Differentiation']);
    expect(themes.map(t => t.title)).not.toContain('Circle properties');
    expect(themes.map(t => t.title)).not.toContain('Writing the answer the way the question asked');
  });
  it('parts of one topic add up under one theme, and a blank part keeps its own habit theme', () => {
    const themes = analyse([
      part({ question: '5', label: '', lost: 3, max: 6, why: 'substituted −3/2', topic: 'Partial fractions' }),
      part({ question: '9', label: '(c)', lost: 1, max: 2, why: 'sign inside the bracket', topic: 'Partial fractions; something else' }),
      part({ question: '10', label: '(a)', lost: 4, max: 4, why: '', blank: true, topic: 'Trigonometric identities' }),
    ], 'p1');
    expect(themes.map(t => [t.title, t.marks])).toEqual([['Partial fractions', 4], ['Questions you left blank', 4]]);
  });
  it('a run without topics still falls back to the keyword classifier', () => {
    const themes = analyse([part({ why: 'wrong number of significant figures on the answer line', lost: 1 })], 'p1');
    expect(themes[0].title).toBe('Writing the answer the way the question asked');
  });
});
