import { describe, expect, it } from 'vitest';
import { addedLine, changeRequest, groupRules, lines, sgtDay, type ExtractionRule } from './extraction-rules';

const base: ExtractionRule = {
  slug: 'xr-a', type: 'rule', kind: 'filing', status: 'active', title: 'A', plain_words: 'p', law_text: null, law_section: null,
  why: null, proposal: null, evidence: [], requeue_ids: [], source: 'existing', added_at: '2026-10-01T04:00:00Z', decided_at: null, replaced_by: null, note: null,
};
const r = (o: Partial<ExtractionRule>): ExtractionRule => ({ ...base, ...o });

describe('groupRules', () => {
  it('puts waiting rules first, splits filing / worker / spellings, folds the old ones', () => {
    const g = groupRules([
      r({ slug: 'xr-f1', added_at: '2026-09-01T00:00:00Z' }),
      r({ slug: 'xr-f2', added_at: '2026-10-01T00:00:00Z' }),
      r({ slug: 'xr-w', kind: 'safe' }),
      r({ slug: 'xr-s2', type: 'alias', kind: 'safe', title: 'Spellings of one school: Z' }),
      r({ slug: 'xr-s1', type: 'alias', kind: 'safe', title: 'Spellings of one school: A' }),
      r({ slug: 'xr-p', status: 'proposed' }),
      r({ slug: 'xr-rd', status: 'redraft' }),
      r({ slug: 'xr-old', status: 'retired' }),
      r({ slug: 'xr-drop', status: 'dropped' }),
    ]);
    expect(g.waiting.map(x => x.slug).sort()).toEqual(['xr-p', 'xr-rd']);
    expect(g.filing.map(x => x.slug)).toEqual(['xr-f2', 'xr-f1']);
    expect(g.worker.map(x => x.slug)).toEqual(['xr-w']);
    expect(g.spellings.map(x => x.slug)).toEqual(['xr-s1', 'xr-s2']);
    expect(g.old.map(x => x.slug).sort()).toEqual(['xr-drop', 'xr-old']);
  });
});

describe('words', () => {
  it('dates in Singapore time', () => {
    expect(sgtDay('2026-10-04T17:00:00Z')).toBe('5 Oct 2026');
    expect(sgtDay(null)).toBe('');
  });
  it('says when and where a rule came from', () => {
    expect(addedLine(r({ source: 'adrian-ruling', added_at: '2026-10-03T04:00:00Z' }))).toBe('added 3 Oct 2026 · your ruling');
    expect(addedLine(r({ status: 'retired', replaced_by: 'xr-b' }))).toContain('replaced by xr-b');
    expect(addedLine(r({ status: 'redraft' }))).toContain('being rewritten');
  });
  it('the change request is a sentence to finish', () => {
    expect(changeRequest({ slug: 'xr-x' })).toBe('Change rule xr-x: ');
  });
  it('one idea a line', () => {
    expect(lines('a\n\n b \nc')).toEqual(['a', 'b', 'c']);
    expect(lines(null)).toEqual([]);
  });
});
