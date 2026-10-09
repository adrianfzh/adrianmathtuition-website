// The print record for re-lettered parts (SPEC-PART-SYLLABUS.md §Re-lettering, 9 Oct 2026).
//
// A student's page may call the bank's (b)(iii) "(b)(ii)" (lib/part-syllabus.ts). On
// screen the attempt stores the map it was shown with (student_attempts.marking_json
// .partLabels). A PRINTED sheet is handed in days later — so every surface that prints a
// re-lettered question writes one row here first: which sheet, which question, and what
// each shown letter was in the bank at that moment. The marker reads this row, never the
// bank as it stands on the day of marking.
//
// The rule that makes it a guarantee: a re-lettered question whose row could not be
// written is LEFT OFF the sheet. No record, no print.
//
// Nothing is written for a question whose letters are the bank's own — which is every
// question until a part is marked. Table: migrations/part_label_prints.sql.
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasRenames, partLabelsOf, printedLabelRows, storedOriginalKey } from './part-syllabus';

export const PRINT_TABLE = 'part_label_prints';

/**
 * Record what this sheet calls each part, and hand back the items that may print:
 * everything whose letters are the bank's own, plus every re-lettered question whose
 * record is safely stored.
 */
export async function recordPrintedLabels<T extends { id?: unknown }>(
  sb: SupabaseClient,
  meta: { surface: string; ref?: string | null; student?: string | null },
  items: readonly T[],
): Promise<T[]> {
  const rows = printedLabelRows(meta, items);
  if (!rows.length) return [...items];
  const { error } = await sb.from(PRINT_TABLE).insert(rows);
  if (!error) return [...items];
  console.error(`[part-label-prints] ${meta.surface}: record failed (${error.message}) — ${rows.length} re-lettered question(s) left off the sheet`);
  return items.filter((it) => !hasRenames(partLabelsOf(it)));
}

/**
 * What a printed sheet called a part → the bank's part key. Takes the record written
 * when THAT sheet was printed (by its ref); with no ref, the latest print of the question
 * for that student before `before`. No record → the letters were the bank's own.
 */
export async function printedOriginalKey(
  sb: SupabaseClient,
  q: { surface?: string; ref?: string | null; student?: string | null; questionId: string; before?: string },
  shownLabel: string,
): Promise<string> {
  let query = sb.from(PRINT_TABLE).select('labels').eq('question_id', q.questionId);
  if (q.surface) query = query.eq('surface', q.surface);
  if (q.ref) query = query.eq('ref', q.ref);
  else if (q.student) query = query.eq('student', q.student);
  if (q.before) query = query.lte('created_at', q.before);
  const { data } = await query.order('created_at', { ascending: false }).limit(1);
  return storedOriginalKey(data?.[0]?.labels, shownLabel);
}
