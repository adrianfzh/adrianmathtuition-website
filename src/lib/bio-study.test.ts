import { describe, expect, it } from 'vitest';
import { groupByTopic, searchDefinitions, splitBold } from './science-definitions';
import { BIOLOGY_DEFINITIONS, BIOLOGY_TOPICS } from './biology-definitions';
import { BIO_PROCESSES } from './bio-processes';
import { COMMAND_WORDS, DESCRIBE_VS_EXPLAIN, GRAPH_STEPS } from './command-words';

const closed = (s: string) => (s.match(/\*\*/g) ?? []).length % 2 === 0;
const marked = (s: string) => closed(s) && splitBold(s).some(r => r.bold);

describe('the Biology definitions list', () => {
  it('every definition sits under a listed topic, with a unique id and its key words marked', () => {
    const ids = new Set<string>();
    for (const x of BIOLOGY_DEFINITIONS) {
      expect(BIOLOGY_TOPICS, x.term).toContain(x.topic);
      expect(ids.has(x.id), x.id).toBe(false);
      ids.add(x.id);
      expect(marked(x.text), x.term).toBe(true);
    }
    expect(groupByTopic(BIOLOGY_DEFINITIONS, BIOLOGY_TOPICS).map(g => g.topic)).toEqual([...BIOLOGY_TOPICS]);
  });
  it('search works on the Biology list', () => {
    expect(searchDefinitions('osmosis', BIOLOGY_DEFINITIONS).map(x => x.term)).toContain('Osmosis');
    expect(searchDefinitions('inheritance', BIOLOGY_DEFINITIONS).length).toBeGreaterThan(8);
  });
  it('the scheme words that are easy to get wrong stay as written', () => {
    const text = (term: string) => BIOLOGY_DEFINITIONS.find(x => x.term === term)!.text;
    expect(text('Osmosis')).toMatch(/water potential/);
    expect(text('Osmosis')).toMatch(/partially permeable/);
    expect(text('Glucagon')).toMatch(/glycogen to glucose/);
    expect(text('Insulin')).toMatch(/glucose to glycogen/);
  });
});

describe('processes in pictures', () => {
  it('every process has a unique id and a chain or two branches, every step marked', () => {
    const ids = new Set<string>();
    for (const p of BIO_PROCESSES) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(Boolean(p.steps) !== Boolean(p.branches), p.id).toBe(true);
      if (p.branches) expect(p.branches.length, p.id).toBe(2);
      const steps = p.steps ?? p.branches!.flatMap(b => b.steps);
      expect(steps.length, p.id).toBeGreaterThanOrEqual(4);
      for (const s of steps) expect(marked(s), `${p.id}: ${s}`).toBe(true);
      if (p.end) expect(closed(p.end), p.id).toBe(true);
    }
  });
  it('the two branches of a loop are the same length, so the boxes line up', () => {
    for (const p of BIO_PROCESSES) if (p.branches) expect(p.branches[0].steps.length, p.id).toBe(p.branches[1].steps.length);
  });
});

describe('command words', () => {
  it('every word says what it needs and carries a worked pair', () => {
    for (const c of COMMAND_WORDS) {
      expect(marked(c.needs), c.word).toBe(true);
      expect(c.question.length && c.answer.length, c.word).toBeGreaterThan(0);
    }
    expect(new Set(COMMAND_WORDS.map(c => c.word)).size).toBe(COMMAND_WORDS.length);
    for (const s of [...GRAPH_STEPS, DESCRIBE_VS_EXPLAIN.describe, DESCRIBE_VS_EXPLAIN.explain]) expect(marked(s), s).toBe(true);
  });
});
