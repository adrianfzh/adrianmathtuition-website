// O-Level grade bands + result helpers shared by the exams admin UI and API.
// Results are ADMIN-ONLY — never expose grades/scores to the student portal.

export interface GradeBand {
  grade: string;
  min: number; // inclusive lower bound on percentage
}

// Singapore O-Level grade bands (percentage → grade).
const O_LEVEL_BANDS: GradeBand[] = [
  { grade: 'A1', min: 75 },
  { grade: 'A2', min: 70 },
  { grade: 'B3', min: 65 },
  { grade: 'B4', min: 60 },
  { grade: 'C5', min: 55 },
  { grade: 'C6', min: 50 },
  { grade: 'D7', min: 45 },
  { grade: 'E8', min: 40 },
  { grade: 'F9', min: 0 },
];

/** Percentage (0–100, 1 d.p.) from score/total, or null if not computable. */
export function examPercent(score: number | null | undefined, total: number | null | undefined): number | null {
  if (score == null || total == null || !(total > 0)) return null;
  return Math.round((score / total) * 1000) / 10;
}

/** O-Level grade from a percentage, or '' if null. */
export function gradeFromPercent(pct: number | null): string {
  if (pct == null) return '';
  for (const b of O_LEVEL_BANDS) {
    if (pct >= b.min) return b.grade;
  }
  return 'F9';
}

/** Grade straight from score/total (convenience). */
export function gradeFromScore(score: number | null | undefined, total: number | null | undefined): string {
  return gradeFromPercent(examPercent(score, total));
}

export type ResultTone = 'good' | 'ok' | 'weak';

/** Colour bucket for a percentage: green ≥70, amber 50–69, red <50. */
export function resultTone(pct: number | null): ResultTone | null {
  if (pct == null) return null;
  if (pct >= 70) return 'good';
  if (pct >= 50) return 'ok';
  return 'weak';
}

export const RESULT_TONE_COLORS: Record<ResultTone, { fg: string; bg: string }> = {
  good: { fg: '#059669', bg: '#d1fae5' },
  ok:   { fg: '#d97706', bg: '#fef3c7' },
  weak: { fg: '#dc2626', bg: '#fee2e2' },
};

/** EOY is labelled "Prelims" for Sec 4 / Sec 5 students. */
export function examTypeLabel(examType: string, studentLevel: string): string {
  if (examType === 'EOY') {
    const l = (studentLevel || '').toLowerCase();
    if (l === 'sec 4' || l === 'sec 5') return 'Prelims';
  }
  return examType;
}

export const EXAM_TYPES: string[] = ['WA1', 'WA2', 'WA3', 'EOY'];
