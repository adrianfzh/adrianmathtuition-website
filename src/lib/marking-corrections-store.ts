// The insert half of Loop 1 (lib/marking-corrections.ts is the pure diff). Fail-soft by
// design: a correction row that does not land must NEVER fail the mark change Adrian just
// made — the change is the product, the row is the learning. Once-only by the table's
// unique key (run, question, part, field, corrected_at), so a retried write files nothing twice.
import type { SupabaseClient } from '@supabase/supabase-js';
import { diffCorrections, type CorrectionContext, type CorrectionRow } from './marking-corrections';

export async function insertCorrections(supa: SupabaseClient, rows: CorrectionRow[]): Promise<number> {
  if (!rows.length) return 0;
  try {
    const { error } = await supa.from('marking_corrections')
      .upsert(rows, { onConflict: 'run_id,question,part,field,corrected_at', ignoreDuplicates: true });
    if (error) { console.warn('[marking-corrections] not recorded:', error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.warn('[marking-corrections] not recorded:', (e as Error).message);
    return 0;
  }
}

/** Diff two versions of a run's result_json and file what changed. Never throws. */
export async function recordCorrections(supa: SupabaseClient, before: unknown, after: unknown, ctx: CorrectionContext): Promise<number> {
  let rows: CorrectionRow[] = [];
  try { rows = diffCorrections(before, after, ctx); } catch (e) { console.warn('[marking-corrections] diff failed:', (e as Error).message); }
  return insertCorrections(supa, rows);
}

/** The run's own columns the rows carry — one read, shared by every door. */
export const RUN_COLUMNS_FOR_CORRECTIONS = 'id, result_json, released_at, student_id, paper_name, paper_subject, subject';

export function contextFromRun(
  run: { id: string; student_id?: string | null; paper_name?: string | null; paper_subject?: string | null; subject?: string | null },
  source: CorrectionContext['source'], at: string, correctedBy = 'adrian', orgId = 'tuition',
): CorrectionContext {
  return { runId: run.id, source, at, correctedBy, orgId, studentId: run.student_id ?? null, paperName: run.paper_name ?? null, paperSubject: run.paper_subject ?? null, subject: run.subject ?? null };
}
