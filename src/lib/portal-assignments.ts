// Server-side reads for "From Adrian" assigned work (service role — the table
// is RLS-locked to the student's own rows, but every portal page already runs
// with the admin client after resolving the student, so keep one path).
// Pure helpers live in lib/assignments.ts; this file is the I/O.
import { getSupabaseAdmin } from './supabase';
import { portalIdentity, sessionAccount } from './portal-auth';
import { pendingCount, type AssignmentRow } from './assignments';
import { paperSubjectFromName, subjectAllowed, type SubjectAccount } from './portal-subjects';

/**
 * The subject gate on an assignment (SPEC-PORTAL-V2 §2). A row carries its
 * subject only through `level` — a QB level key ('AM', 'S3_EM', 'JC2') or the
 * free text the Send-work card wrote ('Sec 4 AM') — so the paper-name rule
 * reads it. A row with no level, or one naming no subject, passes: the gate
 * hides work a student is not entitled to, never work it cannot classify.
 */
export function assignmentVisible(row: Pick<AssignmentRow, 'level'>, account: SubjectAccount | null | undefined): boolean {
  return subjectAllowed(account, paperSubjectFromName(row.level));
}

/** The student's non-revoked rows, newest first — gated to the account's
 *  subjects when the caller passes the account (every student read should). */
export async function listStudentAssignments(airtableStudentId: string, account?: SubjectAccount | null): Promise<AssignmentRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('portal_assignments').select('*')
    .eq('airtable_student_id', airtableStudentId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AssignmentRow[];
  return account ? rows.filter(r => assignmentVisible(r, account)) : rows;
}

export async function getStudentAssignment(id: string, airtableStudentId: string): Promise<AssignmentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await getSupabaseAdmin()
    .from('portal_assignments').select('*')
    .eq('id', id).eq('airtable_student_id', airtableStudentId).neq('status', 'revoked')
    .maybeSingle();
  return (data as AssignmentRow | null) || null;
}

/** Pending count for the 🏠 tab dot. Resolves the student via the per-request
 *  cached sessionAccount() (shared with the page's own auth in the same render
 *  pass); 0 for an admin cookie with no student session, and 0 on any error —
 *  a badge must never break the shell. */
export async function pendingAssignmentCountForSession(): Promise<number> {
  try {
    const acct = await sessionAccount();
    if (!acct) return 0;
    const { data } = await getSupabaseAdmin()
      .from('portal_assignments').select('status, level')
      // portalIdentity: rec… for tuition, acct:<uuid> for strangers.
      .eq('airtable_student_id', portalIdentity(acct))
      .in('status', ['assigned', 'submitted']);
    // Same subject gate as the list, so the dot never counts a row the list hides.
    const rows = ((data || []) as { status: AssignmentRow['status']; level: string | null }[])
      .filter(r => assignmentVisible(r, acct));
    return pendingCount(rows);
  } catch {
    return 0;
  }
}
