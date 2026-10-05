// 💡 The suggestions store (5 Oct 2026). Server-only, service key. Table
// `portal_suggestions` (RLS on, no policies). Rules live in lib/suggestions.ts.
import { getSupabaseAdmin } from '@/lib/supabase';
import { DUPLICATE_WINDOW_MS, sortSuggestions, type SuggestionStatus } from '@/lib/suggestions';

export interface SuggestionRow {
  id: string;
  account_id: string | null;
  airtable_student_id: string | null;
  student_name: string | null;
  anonymous: boolean;
  text: string;
  status: SuggestionStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = 'portal_suggestions';

/** Every row stored in the last minute (text + time only) — for the duplicate guard. */
export async function recentSuggestions(now = Date.now()): Promise<{ text: string; created_at: string }[]> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select('text, created_at')
    .gte('created_at', new Date(now - DUPLICATE_WINDOW_MS).toISOString()).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as { text: string; created_at: string }[];
}

export async function insertSuggestion(row: {
  anonymous: boolean; account_id: string | null; airtable_student_id: string | null; student_name: string | null; text: string;
}): Promise<{ id: string; created_at: string }> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(row).select('id, created_at').single();
  if (error) throw new Error(error.message);
  return data as { id: string; created_at: string };
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
