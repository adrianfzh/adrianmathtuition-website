import { describe, it, expect } from 'vitest';
import { starredFirst } from './paper-star';

describe('starredFirst', () => {
  it('lifts starred papers to the top and keeps the order inside each group', () => {
    const papers: { id: string; starred?: boolean }[] = [{ id: 'a' }, { id: 'b', starred: true }, { id: 'c' }, { id: 'd', starred: true }];
    const out = starredFirst(papers);
    expect(out.map(p => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('is the identity when nothing is starred', () => {
    const papers: { id: string; starred?: boolean }[] = [{ id: 'a' }, { id: 'b' }];
    expect(starredFirst(papers).map(p => p.id)).toEqual(['a', 'b']);
  });
});
