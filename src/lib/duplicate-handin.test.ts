import { describe, it, expect } from 'vitest';
import { findDuplicate, sameNameish, nameParts, duplicateMessage, whenWords, type EarlierHandin } from './duplicate-handin';

// Rainie Cheng's two hand-ins, 4 Oct 2026 (paper_marking_runs de8c5f64… and efe2fa3e…):
// the same 24 photos, byte for byte (the storage eTags below are the real ones).
const RAINIE_ETAGS = '6a8783f25efeec1e0432db103c7f2498,8e0a2ba170d49038517c2860b0635482,619f53799b3a6b1daf2d112e1a7b47ff,d1d506b6272cea4d320289ec559fefa1,9f02b73fb00e9ca9297f40d349388a80,2f8ac97f2c276010b21b4c4de0e0da0d,aa1767b638b8e16179c8dbf53b53d6b1,2014674c158275b185e3a3d5324a7d8f,9792b639cffb3879e585478b9675db0b,5a1b5f42c232d0a2654842ad8a12482e,03da4c2af782b22f035f5812b56a2bba,56956a86e30cc09c28c26ce721022a5a,18f2fcfb0ae95f1dde5758652de2462a,bc674b6104cacdf33c26b229b8aad7e6,497c5ea73d164190a04c7ac2a1b12745,47db323e3c0a5001a2406484d3ae235a,d8e6a67ea7b3a2dcbb90d1cf9a6a6fe3,80b14d6e214ada4cbb94af41f58070bd,fdccbb2b7a56f1718e12f58a608b68cb,17a8fc5b289923c7196622dc64a41280,34c8168ec54c3217b5866a23f8475f10,4468f9880d6e310731b5205de36f5274,5d1f10d7aafd2bfcfd7db861a2c9c2e8,1699566f4d3df89f3d04b9c297fafdc8'.split(',');
// Her first one, as it stood when she sent the second: queued, not marked (released 14:40Z).
const rainieFirst: EarlierHandin = {
  id: 'de8c5f64-cd81-4972-98f9-86c6acf7b418', created_at: '2026-10-04T04:25:43.244Z',
  paper_name: 'Queenstown Secondary Chemistry Paper 2', subject: 'chemistry',
  released_at: null, queue_status: 'queued', fingerprints: RAINIE_ETAGS,
};
const AT_SECOND = new Date('2026-10-04T14:28:00.776Z');   // 22:28 SGT

describe('regression: Rainie Cheng, Queenstown Chemistry P2 handed in twice (4 Oct 2026)', () => {
  it('the same 24 photos → the same paper, nothing new to add', () => {
    const m = findDuplicate({ paperName: 'Queenstown Paper 2', subject: 'chemistry', fingerprints: RAINIE_ETAGS }, [rainieFirst], AT_SECOND);
    expect(m?.kind).toBe('photos');
    expect(m?.run.id).toBe(rainieFirst.id);
    expect(m && m.kind === 'photos' ? m.newPageIndexes : null).toEqual([]);
    expect(duplicateMessage(m!, { now: AT_SECOND })).toMatch(/^We already have this paper — you sent it at 12:25 pm today\.\nIt will be marked once\./);
  });
  it('the names alone match too', () => {
    expect(sameNameish('Queenstown Paper 2', 'Queenstown Secondary Chemistry Paper 2')).toBe(true);
    const m = findDuplicate({ paperName: 'Queenstown Paper 2', subject: 'chemistry', fingerprints: [] }, [rainieFirst], AT_SECOND);
    expect(m?.kind).toBe('name');
    expect(duplicateMessage(m!, { now: AT_SECOND })).toMatch(/tap Send anyway/);
  });
  it('once marked, the name still asks — it may be a second attempt, so Send anyway stays (10 Oct 2026)', () => {
    const marked = { ...rainieFirst, released_at: '2026-10-04T14:40:55Z', queue_status: 'done' };
    const n = findDuplicate({ paperName: 'Queenstown Paper 2', subject: 'chemistry', fingerprints: [] }, [marked], AT_SECOND);
    expect(n?.kind).toBe('name');
    expect(duplicateMessage(n!, { now: AT_SECOND })).toMatch(/and it is marked\. Find it under Papers\.\nIf this is a new attempt or a different paper, tap Send anyway\./);
    // the same photos are the same paper without asking
    const m = findDuplicate({ paperName: 'x', subject: 'chemistry', fingerprints: RAINIE_ETAGS }, [marked], AT_SECOND);
    expect(m?.kind).toBe('photos');
    expect(duplicateMessage(m!, { now: AT_SECOND })).toMatch(/it is marked/);
  });
});

describe('regression: Denise Chan, TYS 2023 A Math P1 scanned again four days after it was marked (10 Oct 2026)', () => {
  // paper_marking_runs 325c5040… (6 Oct, 77/90) and 6ef79906… (10 Oct, 75/90): the same script,
  // new scans — no photo fingerprint in common — and a name with no school in it.
  const first: EarlierHandin = {
    id: '325c5040', created_at: '2026-10-06T01:16:00Z', paper_name: 'tys 2023 amath paper 1', subject: 'math',
    released_at: '2026-10-06T01:35:00Z', queue_status: 'done', fingerprints: ['a1', 'a2', 'a3'],
  };
  const at = new Date('2026-10-10T03:40:00Z');
  it('the name asks, and says the paper is already marked', () => {
    const m = findDuplicate({ paperName: 'tys 2023 amath paper 1', subject: 'math', fingerprints: ['b1', 'b2', 'b3'] }, [first], at);
    expect(m?.kind).toBe('name');
    expect(duplicateMessage(m!, { now: at })).toBe('You handed in “tys 2023 amath paper 1” on Tue 6 Oct, and it is marked. Find it under Papers.\nIf this is a new attempt or a different paper, tap Send anyway.');
  });
  it('her other papers do not match it', () => {
    for (const other of ['tys 2024 emath p2', 'tys 2023 paper 2 emath', 'tys 2023 emath paper 1', 'tys amath 2024 paper 1', 'tys 2023 amath paper 2', 'AM Tys 2021 specimen paper 2']) {
      expect(findDuplicate({ paperName: other, subject: 'math', fingerprints: [] }, [first], at)).toBeNull();
    }
  });
  it('written another way it is still the same paper', () => {
    expect(sameNameish('TYS 2023 A Math P1', 'tys 2023 amath paper 1')).toBe(true);
    expect(sameNameish('2023 add maths paper 1', 'tys 2023 amath paper 1')).toBe(true);
  });
});

