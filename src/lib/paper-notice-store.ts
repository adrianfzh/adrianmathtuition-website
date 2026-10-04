// The one write behind a read-once paper notice (lib/paper-notice.ts
// READ_ONCE_KINDS): stamp `result_json.student_notice.seen_at` the first time
// the student's own render shows it. An atomic Postgres function
// (migrations/paper_notice_seen.sql) — it touches only that key, only when the
// run is the student's and the stamp is not there yet.
//
// FAIL-SOFT: a failed stamp leaves the line up for one more view, which is the
// harmless direction; it never breaks the page.
import { getSupabaseAdmin } from './supabase';
import { READ_ONCE_KINDS } from './paper-notice';

export async function stampNoticesSeen(runIds: string[], studentId: string): Promise<void> {
  if (!runIds.length || !studentId) return;
  const sb = getSupabaseAdmin();
  await Promise.all(runIds.map(async (id) => {
    try {
      const { error } = await sb.rpc('stamp_paper_notice_seen', { p_run_id: id, p_student_id: studentId, p_kinds: [...READ_ONCE_KINDS] });
      if (error) console.warn('[paper-notice] seen stamp failed:', error.message);
    } catch (e) { console.warn('[paper-notice] seen stamp failed:', (e as Error).message); }
  }));
}
