import { describe, it, expect } from 'vitest';
import { mustSayItems, precheck, mustSayFindings } from './must-say.mjs';

const lesson = { scenes: [{ beats: [
  { say: 'Sine N T always lies between negative one and one.', do: [] },
  { say: 'So the highest point is A.', do: [{ do: 'note', text: 'Chain rule' }] },
] }] };

describe('must-say list', () => {
  it('a plan without the list has nothing to check (every clip before 4 Nov 2026)', () => {
    expect(mustSayItems({})).toEqual([]);
    expect(mustSayItems({ mustSay: [] })).toEqual([]);
    expect(mustSayFindings([], undefined)).toEqual([]);
  });
  it('takes a bare string or { say, keys }', () => {
    expect(mustSayItems({ mustSay: ['A', { say: 'B', keys: ['x'] }, { say: ' ' }] })).toEqual([{ say: 'A', keys: [] }, { say: 'B', keys: ['x'] }]);
  });
  it('the pre-check finds spoken key words in the voice and the notes, ignoring case and commas', () => {
    const items = mustSayItems({ mustSay: [{ say: 'property', keys: ['between negative one and one', 'chain rule'] }, { say: 'trap', keys: ['never touches'] }] });
    const p = precheck(items, lesson);
    expect(p[0].missing).toEqual([]);
    expect(p[1].missing).toEqual(['never touches']);
  });
  it('an item judged not said, or not judged at all, is a must that names it', () => {
    const items = mustSayItems({ mustSay: ['one', 'two', 'three'] });
    const f = mustSayFindings(items, [{ item: 1, said: true }, { item: 2, said: false, beat: 5, why: 'only on the board' }]);
    expect(f.map(x => [x.severity, x.rule, x.beat])).toEqual([['must', 'must say', 5], ['must', 'must say', 0]]);
    expect(f[0].problem).toContain('"two"');
    expect(f[1].problem).toContain('did not judge');
  });
});
