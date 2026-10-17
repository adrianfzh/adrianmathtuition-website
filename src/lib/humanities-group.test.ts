import { describe, it, expect } from 'vitest';
import { partScore } from './humanities-group';

const r = (o: Record<string, unknown>) => ({ status: 'marked', skill: 'comparison', level: 3, levels_max: 4, report_mark: null, own_marks: 6, own_title: null, ...o }) as Parameters<typeof partScore>[0];

describe('partScore', () => {
  it('a Geography short part: its marks', () => {
    expect(partScore(r({ skill: 'geo_explain', level: 3, levels_max: 4, own_marks: 4 }))).toEqual({ got: 3, outOf: 4 });
  });
  it('a level one mark wide: that mark; a wider level: the exact mark once back', () => {
    expect(partScore(r({}))).toEqual({ got: 5, outOf: 6 });
    expect(partScore(r({ skill: 'sr_explain', level: 3, own_marks: 7 }))).toEqual({ got: null, outOf: 7 });
    expect(partScore(r({ skill: 'sr_explain', level: 3, own_marks: 7, report_mark: 6 }))).toEqual({ got: 6, outOf: 7 });
  });
  it('not marked yet: nothing', () => {
    expect(partScore(r({ status: 'marking' }))).toEqual({ got: null, outOf: null });
  });
});
