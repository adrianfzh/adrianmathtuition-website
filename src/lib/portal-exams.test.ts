import { describe, it, expect } from 'vitest';
import {
  countdownWords, daysBetween, examDateWords, examLabel, examTitle, parseTestedTopics,
  practiceLevelForSubject, shapeUpcomingExams, splitSubject, timedSetHref, topicPracticeHref,
  type ExamRecordLike,
} from './portal-exams';

const TODAY = '2026-09-02';

function rec(over: Partial<ExamRecordLike>): ExamRecordLike {
  return {
    id: 'recX', examType: 'Prelim', customName: '', subject: 'A Math (P1)', examDate: '2026-09-15',
    testedTopics: '', examNotes: '', noExam: false, ...over,
  };
}

describe('splitSubject', () => {
  it('peels the paper off the Airtable Subject option', () => {
    expect(splitSubject('A Math (P1)')).toEqual({ subject: 'A Math', paper: 'P1' });
    expect(splitSubject('H2 Math (P2)')).toEqual({ subject: 'H2 Math', paper: 'P2' });
  });
  it('leaves single-paper subjects alone', () => {
    expect(splitSubject('E Math')).toEqual({ subject: 'E Math', paper: null });
    expect(splitSubject('')).toEqual({ subject: '', paper: null });
  });
});

describe('practiceLevelForSubject', () => {
  it('maps subjects onto the portal level keys the picker uses', () => {
    expect(practiceLevelForSubject('A Math', 'Sec 4')).toBe('AM');
    expect(practiceLevelForSubject('A Math', 'Sec 3')).toBe('S3_AM');
    expect(practiceLevelForSubject('E Math', 'Sec 3')).toBe('S3_EM');
    expect(practiceLevelForSubject('E Math', 'Sec 5')).toBe('EM');
    expect(practiceLevelForSubject('H2 Math', 'JC1')).toBe('JC1');
    expect(practiceLevelForSubject('H2 Math', 'JC2')).toBe('JC2');
    expect(practiceLevelForSubject('Math', 'Sec 1')).toBe('S1');
    expect(practiceLevelForSubject('Math', 'Sec 2')).toBe('S2');
  });
  it('refuses to guess when the subject is ambiguous for the level', () => {
    expect(practiceLevelForSubject('Math', 'Sec 4')).toBeNull();
    expect(practiceLevelForSubject('Physics', 'Sec 4')).toBeNull();
  });
  it('falls back to the level when no subject was recorded', () => {
    expect(practiceLevelForSubject('', 'JC2')).toBe('JC2');
    expect(practiceLevelForSubject('', 'JC1')).toBe('JC1');
    expect(practiceLevelForSubject('', 'Sec 2')).toBe('S2');
    expect(practiceLevelForSubject('', 'Sec 4')).toBeNull();
  });
});

describe('examLabel', () => {
  it('speaks the student\'s language for the level-specific types', () => {
    expect(examLabel({ examType: 'Prelim', customName: '' }, 'Sec 4')).toBe('Prelims');
    expect(examLabel({ examType: 'EOY', customName: '' }, 'Sec 4')).toBe('Prelims');
    expect(examLabel({ examType: 'EOY', customName: '' }, 'JC1')).toBe('Promo');
    expect(examLabel({ examType: 'Promo', customName: '' }, 'JC1')).toBe('Promo');
    expect(examLabel({ examType: 'WA3', customName: '' }, 'Sec 3')).toBe('WA3');
    expect(examLabel({ examType: 'EOY', customName: '' }, 'Sec 3')).toBe('EOY');
  });
  it('uses the custom name for Custom exams, with a fallback', () => {
    expect(examLabel({ examType: 'Custom', customName: ' Class test 2 ' }, 'Sec 4')).toBe('Class test 2');
    expect(examLabel({ examType: 'Custom', customName: '' }, 'Sec 4')).toBe('Test');
  });
});

describe('parseTestedTopics', () => {
  it('splits the dialog\'s comma list (and newlines), trimming + de-duplicating', () => {
    expect(parseTestedTopics('Surds, Indices,Logarithms\nSurds , ')).toEqual(['Surds', 'Indices', 'Logarithms']);
    expect(parseTestedTopics('')).toEqual([]);
  });
});

