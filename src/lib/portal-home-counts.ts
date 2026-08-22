// Live numbers for the Home tiles — how many marked papers a student has and
// how many portal hand-ins are still with Adrian. Two HEAD counts, fail-soft
// (zeros on any error) so a Supabase hiccup can never blank the dashboard.
// Same predicates as /app/marking: released papers; portal submissions
// (result_json.portal_submission stamp) not yet released.
import { getSupabaseAdmin } from './supabase';

export type HomeCounts = { marked: number; beingMarked: number };

export async function homeCounts(airtableStudentId: string | null): Promise<HomeCounts> {
  if (!airtableStudentId) return { marked: 0, beingMarked: 0 };
  try {
    const sb = getSupabaseAdmin();
    const [released, pending] = await Promise.all([
      sb.from('paper_marking_runs').select('id', { count: 'exact', head: true })
        .eq('student_id', airtableStudentId).not('released_at', 'is', null),
      sb.from('paper_marking_runs').select('id', { count: 'exact', head: true })
        .eq('student_id', airtableStudentId).eq('result_json->>portal_submission', 'true').is('released_at', null),
    ]);
    return { marked: released.count ?? 0, beingMarked: pending.count ?? 0 };
  } catch {
    return { marked: 0, beingMarked: 0 };
  }
}
