// The practice grader's daily limits — pure, tested (Phase G, re-done 5 Oct 2026).
//
// Every graded attempt is an Opus call, so a script must not be able to run up
// the bill. Two numbers:
//   - DAILY_GRADE_CAP (20, lib/practice-grade.ts): what the student starts
//     themselves — the practice list, a question they found, a photo they turned
//     into practice, and any RE-grade of work already marked.
//   - DAILY_GRADE_HARD_CAP (60): everything, including work Adrian sent. Nobody
//     does sixty marked questions in a day; a loop does.
// Before 5 Oct 2026 any assignment except a 'find' one skipped the cap entirely,
// so a self-made practice-photo row, or one marked row graded again and again,
// had no limit at all (leak audit, 5 Oct 2026).
import { DAILY_GRADE_CAP } from './practice-grade';

export const DAILY_GRADE_HARD_CAP = 60;

/** Assignment sources the STUDENT creates — never exempt from the daily cap. */
export const STUDENT_MADE_SOURCES: readonly string[] = ['find', 'practice-photo'];

export interface GradeLimitInput {
  /** The assignment this attempt answers, if any (already ownership-checked). */
  assignment: { source?: string | null; status?: string | null } | null;
  /** Graded portal attempts by this student in the last 24 hours. */
  countToday: number;
}

export type GradeLimitResult = { ok: true } | { ok: false; message: string };

/** True when this attempt is Adrian-sent work the student has not been marked on yet. */
export function isCapExempt(assignment: GradeLimitInput['assignment']): boolean {
  if (!assignment) return false;
  if (STUDENT_MADE_SOURCES.includes(String(assignment.source ?? ''))) return false;
  return assignment.status !== 'marked';
}

export function gradeLimit({ assignment, countToday }: GradeLimitInput): GradeLimitResult {
  if (countToday >= DAILY_GRADE_HARD_CAP) {
    return { ok: false, message: `That’s ${DAILY_GRADE_HARD_CAP} marked answers today — the most in one day. Back tomorrow!` };
  }
  if (!isCapExempt(assignment) && countToday >= DAILY_GRADE_CAP) {
    return { ok: false, message: `Daily limit reached (${DAILY_GRADE_CAP} marked answers). Work from Adrian still gets marked. Back tomorrow!` };
  }
  return { ok: true };
}

// 💡 Hints (5 Oct 2026). A hint is written once per question by a model and then
// cached for everyone, so normal use is cheap — but any bank question id can be
// asked for, so a script walking the bank would pay for a model call per id.
// A student may cause at most this many NEW hints a day; cached ones are free.
export const DAILY_HINT_WRITE_CAP = 30;
export const HINT_LIMIT_MARKDOWN = 'You’ve opened a lot of new hints today. More tomorrow — try the question first!';

export function hintWriteAllowed(writesToday: number): boolean {
  return writesToday < DAILY_HINT_WRITE_CAP;
}

// 📷 Photo reads (5 Oct 2026). Practice photo and "Write my sheet" ask the bot to
// read each photo (a vision model) BEFORE their own daily allowances are spent —
// an unreadable or unfiled photo did not count, so a loop could read forever.
// Every read is now counted on portal_event_log (`photo:read`), whatever comes back.
export const DAILY_PHOTO_READ_CAP = 30;
export const PHOTO_READ_LIMIT_MESSAGE = 'That’s a lot of photos read today. Try again tomorrow!';

/** May `n` more photo reads happen when `readsToday` already have? */
export function photoReadsAllowed(readsToday: number, n = 1): boolean {
  return readsToday + n <= DAILY_PHOTO_READ_CAP;
}
