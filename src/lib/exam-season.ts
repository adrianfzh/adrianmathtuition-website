export type ExamType = 'WA1' | 'WA2' | 'WA3' | 'EOY';

export interface ExamWindow {
  type: ExamType;
  start: string; // MM-DD
  end: string;   // MM-DD
}

export const EXAM_WINDOWS: ExamWindow[] = [
  { type: 'WA1', start: '02-01', end: '03-15' },
  { type: 'WA2', start: '04-01', end: '05-29' },
  { type: 'WA3', start: '07-01', end: '09-05' },
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
 * Exam Type values that satisfy a season. Some levels sit a level-specific
 * exam instead of the seasonal WA: Sec 4 / JC2 sit Prelims (WA3 window),
 * JC1 sits its Promo (EOY window) — so a Prelim/Promo record counts for the
 * season everywhere the ⚠ "missing exam info" criteria run. Mirrors the
 * schedule route's Exams fetch, which OR-includes Prelim + Promo year-round.
 */
export function seasonSatisfyingTypes(activeType: ExamType): string[] {
  return [activeType, 'Prelim', 'Promo'];
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
  const satisfying = new Set(seasonSatisfyingTypes(activeType));
  const matching = studentExams.filter(e => satisfying.has(e.examType));
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

// ── Season handover (2026-08-22) ────────────────────────────────────────────
// Late in a window Adrian starts entering NEXT season's exam info (EOY during
// WA3). The schedule used to fetch only the active season's records, so those
// EOY rows were invisible until 20 Sep and the chip kept saying "WA3". Now the
// route fetches the active season AND the next one, and each student shows
// whichever season is actually upcoming for them.

function sgtMMDD(today: Date): string {
  const sgt = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  return `${String(sgt.getMonth() + 1).padStart(2, '0')}-${String(sgt.getDate()).padStart(2, '0')}`;
}

/**
 * The season that follows `active` (WA3 → EOY). When no window is active
 * (the gaps between windows), the next window that starts after today —
 * e.g. 10 Sep → EOY, 20 Jan → WA1. EOY is the last window of the year → null.
 */
export function nextExamType(active: ExamType | null, today: Date = new Date()): ExamType | null {
  if (active) {
    const i = EXAM_WINDOWS.findIndex(w => w.type === active);
    return i >= 0 && i + 1 < EXAM_WINDOWS.length ? EXAM_WINDOWS[i + 1].type : null;
  }
  const mmdd = sgtMMDD(today);
  return EXAM_WINDOWS.find(w => w.start > mmdd)?.type ?? null;
}

/** The most recent window that has already ended (for the gap between windows). */
export function previousExamType(today: Date = new Date()): ExamType | null {
  const mmdd = sgtMMDD(today);
  let prev: ExamType | null = null;
  for (const w of EXAM_WINDOWS) if (w.end < mmdd) prev = w.type;
  return prev;
}

/**
 * Exam Type values the schedule should load so a chip can show BOTH the
 * season that's wrapping up and the one being entered: active (or, in a gap,
 * the one just finished) + next + the level-specific Prelim/Promo.
 */
export function scheduleExamTypes(active: ExamType | null, today: Date = new Date()): string[] {
  const out: string[] = [];
  const push = (t: string | null) => { if (t && !out.includes(t)) out.push(t); };
  push(active ?? previousExamType(today));
  push(nextExamType(active, today));
  push('Prelim');
  push('Promo');
  return out;
}

export interface SeasonPick {
  /** Exam Type whose records the chip/dialog should show (null = none saved). */
  examType: string | null;
  /** True when that season still has an exam ahead (or a date-less TBC row). */
  upcoming: boolean;
}

/**
 * A student may now have records from two seasons loaded. Pick the one to
 * display: the season with the earliest exam still ahead (a date-less, non
 * No-Exam row counts as "TBC" = ahead); failing that the active season (so the
 * chip can say "✅ WA3 done" / keep its No-Exam marker); failing that the
 * season with the latest date. `today` is an ISO date (SGT).
 */
export function pickDisplaySeason(
  records: { examType: string; examDate: string | null; noExam?: boolean }[],
  active: ExamType | null,
  today: string,
): SeasonPick {
  if (!records.length) return { examType: null, upcoming: false };
  const byType = new Map<string, { earliestAhead: string | null; latest: string }>();
  for (const r of records) {
    const t = r.examType || '';
    const cur = byType.get(t) ?? { earliestAhead: null, latest: '' };
    if (!r.noExam) {
      const d = r.examDate || '9999-12-31'; // TBC sorts last but still "ahead"
      if (d >= today && (cur.earliestAhead === null || d < cur.earliestAhead)) cur.earliestAhead = d;
    }
    if ((r.examDate || '') > cur.latest) cur.latest = r.examDate || '';
    byType.set(t, cur);
  }
  let best: string | null = null;
  let bestDate: string | null = null;
  for (const [t, s] of byType) {
    if (s.earliestAhead !== null && (bestDate === null || s.earliestAhead < bestDate)) { best = t; bestDate = s.earliestAhead; }
  }
  if (best) return { examType: best, upcoming: true };
  if (active && byType.has(active)) return { examType: active, upcoming: false };
  let latestType: string | null = null; let latest = '';
  for (const [t, s] of byType) if (latestType === null || s.latest > latest) { latestType = t; latest = s.latest; }
  return { examType: latestType, upcoming: false };
}

/**
 * Sec 4 / JC2 sit their Prelims in the WA3 window and JC1 sits its Promo in
 * the EOY window — the editor should offer that type, not the bare season.
 */
export function levelSpecificExamType(type: string | null, level: string): string | null {
  if (!type) return null;
  const lv = (level || '').toLowerCase();
  if (type === 'WA3' && (lv.includes('sec 4') || lv === 'jc2')) return 'Prelim';
  if (type === 'EOY' && lv === 'jc1') return 'Promo';
  return type;
}

/**
 * Which exam type the exam editor should open on for a student (before the
 * level adjustment above): the season they still have ahead; once that
 * season's exams are over, the NEXT season (that's what Adrian is entering
 * now); with nothing saved, the active season — or the next one in a gap.
 */
export function defaultEditExamType(pick: SeasonPick, active: ExamType | null, today: Date = new Date()): string | null {
  if (pick.examType && pick.upcoming) return pick.examType;
  if (pick.examType) return nextExamType(active, today) ?? active ?? pick.examType;
  return active ?? nextExamType(null, today);
}
