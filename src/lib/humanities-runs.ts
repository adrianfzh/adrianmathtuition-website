// humanities_runs — the rows behind the Humanities family (SPEC-HUMANITIES.md,
// 2 Oct 2026). Service-key reads scoped by the portal identity: a row that is
// not the student's simply does not come back.
import { getSupabaseAdmin } from './supabase';
import type { HumanitiesReport, HumanitiesStatus } from './humanities-report';

export interface HumanitiesRunRow {
  id: string;
  created_at: string;
  airtable_student_id: string;
  student_name: string | null;
  subject: string;
  skill: string;
  question_id: string;
  answer_text: string;
  word_count: number | null;
  status: HumanitiesStatus;
  marked_at: string | null;
  report: HumanitiesReport | null;
  level: number | null;
  level_lo: number | null;
  level_hi: number | null;
  levels_max: number | null;
  reads: unknown;
  held_reason: string | null;
  error: string | null;
  source: string;
  calibration_set: string | null;
  truth_level: number | null;
  cost_usd: number | null;
}

/** The list columns — never the answer text, the report or the reads. */
export const HUMANITIES_LIST_COLUMNS =
  'id, created_at, airtable_student_id, student_name, subject, skill, question_id, word_count, status, marked_at, level, level_lo, level_hi, levels_max, held_reason, source, calibration_set, truth_level, cost_usd';

export type HumanitiesListRow = Omit<HumanitiesRunRow, 'answer_text' | 'report' | 'reads' | 'error'>;

/** A student's own answers, newest first. */
export async function loadHumanitiesFor(identity: string, limit = 30): Promise<HumanitiesListRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('humanities_runs').select(HUMANITIES_LIST_COLUMNS)
    .eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HumanitiesListRow[];
}

/**
 * One answer with its text and report. A student identity scopes it to that
 * student; `{ admin: true }` = Adrian's admin view. A missing scope opens nothing
 * (5 Oct 2026 leak audit — see loadEssay).
 */
export async function loadHumanitiesRun(id: string, scope: string | { admin: true } | null): Promise<HumanitiesRunRow | null> {
  if (!scope) return null;
  const sb = getSupabaseAdmin();
  let q = sb.from('humanities_runs').select('*').eq('id', id);
  if (typeof scope === 'string') q = q.eq('airtable_student_id', scope);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HumanitiesRunRow | null) ?? null;
}

/** Every answer, newest first — the admin list; `set` narrows it to one bench run. */
export async function loadAllHumanities(limit = 100, set?: string | null): Promise<HumanitiesListRow[]> {
  const sb = getSupabaseAdmin();
  let q = sb.from('humanities_runs').select(HUMANITIES_LIST_COLUMNS).order('created_at', { ascending: false }).limit(limit);
  if (set) q = q.eq('calibration_set', set);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HumanitiesListRow[];
}

/** How many answers this identity handed in since the Singapore day began. */
export async function countHumanitiesToday(identity: string, sinceISO: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { count, error } = await sb.from('humanities_runs').select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', identity).gte('created_at', sinceISO);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
