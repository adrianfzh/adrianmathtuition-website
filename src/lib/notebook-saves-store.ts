// Server-side reads for saved answers (lib/notebook-saves.ts is the pure half).
//
// The skill backfill: a save made seconds after an answer lands before the bot
// has filed that ask (ask_skills arrives ~10 s later), so its topic and skill
// are null. On the next Notebook read, any such save is matched to the nearest
// ask_skills row inside the window and stamped — once, fail-soft.
import type { SupabaseClient } from '@supabase/supabase-js';
import { SKILL_MATCH_WINDOW_MS, nearestAskSkill, type SaveRow } from './notebook-saves';

export const SAVE_COLUMNS = 'id, kind, source, question_text, answer_text, image_url, title, topic, skill, created_at';

export async function loadSaves(svc: SupabaseClient, identity: string, limit = 200): Promise<SaveRow[]> {
  const { data } = await svc.from('notebook_saves').select(SAVE_COLUMNS)
    .eq('airtable_student_id', identity).order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []) as SaveRow[];
  return backfillSaveSkills(svc, identity, rows);
}

/** Fill topic + skill on saves that were made before the bot filed their ask. Returns the rows, patched in place. */
export async function backfillSaveSkills(svc: SupabaseClient, identity: string, rows: SaveRow[]): Promise<SaveRow[]> {
  const missing = rows.filter(r => r.kind === 'ask' && !r.topic && !r.skill);
  if (!missing.length) return rows;
  try {
    const times = missing.map(r => Date.parse(r.created_at)).filter(Number.isFinite);
    const lo = new Date(Math.min(...times) - SKILL_MATCH_WINDOW_MS).toISOString();
    const hi = new Date(Math.max(...times) + SKILL_MATCH_WINDOW_MS).toISOString();
    const { data: asks } = await svc.from('ask_skills').select('topic, skill, asked_at')
      .eq('airtable_student_id', identity).gte('asked_at', lo).lte('asked_at', hi);
    const pool = (asks ?? []) as { topic: string; skill: string | null; asked_at: string }[];
    if (!pool.length) return rows;
    for (const r of missing) {
      const hit = nearestAskSkill(pool, r.created_at);
      if (!hit) continue;
      r.topic = hit.topic;
      r.skill = hit.skill;
      await svc.from('notebook_saves').update({ topic: hit.topic, skill: hit.skill }).eq('id', r.id).eq('airtable_student_id', identity);
    }
  } catch (e) {
    console.warn('[notebook-saves] skill backfill skipped:', (e as Error).message);
  }
  return rows;
}
