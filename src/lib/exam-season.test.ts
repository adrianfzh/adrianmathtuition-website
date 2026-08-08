import { describe, it, expect } from 'vitest';
import { checkExamInfoStatus, seasonSatisfyingTypes, ExamRecord } from './exam-season';

const rec = (examType: string, over: Partial<ExamRecord> = {}): ExamRecord => ({
  id: 'rec1',
  examType,
  examDate: '2026-09-15',
  testedTopics: 'Vectors',
  ...over,
});

describe('seasonSatisfyingTypes', () => {
  it('every season accepts its own type plus Prelim and Promo', () => {
    expect(seasonSatisfyingTypes('WA3')).toEqual(['WA3', 'Prelim', 'Promo']);
    expect(seasonSatisfyingTypes('EOY')).toEqual(['EOY', 'Prelim', 'Promo']);
  });
});

describe('checkExamInfoStatus season equivalence', () => {
  // Sec 4 / JC2 sit Prelims instead of WA3 — a complete Prelim record must
  // satisfy the WA3 season (the hub ⚠ card counted these as gaps before).
  it('a complete Prelim record satisfies WA3 season', () => {
    expect(checkExamInfoStatus([rec('Prelim')], 'WA3').complete).toBe(true);
  });

  // JC1 sits its Promo instead of an EOY.
  it('a complete Promo record satisfies EOY season', () => {
    expect(checkExamInfoStatus([rec('Promo')], 'EOY').complete).toBe(true);
  });

  it('an unrelated exam type does not satisfy the season', () => {
    const st = checkExamInfoStatus([rec('WA1')], 'WA3');
    expect(st.complete).toBe(false);
    expect(st.missing.hasNoRecord).toBe(true);
  });

  it('an incomplete Prelim record still warns', () => {
    const st = checkExamInfoStatus([rec('Prelim', { testedTopics: null })], 'WA3');
    expect(st.complete).toBe(false);
    expect(st.missing.missingTopics).toBe(true);
  });

  it('No Exam marker on a Promo record suppresses the warning in EOY season', () => {
    const st = checkExamInfoStatus(
      [rec('Promo', { examDate: null, testedTopics: null, noExam: true })],
      'EOY'
    );
    expect(st.complete).toBe(true);
  });
});
