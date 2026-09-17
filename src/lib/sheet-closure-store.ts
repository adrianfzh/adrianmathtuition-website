// Closure tracking — the Supabase half (lib/sheet-closure.ts is the pure half).
// Called after a Practice Again hand-in is released: finds the sheet it answers,
// scores each of that sheet's sections, writes sheet_section_outcomes, and says
// one line on the marking topic. Fail-soft everywhere: a closure that cannot be
// computed is a warning, never a failed release.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sectionOutcomes, returnedQuestions, closureLine, type ClosureSection } from './sheet-closure';

type RunLite = { id: string; student_id: string | null; student_name?: string | null; paper_name: string | null; result_json: unknown };

/** The sheet job a returned Practice Again hand-in answers: the newest done
 *  job on its source run (the bot stamps paper_match.practice_again when it
 *  attaches the sheet; the assignment's sheet_job_id is the belt). */
async function sheetJobFor(sb: SupabaseClient, run: RunLite): Promise<{ id: string; run_id: string } | null> {
  const rj = (run.result_json ?? {}) as { paper_match?: { practice_again?: { source_run_id?: string; assignment_id?: string } }; assignment_id?: string };
  const pa = rj.paper_match?.practice_again;
  const assignmentId = pa?.assignment_id || rj.assignment_id;
  if (assignmentId) {
    const { data: a } = await sb.from('portal_assignments').select('sheet_job_id, source_run_id').eq('id', assignmentId).maybeSingle();
    if (a?.sheet_job_id) return { id: a.sheet_job_id as string, run_id: (a.source_run_id as string) || '' };
  }
  const sourceRun = pa?.source_run_id;
  if (!sourceRun) return null;
  const { data: j } = await sb.from('sheet_jobs').select('id, run_id').eq('status', 'done').or(`run_id.eq.${sourceRun},run_ids.cs.{${sourceRun}}`)
    .order('completed_at', { ascending: false }).limit(1).maybeSingle();
  return j ? { id: j.id as string, run_id: j.run_id as string } : null;
}

export async function recordSheetClosure(sb: SupabaseClient, run: RunLite, notify?: (line: string) => Promise<unknown>): Promise<{ ok: boolean; line?: string; reason?: string }> {
  try {
    const job = await sheetJobFor(sb, run);
    if (!job) return { ok: false, reason: 'no sheet job found for this hand-in' };
    const { data: rows, error } = await sb.from('sheet_sections').select('id, section_index, title, practice_texts').eq('job_id', job.id).order('section_index');
    if (error) return { ok: false, reason: error.message };
    const sections = (rows ?? []) as ClosureSection[];
    if (!sections.length) return { ok: false, reason: 'the sheet has no sections in the bank' };
    const returned = returnedQuestions((run.result_json as { results?: unknown } | null)?.results);
    const outcomes = sectionOutcomes(sections, returned);
    const upserts = outcomes.map(o => ({ section_id: o.section_id, job_id: job.id, run_id: run.id, student_id: run.student_id, outcome: o.outcome, awarded: o.awarded, max: o.max, matched: o.matched }));
    const { error: e2 } = await sb.from('sheet_section_outcomes').upsert(upserts, { onConflict: 'section_id,run_id' });
    if (e2) return { ok: false, reason: e2.message };
    const line = `📘 ${run.student_name || run.student_id || 'a student'} — Practice Again returned: ${closureLine(outcomes)}` +
      outcomes.filter(o => o.outcome === 'still_failing').map(o => `\n   still failing: ${sections.find(s => s.id === o.section_id)?.title || o.section_id}`).join('');
    if (notify) await notify(line).catch(() => {});
    return { ok: true, line };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** The bank's closure numbers per section title (for the Monday line and the
 *  bank's ranking): attempts, closed, still failing. */
export async function closureSummary(sb: SupabaseClient, days = 30): Promise<{ attempts: number; closed: number; slip: number; stillFailing: number; worst: { title: string; stillFailing: number; attempts: number }[] }> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await sb.from('sheet_section_outcomes').select('outcome, section:sheet_sections(title)').gte('created_at', since).neq('outcome', 'unknown').limit(2000);
  const rows = (data ?? []) as Array<{ outcome: string; section: { title: string } | { title: string }[] | null }>;
  const byTitle = new Map<string, { attempts: number; stillFailing: number }>();
  let closed = 0, slip = 0, stillFailing = 0;
  for (const r of rows) {
    const t = Array.isArray(r.section) ? r.section[0]?.title : r.section?.title;
    const key = String(t || '?');
    const v = byTitle.get(key) ?? { attempts: 0, stillFailing: 0 };
    v.attempts += 1;
    if (r.outcome === 'closed') closed += 1; else if (r.outcome === 'slip') slip += 1; else { stillFailing += 1; v.stillFailing += 1; }
    byTitle.set(key, v);
  }
  const worst = [...byTitle.entries()].filter(([, v]) => v.stillFailing > 0).sort((a, b) => b[1].stillFailing - a[1].stillFailing).slice(0, 5).map(([title, v]) => ({ title, ...v }));
  return { attempts: rows.length, closed, slip, stillFailing, worst };
}
