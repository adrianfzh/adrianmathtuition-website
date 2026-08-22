import { describe, it, expect } from 'vitest';
import { familyOf, variantOf, strandsFor, strandKey, groupTopics, topicMatches } from './practice-strands';

describe('familyOf / variantOf', () => {
  it('splits "Family (Variant)"', () => {
    expect(familyOf('Differentiation (Techniques)')).toBe('Differentiation');
    expect(variantOf('Differentiation (Techniques)')).toBe('Techniques');
  });
  it('leaves bare topics alone', () => {
    expect(familyOf('Circles')).toBe('Circles');
    expect(variantOf('Circles')).toBeNull();
    expect(familyOf("Pythagoras' Theorem")).toBe("Pythagoras' Theorem");
  });
  it('keeps inner brackets inside the variant', () => {
    expect(variantOf('Algebra (Graph on Graph Paper)')).toBe('Graph on Graph Paper');
  });
});

describe('strands', () => {
  const AM = ['Binomial Theorem', 'Circles', 'Differentiation (Techniques)', 'Integration (Area)', 'Trigonometry (Identities)', 'Surds'];
  it('maps A Math families to Algebra / Geometry & Trig / Calculus', () => {
    expect(strandKey('AM', 'Surds')).toBe('algebra');
    expect(strandKey('AM', 'Trigonometry (Identities)')).toBe('geometry');
    expect(strandKey('AM', 'Integration (Area)')).toBe('calculus');
  });
  it('only offers chips that have topics, in syllabus order', () => {
    expect(strandsFor('AM', AM).map(s => s.key)).toEqual(['algebra', 'geometry', 'calculus']);
    expect(strandsFor('AM', ['Surds', 'Indices']).map(s => s.key)).toEqual([]); // single chip = no filter
  });
  it('unknown families land in Other and unknown levels have no chips', () => {
    expect(strandKey('AM', 'Brand New Topic')).toBe('other');
    expect(strandsFor('AM', [...AM, 'Brand New Topic']).map(s => s.key)).toContain('other');
    expect(strandsFor('EM_NA', ['Algebra (Fractions)', 'Angles'])).toEqual([]);
  });
  it('E Math and lower sec share the MOE strands', () => {
    expect(strandKey('EM', 'Numbers (Ratio)')).toBe('number');
    expect(strandKey('S1', 'Mensuration')).toBe('geometry');
    expect(strandKey('S2', 'Probability')).toBe('stats');
    expect(strandKey('JC', 'Distributions (Normal)')).toBe('stats');
  });
});

describe('groupTopics', () => {
  const rows = [
    { topic: 'Circles', questionCount: 10 },
    { topic: 'Differentiation (Techniques)', questionCount: 5 },
    { topic: 'Differentiation (Rates of Change)', questionCount: 7 },
    { topic: 'Surds', questionCount: 3 },
  ];
  it('folds variants under their family and sums counts', () => {
    const g = groupTopics(rows);
    expect(g.map(x => x.family)).toEqual(['Circles', 'Differentiation', 'Surds']);
    const diff = g[1];
    expect(diff.topics.map(t => t.variant)).toEqual(['Techniques', 'Rates of Change']);
    expect(diff.total).toBe(12);
    expect(g[0].topics).toHaveLength(1);
    expect(g[0].topics[0].row).toBe(rows[0]);
  });
});

describe('topicMatches', () => {
  it('matches the topic or any question-type name, case-insensitively', () => {
    expect(topicMatches('Circles', ['Tangent at a Point on the Circle'], 'tangent')).toBe(true);
    expect(topicMatches('Circles', [], 'circ')).toBe(true);
    expect(topicMatches('Circles', ['Chords'], 'surds')).toBe(false);
    expect(topicMatches('Circles', [], '   ')).toBe(true);
  });
});
