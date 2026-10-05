// 💡 The suggestions store (5 Oct 2026). Server-only, service key. Table
// `portal_suggestions` (RLS on, no policies). Rules live in lib/suggestions.ts.
import { getSupabaseAdmin } from '@/lib/supabase';
import { sgtDayStartISO } from '@/lib/sgt';
import { sortSuggestions, type SuggestionStatus } from '@/lib/suggestions';

export interface SuggestionRow {
  id: string;
  account_id: string | null;
  airtable_student_id: string;
  student_name: string | null;
  subject: string | null;
  text: string;
  status: SuggestionStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = 'portal_suggestions';

/** How many the student has sent since Singapore midnight. */
export async function suggestionsSentToday(identity: string, now = Date.now()): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('airtable_student_id', identity).gte('created_at', sgtDayStartISO(now));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function insertSuggestion(row: {
  account_id: string; airtable_student_id: string; student_name: string | null; subject: string | null; text: string;
}): Promise<SuggestionRow> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data as SuggestionRow;
}

export async function listSuggestions(limit = 300): Promise<SuggestionRow[]> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return sortSuggestions((data ?? []) as SuggestionRow[]);
}

export async function updateSuggestion(id: string, patch: { status?: SuggestionStatus; admin_note?: string | null }): Promise<SuggestionRow | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SuggestionRow) ?? null;
}
