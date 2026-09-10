// The read behind lib/ask-signal.ts: the student's own asks from Supabase
// `ask_skills` — one row per linked ask, stamped by the bot with the topic it
// classified and the bank sub-skill it filed the ask under (bot
// lib/ask-skill.js; a month of history from scripts/backfill-ask-skills.js).
// Server-only (service key — the table has RLS on and no policies).
//
// Keyed by the same identity the Notebook uses everywhere (lib/portal-auth
// portalIdentity: the Airtable record id for a tuition student). Only the
// look-back window is read; the fold into lines is the pure module.
//
// Fail-soft: any error yields no lines — the Notebook renders without the
// band, never an error page (the same rule as the mistakes read).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ASK_LOOKBACK_DAYS, askSignalLines, type AskRow, type AskSignalLine } from './ask-signal';

/** A student asking more than this in a month is not a student — a cap, not a page. */
const MAX_ROWS = 1000;

export async function loadAskSignal(svc: SupabaseClient, identity: string, now: Date = new Date()): Promise<AskSignalLine[]> {
  if (!identity) return [];
  try {
    const since = new Date(now.getTime() - (ASK_LOOKBACK_DAYS + 1) * 86_400_000).toISOString();
    const { data, error } = await svc
      .from('ask_skills')
      .select('skill, topic, subject, asked_at')
      .eq('airtable_student_id', identity)
      .gte('asked_at', since)
      .order('asked_at', { ascending: false })
      .limit(MAX_ROWS);
    if (error) throw error;
    const rows: AskRow[] = (data ?? []).map(r => ({
      skill: typeof r.skill === 'string' ? r.skill : null,
      topic: typeof r.topic === 'string' ? r.topic : null,
      subject: typeof r.subject === 'string' ? r.subject : null,
      at: typeof r.asked_at === 'string' ? r.asked_at : null,
    }));
    return askSignalLines(rows, now);
  } catch (e) {
    console.warn('[ask-signal] skipped:', (e as Error).message);
    return [];
  }
}
