import { describe, it, expect } from 'vitest';
import { isRemarkInternal, remarkedCoverInput } from './remark-internal';

describe('isRemarkInternal', () => {
  it('is true only for the bot\'s explicit stamp', () => {
    expect(isRemarkInternal({ remark_internal: true })).toBe(true);
    expect(isRemarkInternal({ remark_internal: false })).toBe(false);
    expect(isRemarkInternal({ remark_internal: 'yes' })).toBe(false);
    expect(isRemarkInternal({})).toBe(false);
    expect(isRemarkInternal(null)).toBe(false);
    expect(isRemarkInternal('remark_internal')).toBe(false);
  });
});

describe('remarkedCoverInput', () => {
  const prev = [{ question_number: '1', marking: { parts: [{ label: '', awarded: 1 }] } }];

  it('badges a re-mark the student can compare against the copy they have', () => {
    const r = remarkedCoverInput(
      { previous_results: prev, previous_marked_at: '2026-09-11T13:02:57.840Z', queue: { remark_pages: [0, 2] } },
      () => 3,
    );
    expect(r).toEqual({ pages: [1, 3], at: '2026-09-11T13:02:57.840Z', changed: 3 });
  });

  it('Gavin: a re-mark of a marking he never received reads as a FIRST marking', () => {
    let walked = false;
    const r = remarkedCoverInput(
      { previous_results: prev, previous_marked_at: '2026-09-11T13:02:57.840Z', remark_internal: true },
      () => { walked = true; return 3; },
    );
    expect(r).toBeNull();
    expect(walked).toBe(false);
  });

  it('a first marking has nothing to diff against', () => {
    expect(remarkedCoverInput({}, () => 0)).toBeNull();
    expect(remarkedCoverInput({ previous_results: [] }, () => 0)).toBeNull();
    expect(remarkedCoverInput(null, () => 0)).toBeNull();
  });

  it('a whole-paper re-mark names no pages, and a junk timestamp is dropped', () => {
    expect(remarkedCoverInput({ previous_results: prev, previous_marked_at: 12345 }, () => null))
      .toEqual({ pages: null, at: null, changed: null });
  });
});
