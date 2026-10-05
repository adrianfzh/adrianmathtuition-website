// 📝 A paper the tutor marked ON PAPER, kept in the app (Adrian, 5 Oct 2026: "allow
// students to upload physically marked copies of exam papers - so they have one place
// they can keep track (i will still mark physically - up to two physical papers can be
// marked per week)").
//
// The student photographs (or scans) the hand-marked copy; it is filed in Papers like
// any paper, tagged "Marked by your tutor", with NO computer marking. Only the total
// is read — one look at the pages for the circled / written total — so the score shows
// in the list and the trends; when that read is not sure, the student types it.
// No limit on uploads (Adrian, 5 Oct 2026: "2-a-week limit is papers i actually mark"
// — the two a week is his own marking in person, not what students may file here).
// Switch: TUTOR_MARKED_UPLOAD_OPEN_TO_STUDENTS (lib/portal-beta).
//
// Pure — tested. The one read of the total is lib/tutor-marked-reader.

/** The most pages one hand-marked paper may carry (the hand-in's own cap). */
export const TUTOR_MARKED_MAX_PAGES = 30;
/** The tag on the card and the paper page. */
export const TUTOR_MARKED_TAG = 'Marked by your tutor';

export type TotalRead = { awarded: number; max: number; sure: boolean };

/**
 * A score typed by the student, or read off the page: whole marks (the totals
 * columns are integers), 0 ≤ awarded ≤ max, max 1..300. Null when it does not make sense.
 */
export function checkScore(awarded: unknown, max: unknown): { awarded: number; max: number } | null {
  const a = typeof awarded === 'string' ? Number(awarded.trim()) : Number(awarded);
  const m = typeof max === 'string' ? Number(max.trim()) : Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(m)) return null;
  if (a < 0 || m < 1 || m > 300 || a > m) return null;
  if (!Number.isInteger(a) || !Number.isInteger(m)) return null;
  return { awarded: a, max: m };
}

/**
 * The reader's JSON: {"awarded": 52, "max": 80, "sure": true}, tolerant of a code
 * fence. Anything missing, contradictory or not "sure" reads as not sure — the
 * student is then asked to type the score. Pure.
 */
export function parseTotalRead(raw: string): TotalRead | null {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const ok = checkScore(j.awarded, j.max);
    if (!ok) return null;
    return { ...ok, sure: j.sure === true };
  } catch { return null; }
}

/**
 * The paper_marking_runs row a tutor-marked paper is filed as. Released at once
 * (it is already marked), `results: []` so every list treats it as a marked paper
 * with no questions, the pages as its page images, the totals as its score. NOT
 * `portal_submission` — that stamp means "a hand-in for the marker" to the caps,
 * the desk and the queue. `queue_status` stays null: nothing ever marks it.
 */
export function tutorMarkedRunRow(o: {
  studentId: string; studentName: string; paperName: string; paperSubject: string | null;
  pageUrls: readonly string[]; awarded: number; max: number;
  scoreFrom: 'read' | 'typed'; at: string;
}) {
  return {
    source: 'tutor-marked',
    paper_name: o.paperName,
    student_id: o.studentId,
    student_name: o.studentName,
    subject: 'math',
    paper_subject: o.paperSubject,
    num_photos: o.pageUrls.length,
    num_questions: 0,
    total_awarded: o.awarded,
    total_max: o.max,
    released_at: o.at,
    released_via: 'tutor-marked',
    result_json: {
      results: [],
      tutor_marked: { at: o.at, score_from: o.scoreFrom, awarded: o.awarded, max: o.max },
      totals: { awarded: o.awarded, max: o.max },
      source: { photos: o.pageUrls.map((u, i) => ({ photo_index: i, original_url: u })) },
      annotated_photos: o.pageUrls.map((u, i) => ({ photo_index: i, url: u })),
    },
  };
}

/** Is this run a paper the tutor marked on paper? Reads result_json.tutor_marked. */
export function isTutorMarked(resultJson: unknown): boolean {
  return !!resultJson && typeof resultJson === 'object' && !!(resultJson as { tutor_marked?: unknown }).tutor_marked;
}
