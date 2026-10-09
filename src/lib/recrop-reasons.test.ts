import { describe, it, expect } from 'vitest';
import { RECROP_REASONS, cleanRecropReasons, recropRejectWhy } from './recrop-reasons';

describe('re-crop reject reasons', () => {
  it('keeps only listed reasons, once each, in list order', () => {
    expect(cleanRecropReasons(['wrong picture', 'made up', 'part cut off', 'part cut off'])).toEqual(['part cut off', 'wrong picture']);
    expect(cleanRecropReasons('part cut off')).toEqual([]);
    expect(cleanRecropReasons(undefined)).toEqual([]);
  });
  it('writes his reasons before what the cutter said', () => {
    expect(recropRejectWhy(['part cut off'], 'passed every check')).toBe('Adrian: part cut off — passed every check');
    expect(recropRejectWhy(['part cut off', 'wrong picture'], null)).toBe('Adrian: part cut off; wrong picture');
  });
  it('a redraw can be asked for', () => {
    expect(cleanRecropReasons(['please redraw'])).toEqual(['please redraw']);
  });
  it('no reason leaves the row as it was, and a second reject does not stack', () => {
    expect(recropRejectWhy([], 'x')).toBeNull();
    expect(recropRejectWhy([RECROP_REASONS[0]], 'Adrian: wrong picture — old')).toBe('Adrian: part cut off');
  });
});
