// Server-side reads for "From Adrian" assigned work (service role — the table
// is RLS-locked to the student's own rows, but every portal page already runs
// with the admin client after resolving the student, so keep one path).
// Pure helpers live in lib/assignments.ts; this file is the I/O.
import { getSupabaseAdmin } from './supabase';
import { portalIdentity, sessionAccount } from './portal-auth';
import { pendingCount, STUDENT_HIDDEN_STATUSES, type AssignmentRow } from './assignments';
import { paperSubjectFromName, subjectAllowed, type SubjectAccount } from './portal-subjects';

// PostgREST `not.in` filter for the statuses a student must never see. 'held'
// (6 Sep 2026) joined 'revoked' here: a Practice Again row exists from the
// moment the sheet worker finishes but must stay invisible until Adrian's
// Approve & release — so the exclusion lives in the QUERY, not after the fetch.
const HIDDEN = `(${STUDENT_HIDDEN_STATUSES.join(',')})`;

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
    .not('status', 'in', HIDDEN)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AssignmentRow[];
  return account ? rows.filter(r => assignmentVisible(r, account)) : rows;
}

export async function getStudentAssignment(id: string, airtableStudentId: string): Promise<AssignmentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await getSupabaseAdmin()
    .from('portal_assignments').select('*')
    .eq('id', id).eq('airtable_student_id', airtableStudentId).not('status', 'in', HIDDEN)
    .maybeSingle();
  return (data as AssignmentRow | null) || null;
}

/**
 * Paper names for Practice Again items ("From AM 2021 P1"), keyed by run id.
 * Scoped to the student's OWN runs in the query — a source_run_id is server-
 * written, but the identity predicate rides every student read regardless.
 * Fail-soft: an empty map only drops the label.
 */
export async function paperNamesForStudent(airtableStudentId: string, runIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!runIds.length) return out;
  try {
    const { data } = await getSupabaseAdmin()
      .from('paper_marking_runs').select('id, paper_name')
      .in('id', runIds.slice(0, 100)).eq('student_id', airtableStudentId);
    for (const r of (data || []) as { id: string; paper_name: string | null }[]) {
      if (r.paper_name) out.set(r.id, r.paper_name);
    }
  } catch { /* the label is a nicety */ }
  return out;
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
