// One student's released marked papers + their (lazily synced) notebook rows —
// the assembly that both /api/portal/notebook and the plan surfaces (Home's
// focus card, /app/my-notes "My Notebook", /api/portal/plan) read. Lifted out
// of the notebook route
// 2026-08-26 (SPEC-REVISION-PLAN.md) so the plan can never drift from the
// notebook's view of the same rows: same run window, same release gate, same
// lazy sync (opening EITHER page backfills entries from newly released papers).
//
// I/O lives here; every judgement call stays in lib/notebook.ts and
// lib/portal-marking.ts (pure, tested).
import type { createServiceClient } from './supabase-server';
import { buildStudentMarking, type MarkingRunRow, type StudentPaper } from './portal-marking';
import { buildEntriesFromPapers, entryKey } from './notebook';

// Same window as /app/marking — the notebook and the plan are born from the
// same papers.
export const MAX_RUNS = 40;
const RUN_COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, pdf_url, released_at, result_json';

/** A notebook_entries row, as selected with `*`. */
export interface NotebookEntryRow {
  id: string;
  airtable_student_id: string;
  variant_qb_id: string | null;
  run_id: string;
  question_number: string;
  paper_name: string | null;
  paper_date: string | null;
  topic: string | null;
  awarded: number;
  max_marks: number;
  comment: string | null;
  slips: unknown;
  question_prompt: string | null;
  variant_question: string | null;
  variant_answer: string | null;
  variant_note: string | null;
  variant_origin: string | null;
  status: 'live' | 'archived';
  streak: number;
  next_due: string | null;
  attempts: unknown;
  archived_at: string | null;
}

export type PapersAndNotebook =
  | { ok: true; papers: StudentPaper[]; entries: NotebookEntryRow[] }
  | { ok: false; error: 'papers' | 'notebook' };

/**
 * Load the student's released papers and notebook entries, creating entries
 * for any newly released dropped-marks questions on the way (the lazy sync —
 * no cron; opening a page IS the sync).
 *
 * `sid` must be the SESSION's airtable_student_id, never client input — the
 * ownership filter here is the access control (notebook_entries has RLS with
 * no policies; students never read it directly).
 */
export async function loadPapersAndNotebook(
  svc: ReturnType<typeof createServiceClient>,
  sid: string,
  today: string,
): Promise<PapersAndNotebook> {
  const { data: runs, error: runsErr } = await svc
    .from('paper_marking_runs')
    .select(RUN_COLUMNS)
    .eq('student_id', sid)
    .not('released_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_RUNS);
  if (runsErr) return { ok: false, error: 'papers' };

  const { data: existing, error: exErr } = await svc
    .from('notebook_entries')
    .select('*')
    .eq('airtable_student_id', sid);
  if (exErr) return { ok: false, error: 'notebook' };

  const existingKeys = new Set(
    (existing ?? []).map(e => entryKey(e.run_id, e.question_number)),
  );
  const { papers } = buildStudentMarking((runs ?? []) as MarkingRunRow[]);
  const inserts = buildEntriesFromPapers(sid, papers, existingKeys, today);

  let rows = (existing ?? []) as NotebookEntryRow[];
  if (inserts.length) {
    // ignoreDuplicates makes a concurrent double-open race-safe (unique key
    // on student+run+question) — re-select rather than merging by hand.
    await svc.from('notebook_entries').upsert(inserts, {
      onConflict: 'airtable_student_id,run_id,question_number',
      ignoreDuplicates: true,
    });
    const { data: fresh } = await svc
      .from('notebook_entries')
      .select('*')
      .eq('airtable_student_id', sid);
    rows = (fresh ?? rows) as NotebookEntryRow[];
  }

  return { ok: true, papers, entries: rows };
}
