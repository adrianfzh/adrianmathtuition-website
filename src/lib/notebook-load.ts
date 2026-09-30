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
import { attachQuestions, groupMistakes, notebookSubject, splitBySubject, type NotebookGroupWithCards, type NotebookGroups } from './notebook-groups';
import { buildStudentMarking, type MarkingRunRow, type StudentPaper } from './portal-marking';
import { isScienceSubject, subjectAllowed } from './portal-subjects';

/** One subject's tab (30 Sep 2026): its own list and its own weakest topics. */
export interface NotebookSubjectPanel {
  subject: string;
  groups: NotebookGroups;
  /** The groups with one card per lost-marks question (1 Oct 2026); the page renders each card's comparison. */
  cardGroups: NotebookGroupWithCards[];
  /** The subject's released papers, by id — the questions the cards show. */
  papers: Map<string, StudentPaper>;
  weakest: { topic: string; pct: number }[];
}

export interface NotebookLoad {
  /** One per subject that has a mistake, in tab order; empty when the list is. */
  subjects: NotebookSubjectPanel[];
  defaultSubject: string | null;
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
  const [mistakes, runs] = await Promise.all([
    // The read applies the 14-day "Corrected" → Fixed sweep on the way out.
    loadMistakes(svc, sid).catch((): MistakeRow[] => []),
    // Weakest topics: the same released + subject-gated rows the Papers tab lists.
    getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('id, created_at, paper_name, total_awarded, total_max, released_at, result_json, paper_subject')
      .eq('student_id', sid).not('released_at', 'is', null).is('superseded_by', null)
      .order('created_at', { ascending: false }).limit(WEAKEST_MAX_PAPERS)
      .then(r => {
        return ((r.data ?? []) as MarkingRunRow[]).filter(x => subjectAllowed(account, x.paper_subject) || isScienceSubject(x.paper_subject));
      }, () => [] as MarkingRunRow[]),
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

  // Weakest topics per subject: an A Math focus line under a Physics tab would send the student the wrong way.
  const marking = (list: MarkingRunRow[]) => buildStudentMarking(list, { studentName: account.display_name ?? null });
  const weakestOf = (list: MarkingRunRow[]) => marking(list).focus.map(t => ({ topic: t.topic, pct: t.pct }));
  const split = splitBySubject(shown);
  const subjects = split.subjects.map(({ subject, rows }) => {
    const list = runs.filter(x => notebookSubject(x.paper_subject) === subject);
    const { papers, focus } = marking(list);
    const groups = groupMistakes(rows, practiceFor);
    return {
      subject,
      groups,
      cardGroups: attachQuestions(groups.groups, papers),
      papers: new Map(papers.map(p => [p.id, p])),
      weakest: focus.map(t => ({ topic: t.topic, pct: t.pct })),
    };
  });

  return { subjects, defaultSubject: split.defaultSubject, groups: groupMistakes(shown, practiceFor), weakest: weakestOf(runs.filter(x => !isScienceSubject(x.paper_subject))) };
}
