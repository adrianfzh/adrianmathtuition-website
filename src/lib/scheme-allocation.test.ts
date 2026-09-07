import { describe, it, expect } from 'vitest';
import { allocationFrom } from './scheme-allocation';

describe('allocationFrom (8 Sep 2026)', () => {
  it('records the split a marking used, merged across photos, without parts that have no max', () => {
    const mo = (parts: unknown[]) => ({ parts });
    const results = [
      { photo_index: 10, question_number: '7', marking_output: mo([{ label: '(a)', max: 4, scheme: 'M1 A1 A1 A1' }, { label: '(b)', max: 2 }]) },
      { photo_index: 11, question_number: '7', marking_output: mo([{ label: '(b)(ii)', max: 2, scheme: 'M1 read-off; A1 value' }, { label: '(a)', max: 4, scheme: 'ignored — second sighting' }]) },
      { photo_index: 0, question_number: '1', marking_output: mo([{ label: '(whole)', max: 5 }, { label: '(z)', max: 0 }]) },
      { photo_index: 3, question_number: '3', question_found: false, marking_output: mo([{ label: '', max: 3 }]) },
    ];
    const a = allocationFrom(results);
    expect(a.map(q => q.number)).toEqual(['1', '7']);
    expect(a[0]).toEqual({ number: '1', marks: 5, parts: [{ label: '', marks: 5 }] });
    expect(a[1].parts.map(p => [p.label, p.marks])).toEqual([['(a)', 4], ['(b)', 2], ['(b)(ii)', 2]]);
    expect(a[1].parts[0].scheme).toBe('M1 A1 A1 A1');
    expect(a[1].marks).toBe(8);
    expect(allocationFrom(null)).toEqual([]);
  });
});
