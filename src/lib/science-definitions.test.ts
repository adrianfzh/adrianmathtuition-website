import { describe, expect, it } from 'vitest';
import { DEFINITIONS, DEFINITION_TOPICS, groupByTopic, searchDefinitions, splitBold } from './science-definitions';

describe('the definitions list', () => {
  it('every definition sits under a listed topic, with a unique id', () => {
    const ids = new Set<string>();
    for (const x of DEFINITIONS) {
      expect(DEFINITION_TOPICS, x.term).toContain(x.topic);
      expect(ids.has(x.id), x.id).toBe(false);
      ids.add(x.id);
    }
    expect(groupByTopic(DEFINITIONS).map(g => g.topic)).toEqual([...DEFINITION_TOPICS]);
  });

  it('every definition marks its key words, and every ** is closed', () => {
    for (const x of DEFINITIONS) {
      expect((x.text.match(/\*\*/g) ?? []).length % 2, x.term).toBe(0);
      expect(splitBold(x.text).some(r => r.bold), x.term).toBe(true);
    }
  });
});

describe('splitBold', () => {
  it('splits a line into plain and bold runs', () => {
    expect(splitBold('The **rate of change** of velocity.')).toEqual([
      { text: 'The ', bold: false }, { text: 'rate of change', bold: true }, { text: ' of velocity.', bold: false },
    ]);
  });
  it('an unclosed marker stays as text', () => {
    expect(splitBold('a **b')).toEqual([{ text: 'a **b', bold: false }]);
    expect(splitBold('')).toEqual([]);
  });
});

describe('searchDefinitions', () => {
  it('finds by term, by a word in the definition, and by topic', () => {
    expect(searchDefinitions('half-life').map(x => x.term)).toEqual(['Half-life']);
    expect(searchDefinitions('perpendicular pivot').map(x => x.term)).toContain('Moment of a force');
    expect(searchDefinitions('radioactivity').length).toBeGreaterThan(5);
    expect(searchDefinitions("newton's").length).toBe(3);
    expect(searchDefinitions('newton’s').length).toBe(3);
  });
  it('an empty query returns everything; nonsense returns nothing', () => {
    expect(searchDefinitions('  ').length).toBe(DEFINITIONS.length);
    expect(searchDefinitions('zzzz')).toEqual([]);
  });
});