describe('photos', () => {
  it('the same pages plus two forgotten ones → those two are the new pages', () => {
    const m = findDuplicate({ paperName: 'Q P2', subject: 'chemistry', fingerprints: [...RAINIE_ETAGS.slice(0, 10), 'new1', 'new2'] }, [rainieFirst], AT_SECOND);
    expect(m?.kind).toBe('photos');
    expect(m && m.kind === 'photos' ? m.newPageIndexes : null).toEqual([10, 11]);
    expect(duplicateMessage(m!, { added: 2, now: AT_SECOND })).toMatch(/The 2 new pages were added to it/);
  });
  it('one shared page in twenty is not the same paper (a cover sheet, a blank)', () => {
    const fresh = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', RAINIE_ETAGS[0]];
    expect(findDuplicate({ paperName: 'Bedok P1', subject: 'chemistry', fingerprints: fresh }, [rainieFirst], AT_SECOND)).toBeNull();
  });
  it('a different family never matches (a physics paper is not a chemistry one)', () => {
    expect(findDuplicate({ paperName: 'Queenstown Paper 2', subject: 'physics', fingerprints: RAINIE_ETAGS }, [rainieFirst], AT_SECOND)).toBeNull();
  });
  it('the same photos a week later are still the same paper (thirty days since 10 Oct 2026)', () => {
    const aWeekOn = new Date('2026-10-11T00:00:00Z');
    expect(findDuplicate({ paperName: 'x', subject: 'chemistry', fingerprints: RAINIE_ETAGS }, [rainieFirst], aWeekOn)?.kind).toBe('photos');
  });
  it('older than thirty days, archived or superseded → not counted', () => {
    const late = new Date('2026-11-05T00:00:00Z');
    expect(findDuplicate({ paperName: 'x', subject: 'chemistry', fingerprints: RAINIE_ETAGS }, [rainieFirst], late)).toBeNull();
    expect(findDuplicate({ paperName: 'x', subject: 'chemistry', fingerprints: RAINIE_ETAGS }, [{ ...rainieFirst, archived_at: '2026-10-04T05:00:00Z' }], AT_SECOND)).toBeNull();
    expect(findDuplicate({ paperName: 'x', subject: 'chemistry', fingerprints: RAINIE_ETAGS }, [{ ...rainieFirst, superseded_by: 'zz' }], AT_SECOND)).toBeNull();
  });
  it('maths: null subject and "math" are the same family', () => {
    const am: EarlierHandin = { id: 'a1', created_at: '2026-10-04T01:00:00Z', paper_name: 'Xinmin 2021 Prelim P2', subject: 'math', fingerprints: ['p', 'q', 'r'] };
    expect(findDuplicate({ paperName: 'other', subject: null, fingerprints: ['p', 'q', 'r'] }, [am], AT_SECOND)?.kind).toBe('photos');
  });
});

describe('names', () => {
  it('reads the paper, year, exam and school words', () => {
    expect(nameParts('Xinmin 2021 Prelim P2')).toEqual({ paper: '2', year: '2021', exam: 'prelim', kind: null, words: ['xinmin'] });
    expect(nameParts('Olevel AMATH 2025 paper 1 and 2').words).toEqual([]);
  });
  it('a different paper number, year or exam is a different paper', () => {
    expect(sameNameish('Xinmin 2021 Prelim P2', 'Xinmin 2021 Prelim P1')).toBe(false);
    expect(sameNameish('Xinmin 2021 Prelim P2', 'Xinmin 2022 Prelim P2')).toBe(false);
    expect(sameNameish('Xinmin Prelim P2', 'Xinmin EOY P2')).toBe(false);
    expect(sameNameish('Xinmin P2', 'Bedok View P2')).toBe(false);
  });
  it('a name with no school words and no year never matches ("A Math paper 2")', () => {
    expect(sameNameish('A Math paper 2', 'E Math Paper 2')).toBe(false);
    expect(sameNameish('A Math paper 2', 'A Math Paper 2')).toBe(false);
    expect(sameNameish('tys 2023 paper 1', 'tys 2023 amath paper 1')).toBe(false);
    expect(sameNameish('Xinmin 2023 A Math P1', 'Xinmin 2023 E Math P1')).toBe(false);
  });
  it('a paper number on one side only needs the same words exactly', () => {
    expect(sameNameish('Queenstown Chemistry', 'Queenstown Chemistry P2')).toBe(true);
    expect(sameNameish('Queenstown', 'Queenstown Bukit P2')).toBe(false);
  });
});

describe('when', () => {
  it('says today / yesterday / a date, Singapore time', () => {
    expect(whenWords('2026-10-04T04:25:43Z', AT_SECOND)).toBe('at 12:25 pm today');
    expect(whenWords('2026-10-03T14:28:00Z', AT_SECOND)).toBe('yesterday at 10:28 pm');
    expect(whenWords('2026-10-01T02:00:00Z', AT_SECOND)).toBe('on Thu 1 Oct');
  });
});
