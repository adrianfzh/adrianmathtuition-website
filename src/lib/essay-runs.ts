// essay_runs — the rows behind the Languages family (SPEC-ESSAY-MARKING.md, 12
// Sep 2026). Service-key reads scoped by the portal identity: a row that is not
// the student's simply does not come back. Kept apart from paper_marking_runs
// (a different shape; the desk's maths lanes must not fill with essays).
import { getSupabaseAdmin } from './supabase';
import type { EssayReport, EssayStatus } from './essay-report';

export interface EssayRunRow {
  id: string;
  created_at: string;
  airtable_student_id: string;
  student_name: string | null;
  subject: string;
  syllabus: string;
  level: string | null;
  essay_kind: string;
  question: string | null;
  essay_text: string;
  word_count: number | null;
  status: EssayStatus;
  marked_at: string | null;
  released_at: string | null;
  report: EssayReport | null;
  bands: Record<string, unknown> | null;
  code_counts: Record<string, number> | null;
  held_reason: string | null;
  error: string | null;
  source: string;
}

/** The list card's columns — never the essay text or the report. */
export const ESSAY_LIST_COLUMNS =
  'id, created_at, airtable_student_id, student_name, subject, syllabus, level, essay_kind, question, word_count, status, marked_at, released_at, bands, code_counts, held_reason, source';

export type EssayListRow = Omit<EssayRunRow, 'essay_text' | 'report' | 'error'>;

/** A student's own essays, newest first. */
export async function loadEssaysFor(identity: string, limit = 50): Promise<EssayListRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('essay_runs').select(ESSAY_LIST_COLUMNS)
    .eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EssayListRow[];
}

/**
 * One essay with its text and report. `identity` scopes it to the student;
 * pass null for Adrian's admin view, which may open any essay.
 */
export async function loadEssay(id: string, identity: string | null): Promise<EssayRunRow | null> {
  const sb = getSupabaseAdmin();
  let q = sb.from('essay_runs').select('*').eq('id', id);
  if (identity) q = q.eq('airtable_student_id', identity);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EssayRunRow | null) ?? null;
}

/** Every essay, newest first — the admin list. */
export async function loadAllEssays(limit = 100): Promise<EssayListRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('essay_runs').select(ESSAY_LIST_COLUMNS)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EssayListRow[];
}

/** How many essays this identity handed in since the Singapore day began. */
export async function countEssaysToday(identity: string, sinceISO: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { count, error } = await sb.from('essay_runs').select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', identity).gte('created_at', sinceISO);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
