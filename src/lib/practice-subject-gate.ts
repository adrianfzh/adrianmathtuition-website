// The subject gate applied to QB level keys (SPEC-PORTAL-V2.md §2).
//
// lib/qb-levels.qbLevelsFor already narrows a student's level list by their
// Airtable subjects; this is the explicit belt on top of it, expressed in the
// one vocabulary every other student read uses — allowedSubjects(account). A
// level key names its paper subject in its spelling ('AM', 'S3_AM' → A Math;
// 'EM', 'EM_NA', 'S3_EM' → E Math; 'JC1', 'JC2' → H2 Math), so the same
// paper-name rule reads it. Keys that name no subject ('S1', 'S2', the
// science keys) are not this gate's business and pass through.
//
// Pure, client-safe (no I/O) — the practice picker may call it too.
import { allowedSubjects, paperSubjectFromName, type PaperSubject, type SubjectAccount } from './portal-subjects';

/** The paper subject a QB level key belongs to, or null when it names none. */
export function subjectOfLevelKey(key: string): PaperSubject | null {
  return paperSubjectFromName(key);
}

/**
 * Keep only the levels whose subject the account may see. Never returns an
 * empty list when given a non-empty one: if the gate would hide everything
 * (a data mismatch — say a Sec 4 account tagged 'H2 Math'), the level-only list
 * stands, matching qbLevelsFor's own "nothing hidden by accident" fallback.
 */
export function gateLevelsBySubject<T extends { key: string }>(levels: readonly T[], account: SubjectAccount | null | undefined): T[] {
  const allowed = allowedSubjects(account);
  const kept = levels.filter(l => {
    const s = subjectOfLevelKey(l.key);
    return s === null || allowed.includes(s);
  });
  return kept.length ? kept : [...levels];
}
