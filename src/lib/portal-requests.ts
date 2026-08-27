// Server-side reads for student resource requests (service role — the
// portal_requests table is RLS-locked with no policies, service-role only).
// Pure helpers live in lib/requests.ts; this file is the I/O — the same split
// as lib/assignments.ts / lib/portal-assignments.ts.
import { getSupabaseAdmin } from './supabase';
import type { PortalRequestRow } from './requests';

/** The student's own requests, newest first. 50 is months of history at the
 *  2-a-day cap. */
export async function listStudentRequests(airtableStudentId: string): Promise<PortalRequestRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('portal_requests').select('*')
    .eq('airtable_student_id', airtableStudentId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []) as PortalRequestRow[];
}
