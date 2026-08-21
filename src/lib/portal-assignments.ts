// Server-side reads for "From Adrian" assigned work (service role — the table
// is RLS-locked to the student's own rows, but every portal page already runs
// with the admin client after resolving the student, so keep one path).
// Pure helpers live in lib/assignments.ts; this file is the I/O.
import { getSupabaseAdmin } from './supabase';
import { createSupabaseServer } from './supabase-server';
import { pendingCount, type AssignmentRow } from './assignments';

export async function listStudentAssignments(airtableStudentId: string): Promise<AssignmentRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('portal_assignments').select('*')
    .eq('airtable_student_id', airtableStudentId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as AssignmentRow[];
}

export async function getStudentAssignment(id: string, airtableStudentId: string): Promise<AssignmentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await getSupabaseAdmin()
    .from('portal_assignments').select('*')
    .eq('id', id).eq('airtable_student_id', airtableStudentId).neq('status', 'revoked')
    .maybeSingle();
  return (data as AssignmentRow | null) || null;
}

/** Pending count for the 🏠 tab dot. Resolves the student from the Supabase
 *  session itself (the layout doesn't call currentStudent()); 0 for an admin
 *  cookie with no student session, and 0 on any error — a badge must never
 *  break the shell. */
export async function pendingAssignmentCountForSession(): Promise<number> {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data: acct } = await supabase
      .from('portal_accounts').select('airtable_student_id').eq('id', user.id).maybeSingle();
    if (!acct?.airtable_student_id) return 0;
    const { data } = await getSupabaseAdmin()
      .from('portal_assignments').select('status')
      .eq('airtable_student_id', acct.airtable_student_id)
      .in('status', ['assigned', 'submitted']);
    return pendingCount((data || []) as { status: AssignmentRow['status'] }[]);
  } catch {
    return 0;
  }
}
