import { describe, it, expect } from 'vitest';
import { checkExamInfoStatus, seasonSatisfyingTypes, nextExamType, previousExamType, scheduleExamTypes, pickDisplaySeason, defaultEditExamType, levelSpecificExamType, ExamRecord } from './exam-season';

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

describe('season handover (EOY entered during WA3)', () => {
  const aug22 = new Date('2026-08-22T04:00:00Z'); // WA3 window
  const sep10 = new Date('2026-09-10T04:00:00Z'); // gap between WA3 and EOY
  const nov20 = new Date('2026-11-20T04:00:00Z'); // after EOY
  const jan20 = new Date('2026-01-20T04:00:00Z'); // before WA1

  it('nextExamType follows the window order', () => {
    expect(nextExamType('WA3', aug22)).toBe('EOY');
    expect(nextExamType('WA1', aug22)).toBe('WA2');
    expect(nextExamType('EOY', aug22)).toBeNull();
  });
  it('nextExamType in a gap is the window that starts next', () => {
    expect(nextExamType(null, sep10)).toBe('EOY');
    expect(nextExamType(null, jan20)).toBe('WA1');
    expect(nextExamType(null, nov20)).toBeNull();
  });
  it('previousExamType is the window that just ended', () => {
    expect(previousExamType(sep10)).toBe('WA3');
    expect(previousExamType(jan20)).toBeNull();
    expect(previousExamType(nov20)).toBe('EOY');
  });
  it('scheduleExamTypes loads active + next + Prelim/Promo, deduped', () => {
    expect(scheduleExamTypes('WA3', aug22)).toEqual(['WA3', 'EOY', 'Prelim', 'Promo']);
    expect(scheduleExamTypes(null, sep10)).toEqual(['WA3', 'EOY', 'Prelim', 'Promo']);
    expect(scheduleExamTypes('EOY', aug22)).toEqual(['EOY', 'Prelim', 'Promo']);
    expect(scheduleExamTypes(null, nov20)).toEqual(['EOY', 'Prelim', 'Promo']);
  });

  const today = '2026-08-22';
  // Jeanette: WA3 on 12 Aug (past) + EOY P1/P2 in Oct → show EOY.
  it('picks the next season once the active one is past', () => {
    expect(pickDisplaySeason([
      { examType: 'WA3', examDate: '2026-08-12' },
      { examType: 'EOY', examDate: '2026-10-01' },
      { examType: 'EOY', examDate: '2026-10-06' },
    ], 'WA3', today)).toEqual({ examType: 'EOY', upcoming: true });
  });
  // Adela: WA3 = PW/AA marker (No Exam) + EOY 28 Sep → show EOY.
  it('a No-Exam marker for the active season does not outrank a real next-season exam', () => {
    expect(pickDisplaySeason([
      { examType: 'WA3', examDate: null, noExam: true },
      { examType: 'EOY', examDate: '2026-09-28' },
    ], 'WA3', today)).toEqual({ examType: 'EOY', upcoming: true });
  });
  it('keeps showing the active season while its exam is still ahead, even with EOY saved', () => {
    expect(pickDisplaySeason([
      { examType: 'WA3', examDate: '2026-08-28' },
      { examType: 'EOY', examDate: '2026-10-01' },
    ], 'WA3', today)).toEqual({ examType: 'WA3', upcoming: true });
  });
  it('active season over and nothing else saved → "✅ done" state (not upcoming)', () => {
    expect(pickDisplaySeason([{ examType: 'WA3', examDate: '2026-08-12' }], 'WA3', today))
      .toEqual({ examType: 'WA3', upcoming: false });
  });
  it('a No-Exam marker alone stays selected (chip shows PW/AA / no exam)', () => {
    expect(pickDisplaySeason([{ examType: 'WA3', examDate: null, noExam: true }], 'WA3', today))
      .toEqual({ examType: 'WA3', upcoming: false });
  });
  it('a date-less row counts as TBC (ahead) and blocks the done state', () => {
    expect(pickDisplaySeason([{ examType: 'Prelim', examDate: null }], 'WA3', today))
      .toEqual({ examType: 'Prelim', upcoming: true });
  });
  it('exam-day itself is still upcoming', () => {
    expect(pickDisplaySeason([{ examType: 'WA3', examDate: today }], 'WA3', today).upcoming).toBe(true);
  });
  it('no records → null', () => {
    expect(pickDisplaySeason([], 'WA3', today)).toEqual({ examType: null, upcoming: false });
  });
  it('in a gap with only the finished season saved, shows that season as done', () => {
    expect(pickDisplaySeason([{ examType: 'WA3', examDate: '2026-08-12' }], null, '2026-09-10'))
      .toEqual({ examType: 'WA3', upcoming: false });
  });
});

describe('defaultEditExamType / levelSpecificExamType', () => {
  const aug22 = new Date('2026-08-22T04:00:00Z');
  const sep10 = new Date('2026-09-10T04:00:00Z');
  it('opens on the season still ahead', () => {
    expect(defaultEditExamType({ examType: 'EOY', upcoming: true }, 'WA3', aug22)).toBe('EOY');
    expect(defaultEditExamType({ examType: 'WA3', upcoming: true }, 'WA3', aug22)).toBe('WA3');
  });
  it('season over → next season (what Adrian is entering now)', () => {
    expect(defaultEditExamType({ examType: 'WA3', upcoming: false }, 'WA3', aug22)).toBe('EOY');
    expect(defaultEditExamType({ examType: 'WA3', upcoming: false }, null, sep10)).toBe('EOY');
  });
  it('nothing saved → active season, or the next one in a gap', () => {
    expect(defaultEditExamType({ examType: null, upcoming: false }, 'WA3', aug22)).toBe('WA3');
    expect(defaultEditExamType({ examType: null, upcoming: false }, null, sep10)).toBe('EOY');
  });
  it('EOY over with nothing after it stays EOY', () => {
    expect(defaultEditExamType({ examType: 'EOY', upcoming: false }, 'EOY', new Date('2026-11-05T04:00:00Z'))).toBe('EOY');
  });
  it('level adjustment: Sec 4 / JC2 → Prelim in WA3, JC1 → Promo in EOY', () => {
    expect(levelSpecificExamType('WA3', 'Sec 4')).toBe('Prelim');
    expect(levelSpecificExamType('WA3', 'JC2')).toBe('Prelim');
    expect(levelSpecificExamType('WA3', 'Sec 2')).toBe('WA3');
    expect(levelSpecificExamType('EOY', 'JC1')).toBe('Promo');
    expect(levelSpecificExamType('EOY', 'Sec 4')).toBe('EOY');
    expect(levelSpecificExamType(null, 'JC1')).toBeNull();
  });
});
