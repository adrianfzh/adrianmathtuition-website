// The mark subjects a student is entitled to hand in for, read from their
// Airtable enrolment. Kept apart from the pure gate (mark-subject-for-student)
// because this half does I/O; the gate stays testable without a network.
import { airtableRequest } from './airtable';
import { markSubjectsFromEnrolment } from './mark-subject-for-student';
import type { MarkSubject } from './mark-subjects';

/**
 * `Students.Subjects` → mark subjects, for one tuition student (a rec… id).
 * Strangers and any failure return ['math'] — the safe default that changes
 * nothing. Single-record GET can't use fields[] (Airtable ignores it there), so
 * we fetch the record and read the one field.
 */
export async function enrolledMarkSubjects(airtableStudentId: string | null | undefined): Promise<MarkSubject[]> {
  const id = String(airtableStudentId || '');
  if (!/^rec[A-Za-z0-9]+$/.test(id)) return ['math'];
  try {
    const rec = await airtableRequest('Students', `/${id}`);
    return markSubjectsFromEnrolment(rec?.fields?.['Subjects']);
  } catch {
    return ['math'];
  }
}
