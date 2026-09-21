// My Notebook's loader (server only): the student's mistakes, grouped by the
// paper they were last seen on, plus the weakest-topics line — nothing else
// (Adrian, 21 Sep 2026: "we should really simplify"). Until then this loader
// also fetched photos, clippings, private notes, pages from Adrian and the
// upcoming exams for three Notebook pages; those pages are gone.
//
// Reads go through the service client scoped to the student's portal identity
// (rec… / acct:<uuid>) — notebook_mistakes has RLS with no policies, so this
// filter IS the access control. Both sources fail soft.
import { getSupabaseAdmin } from './supabase';
import { createServiceClient } from './supabase-server';
import type { PortalAccount } from './portal-auth';
import { loadMistakes, type MistakeRow } from './notebook-mistakes-store';
import { shownByDefault } from './notebook-mistakes';
import { groupMistakes, type NotebookGroups } from './notebook-groups';
import { buildStudentMarking, type MarkingRunRow } from './portal-marking';
import { subjectAllowed } from './portal-subjects';

export interface NotebookLoad {
  groups: NotebookGroups;
  /**
   * Weakest topics across the student's released papers — the "Work on next"
   * list that lived on Papers until 17 Sep 2026 (Adrian: Papers answers "how
   * did I do", the Notebook answers "what do I fix"). Same rule as the parent
   * report (buildStudentMarking → aggregateTopicBleed: ≥4 marks, <75 %, top 3).
   */
  weakest: { topic: string; pct: number }[];
}

/** Papers the weakest-topics line reads — a year is more than the rule needs. */
const WEAKEST_MAX_PAPERS = 40;

export async function loadNotebook(account: PortalAccount, sid: string): Promise<NotebookLoad> {
  const svc = createServiceClient();
  const [mistakes, weakest] = await Promise.all([
    // The read applies the 14-day "Corrected" → Fixed sweep on the way out.
    loadMistakes(svc, sid).catch((): MistakeRow[] => []),
    // Weakest topics: the same released + subject-gated rows the Papers tab lists.
    getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('id, created_at, paper_name, total_awarded, total_max, released_at, result_json, paper_subject')
      .eq('student_id', sid).not('released_at', 'is', null).is('superseded_by', null)
      .order('created_at', { ascending: false }).limit(WEAKEST_MAX_PAPERS)
      .then(r => {
        const rows = ((r.data ?? []) as MarkingRunRow[]).filter(x => subjectAllowed(account, x.paper_subject));
        return buildStudentMarking(rows, { studentName: account.display_name ?? null }).focus.map(t => ({ topic: t.topic, pct: t.pct }));
      }, () => [] as { topic: string; pct: number }[]),
  ]);

  // Removed entries stay in the table and leave every student surface; fixed
  // ones ride along for the "Fixed (n)" link.
  const shown = mistakes.filter(m => shownByDefault(m, true));

  // The Practice items that fix a mistake — one scoped query.
  const practiceById = new Map<string, { id: string; title: string }>();
  const linkedIds = [...new Set(shown.flatMap(m => m.practice_ids))];
  if (linkedIds.length) {
    try {
      const { data } = await svc.from('portal_assignments').select('id, title, status')
        .eq('airtable_student_id', sid).in('id', linkedIds.slice(0, 200));
      for (const a of data ?? []) {
        if (a.status === 'assigned' || a.status === 'submitted' || a.status === 'marked') {
          practiceById.set(String(a.id), { id: String(a.id), title: String(a.title || 'Practice') });
        }
      }
    } catch { /* the list still renders without its practice links */ }
  }
  const practiceFor = (m: MistakeRow) =>
    m.practice_ids.map(id => practiceById.get(id)).filter((p): p is { id: string; title: string } => !!p);

  return { groups: groupMistakes(shown, practiceFor), weakest };
}
