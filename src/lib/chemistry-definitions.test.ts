import { describe, expect, it } from 'vitest';
import { CHEMISTRY_DEFINITIONS, CHEMISTRY_TOPICS } from './chemistry-definitions';
import { groupByTopic, searchDefinitions, splitBold } from './science-definitions';

describe('the Chemistry definitions list', () => {
  it('every definition sits under a listed topic, with a unique id, and no topic is empty', () => {
    const ids = new Set<string>();
    for (const x of CHEMISTRY_DEFINITIONS) {
      expect(CHEMISTRY_TOPICS, x.term).toContain(x.topic);
      expect(ids.has(x.id), x.id).toBe(false);
      ids.add(x.id);
    }
    expect(groupByTopic(CHEMISTRY_DEFINITIONS, CHEMISTRY_TOPICS).map(g => g.topic)).toEqual([...CHEMISTRY_TOPICS]);
  });

  it('every definition marks its key words, and every ** is closed', () => {
    for (const x of CHEMISTRY_DEFINITIONS) {
      expect((x.text.match(/\*\*/g) ?? []).length % 2, x.term).toBe(0);
      expect(splitBold(x.text).some(r => r.bold), x.term).toBe(true);
    }
  });

  it('carries the terms Adrian asked for', () => {
    const terms = CHEMISTRY_DEFINITIONS.map(x => x.term.toLowerCase());
    for (const t of ['isotopes', 'alloy', 'strong acid', 'weak acid', 'acid', 'alkali', 'base', 'the mole', 'proton number',
      'nucleon number', 'homologous series', 'isomers', 'allotropes', 'saturated', 'unsaturated', 'hydrocarbon', 'polymer',
      'diatomic', 'amphoteric oxide', 'neutralisation', 'electrolysis', 'oxidation', 'reduction', 'catalyst', 'greenhouse gas']) {
      expect(terms, t).toContain(t);
    }
    expect(terms.some(t => t.startsWith('relative atomic mass'))).toBe(true);
    expect(terms.some(t => t.startsWith('relative molecular mass'))).toBe(true);
    expect(terms).toContain('relative formula mass');
    expect(terms.some(t => t.startsWith('exothermic'))).toBe(true);
    expect(terms.some(t => t.startsWith('endothermic'))).toBe(true);
  });

  it('search finds by term and by a word in the definition', () => {
    expect(searchDefinitions('isomers', CHEMISTRY_DEFINITIONS).map(x => x.term)).toEqual(['Isomers']);
    expect(searchDefinitions('ionises', CHEMISTRY_DEFINITIONS).map(x => x.term)).toEqual(['Strong acid', 'Weak acid']);
  });
});
