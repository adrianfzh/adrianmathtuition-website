// Live numbers for the Home tiles — how many marked papers a student has and
// how many portal hand-ins are still with Adrian. Two small reads, fail-soft
// (zeros on any error) so a Supabase hiccup can never blank the dashboard.
// Same predicates as /app/marking: released papers, gated to the subjects on
// the account (SPEC-PORTAL-V2 §2 — the tile must count what the list shows);
// portal submissions (result_json.portal_submission stamp) not yet released.
import { getSupabaseAdmin } from './supabase';
import { subjectAllowed, type SubjectAccount } from './portal-subjects';

export type HomeCounts = { marked: number; beingMarked: number };

export async function homeCounts(airtableStudentId: string | null, account?: SubjectAccount | null): Promise<HomeCounts> {
  if (!airtableStudentId) return { marked: 0, beingMarked: 0 };
  try {
    const sb = getSupabaseAdmin();
    const [released, pending] = await Promise.all([
      // A student's released papers number in the tens, so the subject gate
      // runs over the rows here rather than as a PostgREST `or` filter —
      // one pure predicate (subjectAllowed) shared with the Papers page.
      sb.from('paper_marking_runs').select('paper_subject')
        .eq('student_id', airtableStudentId).not('released_at', 'is', null).is('superseded_by', null),
      sb.from('paper_marking_runs').select('id', { count: 'exact', head: true })
        .eq('student_id', airtableStudentId).eq('result_json->>portal_submission', 'true').is('released_at', null),
    ]);
    const rows = (released.data ?? []) as { paper_subject: string | null }[];
    const marked = account ? rows.filter(r => subjectAllowed(account, r.paper_subject)).length : rows.length;
    return { marked, beingMarked: pending.count ?? 0 };
  } catch {
    return { marked: 0, beingMarked: 0 };
  }
}
