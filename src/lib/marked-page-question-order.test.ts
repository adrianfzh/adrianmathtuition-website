import { describe, it, expect } from 'vitest';
import { questionKey, questionPageOrder, questionPageRank } from './marked-page-question-order';
import { orderMarkedPages } from './marked-pdf-order';

const r = (photo_index: number, question_number: string, ...labels: string[]) =>
  ({ photo_index, question_number, marking_output: { parts: labels.map(label => ({ label })) } });

describe('questionKey', () => {
  it('reads question, part, sub-part and the letter after a roman part', () => {
    expect(questionKey('7(b)(ii)')).toEqual([7, 2, 2, 0]);
    expect(questionKey('4(iii)(a)')).toEqual([4, 0, 3, 1]);
    expect(questionKey('2(a)(i)(A)')).toEqual([2, 1, 1, 1]);
    expect(questionKey('Q3')).toEqual([3, 0, 0, 0]);
    expect(questionKey('(c)')).toBeNull();
  });
});

describe('questionPageOrder', () => {
  // 1 Nov 2026, "worksheet (35 photos) P2": the photos as they were uploaded.
  const p2 = [
    r(0, '6', '(i)', '(ii)', '(iii)'), r(1, '1', '1'), r(2, '5', '(iii)'), r(3, '4', '(iii)(a)', '(iii)(b)'),
    r(4, '7', '(iii)', '(iv)'), r(5, '9', '(i)', '(ii)', '(iii)'), r(6, '10', '(ii)', '(iii)'), r(7, '4', '(ii)'),
    r(8, '4', '(i)'), r(9, '10', '(iv)'), r(10, '7', '(i)', '(ii)'), r(11, '8', '(i)', '(ii)'), r(12, '6', '(iv)'),
    r(13, '2', '(b)(ii)', '(c)(i)', '(c)(ii)'), r(14, '10', '(i)'), r(15, '5', '(i)', '(ii)'), r(16, '9', '(iv)', '(v)'),
    r(17, '2', '(a)(i)(A)', '(a)(i)(B)', '(a)(ii)', '(b)(i)'),
  ];
  it('puts that shuffled paper back in question order', () => {
    const order = questionPageOrder([...Array(18).keys()], p2);
    expect(order).toEqual([1, 17, 13, 8, 7, 3, 15, 2, 0, 12, 10, 4, 11, 5, 16, 14, 6, 9]);
  });

  it('a page with no marked work rides with the page before it; leading ones stay first', () => {
    const res = [r(1, '3', '(a)'), r(3, '1', '(a)'), r(5, '2', '(a)')];
    // 0 = cover (no work), 2 = Q3 overflow, 4 = Q1 overflow
    expect(questionPageOrder([0, 1, 2, 3, 4, 5], res)).toEqual([0, 3, 4, 5, 1, 2]);
  });

  it('keeps photo order when fewer than half the pages are marked', () => {
    expect(questionPageOrder([0, 1, 2, 3, 4], [r(4, '1', '(a)'), r(0, '2', '(a)')])).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps photo order with no results at all, and on a page that ends one question and starts the next', () => {
    expect(questionPageOrder([2, 0, 1], undefined)).toEqual([0, 1, 2]);
    expect(questionPageOrder([0, 1], [r(0, '6', '(a)'), r(1, '5', '(c)'), r(1, '6', '(a)')])).toEqual([1, 0]);
  });
});

describe('orderMarkedPages with the question rank', () => {
  it('moves each photo with its own transcript sheets', () => {
    const res = [r(0, '2', '(a)'), r(1, '1', '(a)')];
    const out = orderMarkedPages(
      [{ photo_index: 0, item: 'photo0' }, { photo_index: 1, item: 'photo1' }],
      [{ photo_index: 0, label: '2', item: 'Q2' }, { photo_index: 1, label: '1', item: 'Q1' }],
      questionPageRank([0, 1], res),
    );
    expect(out.map(p => p.item)).toEqual(['photo1', 'Q1', 'photo0', 'Q2']);
  });
});
