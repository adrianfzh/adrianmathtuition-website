// The section bank — the Supabase half (see lib/sheet-sections.ts for the pure
// half and SPEC-SECTION-BANK.md). Every call is fail-soft: the bank must never
// stop a sheet from being filed or a job from completing.
import type { SupabaseClient } from '@supabase/supabase-js';
import { type SectionRow, type BankHit, searchTerms } from './sheet-sections';

const HIT_COLUMNS = 'id,title,gap,level,subject,student_name,paper_name,questions,docx_path,section_index,created_at,last_vetted_at,practice_question_ids';

/** File a finished sheet's sections. Idempotent on (job_id, section_index):
 *  a `revise` round that re-completes the job overwrites its own rows. Returns
 *  how many rows were written, 0 on any error (logged). */
export async function fileSheetSections(sb: SupabaseClient, rows: SectionRow[]): Promise<number> {
  if (!rows.length) return 0;
  try {
    // A bank item the worker named by id but not by text: take the stem from
    // the bank, so closure tracking can match the returned sheet against it.
    const need = [...new Set(rows.flatMap(r => r.practice_texts.length ? [] : r.practice_question_ids))];
    if (need.length) {
      const { data: qs } = await sb.from('questions').select('id, question_text').in('id', need);
      const text = new Map((qs ?? []).map((q: { id: string; question_text: string | null }) => [q.id, String(q.question_text || '').slice(0, 400)]));
      for (const r of rows) if (!r.practice_texts.length) r.practice_texts = r.practice_question_ids.map(id => text.get(id) || '').filter(Boolean);
    }
    const { error } = await sb.from('sheet_sections').upsert(rows, { onConflict: 'job_id,section_index' });
    if (error) { console.warn('[sheet-sections] not filed', rows[0]?.job_id, error.message); return 0; }
    return rows.length;
  } catch (e) {
    console.warn('[sheet-sections] not filed', rows[0]?.job_id, (e as Error).message);
    return 0;
  }
}

export type BankQuery = { q?: string | null; subject?: string | null; level?: string | null; limit?: number; includeRetired?: boolean };

/** Search the bank by the missed step. Full-text first (websearch syntax over
 *  title + gap + why); when that finds nothing, a loose title/gap ILIKE on the
 *  first content words so a differently phrased section still surfaces.
 *  Vetted rows first, then newest. */
export async function searchSheetSections(sb: SupabaseClient, query: BankQuery): Promise<BankHit[]> {
  const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 50);
  const terms = searchTerms(query.q);
  const base = () => {
    let b = sb.from('sheet_sections').select(HIT_COLUMNS);
    if (!query.includeRetired) b = b.is('retired_at', null);
    if (query.subject) b = b.eq('subject', query.subject);
    if (query.level) b = b.eq('level', query.level);
    return b;
  };
  const order = <T extends { order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => T }>(b: T) =>
    b.order('last_vetted_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  try {
    if (!terms) {
      const { data, error } = await order(base()).limit(limit);
      if (error) throw error;
      return (data ?? []) as BankHit[];
    }
    const { data, error } = await order(base().textSearch('search', terms.split(' ').join(' or '), { type: 'websearch' })).limit(limit);
    if (error) throw error;
    if (data?.length) return data as BankHit[];
    const words = terms.split(' ').slice(0, 3);
    const ors = words.flatMap(w => [`title.ilike.%${w}%`, `gap.ilike.%${w}%`]).join(',');
    const loose = await order(base().or(ors)).limit(limit);
    if (loose.error) throw loose.error;
    return (loose.data ?? []) as BankHit[];
  } catch (e) {
    console.warn('[sheet-sections] search failed', (e as Error).message);
    return [];
  }
}

export type SectionStateChange = { vetted?: boolean; retired?: boolean; reason?: string | null };

/** Adrian's two verbs on a row: vetted (stamps last_vetted_at, or clears it)
 *  and retired (stamps retired_at + reason, or un-retires). */
export async function setSectionState(sb: SupabaseClient, id: string, change: SectionStateChange): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (typeof change.vetted === 'boolean') patch.last_vetted_at = change.vetted ? now : null;
  if (typeof change.retired === 'boolean') {
    patch.retired_at = change.retired ? now : null;
    patch.retired_reason = change.retired ? (change.reason ? String(change.reason).slice(0, 300) : null) : null;
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'nothing to change' };
  const { error } = await sb.from('sheet_sections').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
