import { describe, it, expect } from 'vitest';
import { sanitizeProposal, nudgeMessage, MIN_QUESTION_CHARS } from './question-proposals';

const ok = {
  level: 'AM',
  topics: ['Binomial Expansion'],
  questionText: 'Given that there is no term independent of $x$ in the expansion of $(5 + ax^2)(3 - 2/x)^5$, find $a$.',
  answer: '$a = -1.125$',
  searchQuery: 'coefficient from pairing two powers in a product',
  marks: 5,
};

describe('sanitizeProposal', () => {
  it('accepts a complete proposal', () => {
    const r = sanitizeProposal(ok);
    expect('row' in r).toBe(true);
    if ('row' in r) {
      expect(r.row.level).toBe('AM');
      expect(r.row.topics).toEqual(['Binomial Expansion']);
      expect(r.row.marks).toBe(5);
    }
  });

  it('demands the failed search — authoring without looking is the bug it fixes', () => {
    const r = sanitizeProposal({ ...ok, searchQuery: undefined });
    expect('error' in r && r.error).toMatch(/searchQuery is required/);
  });

  it('rejects a fragment too short to vet', () => {
    const r = sanitizeProposal({ ...ok, questionText: 'Find k.' });
    expect('error' in r && r.error).toMatch(new RegExp(`${MIN_QUESTION_CHARS}`));
  });

  it('requires a level and a question', () => {
    expect('error' in sanitizeProposal({ ...ok, level: '  ' })).toBe(true);
    expect('error' in sanitizeProposal({ ...ok, questionText: '' })).toBe(true);
  });

  it('accepts snake_case as well as camelCase — the worker composes JSON by hand', () => {
    const r = sanitizeProposal({
      level: 'AM', question_text: ok.questionText, search_query: 'x', topics: [],
    });
    expect('row' in r).toBe(true);
  });

  it('drops a malformed uuid rather than failing the whole proposal', () => {
    const r = sanitizeProposal({ ...ok, runId: 'not-a-uuid', sheetJobId: 'f0d82c18-7538-4bdb-bcc2-99096667cc2f' });
    if (!('row' in r)) throw new Error('should have accepted');
    expect(r.row.run_id).toBeNull();
    expect(r.row.sheet_job_id).toBe('f0d82c18-7538-4bdb-bcc2-99096667cc2f');
  });

  it('only takes a sane mark allocation', () => {
    for (const [m, want] of [[5, 5], [0, null], [-2, null], [99, null], ['x', null], [2.5, null]] as const) {
      const r = sanitizeProposal({ ...ok, marks: m });
      if (!('row' in r)) throw new Error('should have accepted');
      expect(r.row.marks).toBe(want);
    }
  });

  it('caps topics and trims blanks', () => {
    const r = sanitizeProposal({ ...ok, topics: ['  A ', '', '   ', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] });
    if (!('row' in r)) throw new Error('should have accepted');
    expect(r.row.topics.length).toBeLessThanOrEqual(8);
    expect(r.row.topics[0]).toBe('A');
  });

  it('keeps the search hits as evidence, capped', () => {
    const hits = Array.from({ length: 40 }, (_, i) => ({ id: i }));
    const r = sanitizeProposal({ ...ok, searchHits: hits });
    if (!('row' in r)) throw new Error('should have accepted');
    expect((r.row.search_hits as unknown[]).length).toBe(20);
  });

  it('never throws on junk', () => {
    for (const bad of [null, undefined, 42, 'x', [], { level: 1, questionText: {} }]) {
      expect(() => sanitizeProposal(bad)).not.toThrow();
      expect('error' in sanitizeProposal(bad)).toBe(true);
    }
  });
});

describe('nudgeMessage — weekly, and silent unless there is something to act on', () => {
  const NOW = Date.parse('2026-09-08T01:00:00Z');
  const aged = (days: number) => new Date(NOW - days * 86400_000).toISOString();
  const row = (over: Partial<Parameters<typeof nudgeMessage>[0][number]> = {}) => ({
    level: 'AM', topics: ['Differentiation (Stationary Points)'],
    skill: 'two stationary points ⇔ discriminant > 0', student_name: 'Kiara',
    created_at: aged(5), ...over,
  });

  it('says nothing when the queue is empty', () => {
    expect(nudgeMessage([], NOW)).toBeNull();
  });

  it('says nothing while everything is still fresh — that is "not got to yet"', () => {
    expect(nudgeMessage([row({ created_at: aged(1) }), row({ created_at: aged(2) })], NOW)).toBeNull();
  });

  it('nudges once something has waited long enough', () => {
    const m = nudgeMessage([row()], NOW);
    expect(m).toContain('1 question');
    expect(m).toContain('waited 5 days');
  });

  it('counts only the ripe ones, not the whole queue', () => {
    const m = nudgeMessage([row(), row(), row({ created_at: aged(0) })], NOW);
    expect(m).toContain('2 questions');
  });

  it('names what is waiting, so the notification alone is actionable', () => {
    expect(nudgeMessage([row()], NOW)).toContain('Differentiation (Stationary Points)');
    expect(nudgeMessage([row()], NOW)).toContain('discriminant');
  });

  it('falls back to the level when a proposal carries no topic', () => {
    expect(nudgeMessage([row({ topics: [] })], NOW)).toContain('AM');
    expect(nudgeMessage([row({ topics: null })], NOW)).toContain('AM');
  });

  it('caps the list and says how many more', () => {
    const m = nudgeMessage(Array.from({ length: 9 }, () => row()), NOW)!;
    expect((m.match(/^• /gm) || []).length).toBe(6);
    expect(m).toContain('and 3 more');
  });

  it('escapes HTML — a topic with an ampersand must not break the message', () => {
    const m = nudgeMessage([row({ skill: 'a < b & c' })], NOW)!;
    expect(m).toContain('&lt; b &amp; c');
  });

  it('ignores a row with an unparseable date rather than throwing', () => {
    expect(() => nudgeMessage([row({ created_at: 'nonsense' })], NOW)).not.toThrow();
    expect(nudgeMessage([row({ created_at: 'nonsense' })], NOW)).toBeNull();
  });

  it('singular and plural both read correctly', () => {
    expect(nudgeMessage([row({ created_at: aged(3) })], NOW)).toContain('waited 3 days');
    expect(nudgeMessage([row()], NOW)).toContain('<b>1 question</b> waiting');
    expect(nudgeMessage([row(), row()], NOW)).toContain('2 questions');
  });
});