describe('daysBetween', () => {
  it('counts whole days, signed', () => {
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween(TODAY, '2026-09-03')).toBe(1);
    expect(daysBetween(TODAY, '2026-09-15')).toBe(13);
    expect(daysBetween(TODAY, '2026-09-01')).toBe(-1);
  });
});

describe('shapeUpcomingExams', () => {
  it('keeps only dated, upcoming, non-No-Exam rows inside the horizon', () => {
    const out = shapeUpcomingExams([
      rec({ id: 'past', examDate: '2026-08-30' }),
      rec({ id: 'undated', examDate: null }),
      rec({ id: 'marker', noExam: true, examDate: '2026-09-20' }),
      rec({ id: 'far', examDate: '2027-03-01' }),
      rec({ id: 'ok', examDate: '2026-09-15' }),
    ], TODAY, 'Sec 4');
    expect(out.map(e => e.id)).toEqual(['ok']);
  });

  it('sorts by date then paper and caps the card', () => {
    const out = shapeUpcomingExams([
      rec({ id: 'p2', subject: 'A Math (P2)', examDate: '2026-09-17' }),
      rec({ id: 'em', examType: 'Prelim', subject: 'E Math (P1)', examDate: '2026-09-15' }),
      rec({ id: 'p1', subject: 'A Math (P1)', examDate: '2026-09-15' }),
      rec({ id: 'em2', subject: 'E Math (P2)', examDate: '2026-09-18' }),
    ], TODAY, 'Sec 4');
    expect(out.map(e => e.id)).toEqual(['p1', 'em', 'p2']);
    expect(out[0].daysLeft).toBe(13);
    expect(out[0].paper).toBe('P1');
    expect(out[0].subject).toBe('A Math');
  });

  it('shapes the student-facing fields: label, approx flag, topics, practice level', () => {
    const [e] = shapeUpcomingExams([rec({
      examType: 'WA3', subject: 'A Math', examDate: '2026-09-04',
      testedTopics: 'Binomial Theorem, Logarithms', examNotes: '~|Teacher said around the 4th\n📷 https://x/y.jpg',
    })], TODAY, 'Sec 3');
    expect(e.label).toBe('WA3');
    expect(e.approx).toBe(true);
    expect(e.testedTopics).toEqual(['Binomial Theorem', 'Logarithms']);
    expect(e.practiceLevel).toBe('S3_AM');
    expect(e.daysLeft).toBe(2);
  });

  it('treats today as day 0, not as past', () => {
    const out = shapeUpcomingExams([rec({ examDate: TODAY })], TODAY, 'Sec 4');
    expect(out).toHaveLength(1);
    expect(out[0].daysLeft).toBe(0);
  });
});

describe('words + links', () => {
  it('countdownWords', () => {
    expect(countdownWords(0)).toBe('Today');
    expect(countdownWords(1)).toBe('Tomorrow');
    expect(countdownWords(5)).toBe('in 5 days');
  });
  it('examDateWords renders the weekday + day + month', () => {
    const s = examDateWords('2026-09-15');
    expect(s).toMatch(/Tue/);
    expect(s).toMatch(/15/);
    expect(s).toMatch(/Sep/);
  });
  it('examTitle', () => {
    expect(examTitle({ label: 'Prelims', subject: 'A Math', paper: 'P1' })).toBe('Prelims · A Math P1');
    expect(examTitle({ label: 'WA3', subject: '', paper: null })).toBe('WA3');
  });
  it('timedSetHref carries level + topics, and is bare when there is nothing to carry', () => {
    expect(timedSetHref({ practiceLevel: 'AM', testedTopics: ['Surds', 'Linear Law'] }))
      .toBe('/app/practice/timed?level=AM&topics=Surds%2CLinear+Law');
    expect(timedSetHref({ practiceLevel: null, testedTopics: [] })).toBe('/app/practice/timed');
  });
  it('topicPracticeHref opens the picker on that topic', () => {
    expect(topicPracticeHref({ practiceLevel: 'EM' }, 'Vectors')).toBe('/app/practice?level=EM&topic=Vectors');
    expect(topicPracticeHref({ practiceLevel: null }, 'Vectors')).toBe('/app/practice?topic=Vectors');
  });
});
