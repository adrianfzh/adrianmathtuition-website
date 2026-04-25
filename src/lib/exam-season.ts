export type ExamType = 'WA1' | 'WA2' | 'WA3' | 'EOY';

export interface ExamWindow {
  type: ExamType;
  start: string; // MM-DD
  end: string;   // MM-DD
}

export const EXAM_WINDOWS: ExamWindow[] = [
  { type: 'WA1', start: '02-01', end: '03-15' },
  { type: 'WA2', start: '04-15', end: '06-05' },
  { type: 'WA3', start: '07-15', end: '09-05' },
  { type: 'EOY', start: '09-20', end: '11-10' },
];

/**
 * Returns the exam type active today based on hardcoded calendar windows.
 * Returns null if today is not in any window.
 * Uses SGT (Asia/Singapore) for date comparison.
 */
export function getActiveExamTypeByDate(today: Date = new Date()): ExamType | null {
  const sgt = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const mmdd = `${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(sgt.getDate()).padStart(2, '0')}`;
  for (const w of EXAM_WINDOWS) {
    if (mmdd >= w.start && mmdd <= w.end) return w.type;
  }
  return null;
}

/**
 * Resolve effective exam type considering both date-based windows and manual override.
 * Manual override takes precedence.
 */
export function resolveActiveExamType(
  override: ExamType | null,
  today: Date = new Date()
): ExamType | null {
  if (override) return override;
  return getActiveExamTypeByDate(today);
}

export interface ExamInfoStatus {
  /** Student has a matching exam record with both Date and Topics filled in. */
  complete: boolean;
  /** Active exam type (null if not in season). */
  activeType: ExamType | null;
  /** If incomplete, what's missing. */
  missing: {
    hasNoRecord: boolean;
    missingDate: boolean;
    missingTopics: boolean;
  };
}

export interface ExamRecord {
  id: string;
  examType: string;
  examDate: string | null;
  testedTopics: string | null;
  noExam?: boolean; // student explicitly has no exam for this season
}

/**
 * Given a student's exam records and the active exam type, determine
 * whether the student's exam info is complete for the current season.
 *
 * Warning when EITHER Exam Date OR Tested Topics is empty.
 */
export function checkExamInfoStatus(
  studentExams: ExamRecord[],
  activeType: ExamType | null
): ExamInfoStatus {
  if (!activeType) {
    return {
      complete: true,
      activeType: null,
      missing: { hasNoRecord: false, missingDate: false, missingTopics: false },
    };
  }
  const matching = studentExams.filter(e => e.examType === activeType);
  if (matching.length === 0) {
    return {
      complete: false,
      activeType,
      missing: { hasNoRecord: true, missingDate: true, missingTopics: true },
    };
  }
  // If any record has noExam=true, treat as complete — suppress warning
  if (matching.some(e => e.noExam)) {
    return {
      complete: true,
      activeType,
      missing: { hasNoRecord: false, missingDate: false, missingTopics: false },
    };
  }
  // Pick the most complete record as representative
  const best = matching.reduce((a, b) => {
    const scoreA = (a.examDate ? 1 : 0) + (a.testedTopics ? 1 : 0);
    const scoreB = (b.examDate ? 1 : 0) + (b.testedTopics ? 1 : 0);
    return scoreA >= scoreB ? a : b;
  });
  const missingDate   = !best.examDate   || best.examDate.trim()   === '';
  const missingTopics = !best.testedTopics || best.testedTopics.trim() === '';
  return {
    complete: !missingDate && !missingTopics,
    activeType,
    missing: { hasNoRecord: false, missingDate, missingTopics },
  };
}
