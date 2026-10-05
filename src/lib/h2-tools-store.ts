// 🧭 + ✍️ The H2 practice tools — the I/O half (service key; the tables have RLS with no
// policies). Pure rules live in lib/h2-tools.ts. SPEC-H2-TOOLS.md.
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from './supabase';
import { sgtDayStartISO } from './sgt';
import {
  DAILY_STATS_MODEL_CAP, STATS_CHECK_MODEL, buildElementCheckPrompt, idsForModel, mergeChecklist, parseElementCheckReply,
  ruleCheck, toMethodDrill, toStatsItem,
  type ElementResult, type MethodArea, type MethodDrill, type ModelElementVerdict, type StatsItem, type StatsKind,
} from './h2-tools';

const DRILL_COLS = 'id, area, skill, stem, ask, options, answer, why, trap, trap_why';
const STATS_COLS = 'id, kind, context, task, elements, model_answer';

/** Live drills for one area (status 'live' = passed the blind-solve check). */
export async function loadMethodDrills(area: MethodArea): Promise<MethodDrill[]> {
  const { data, error } = await getSupabaseAdmin().from('method_drills').select(DRILL_COLS).eq('area', area).eq('status', 'live');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toMethodDrill).filter((d): d is MethodDrill => !!d);
}

/** Live drill counts per area (the door's subtitle). */
export async function methodDrillCounts(): Promise<Record<string, number>> {
  const { data } = await getSupabaseAdmin().from('method_drills').select('area').eq('status', 'live');
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { area: string }[]) out[r.area] = (out[r.area] ?? 0) + 1;
  return out;
}

/** item id → was the student's LAST answer right (for the run order). */
export async function attemptHistory(identity: string, tool: 'method' | 'stats'): Promise<Map<string, boolean>> {
  const { data } = await getSupabaseAdmin().from('h2_tool_attempts').select('item_id, correct, created_at')
    .eq('identity', identity).eq('tool', tool).order('created_at', { ascending: true }).limit(1000);
  const m = new Map<string, boolean>();
  for (const r of (data ?? []) as { item_id: string; correct: boolean | null }[]) m.set(r.item_id, !!r.correct);
  return m;
}

export async function logAttempt(row: { identity: string; tool: 'method' | 'stats'; itemId: string; answer: string; correct: boolean; result?: unknown; usedModel?: boolean }): Promise<void> {
  const { error } = await getSupabaseAdmin().from('h2_tool_attempts').insert({
    identity: row.identity, tool: row.tool, item_id: row.itemId, answer: row.answer.slice(0, 4000),
    correct: row.correct, result: row.result ?? null, used_model: !!row.usedModel,
  });
  if (error) console.error('[h2-tools] attempt insert failed:', error.message);
}

export async function loadMethodDrill(id: string): Promise<MethodDrill | null> {
  const { data } = await getSupabaseAdmin().from('method_drills').select(DRILL_COLS).eq('id', id).eq('status', 'live').maybeSingle();
  return data ? toMethodDrill(data as Record<string, unknown>) : null;
}

export async function loadStatsItems(kind?: StatsKind | null): Promise<StatsItem[]> {
  let q = getSupabaseAdmin().from('stats_writeup_items').select(STATS_COLS).eq('status', 'live');
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toStatsItem).filter((d): d is StatsItem => !!d);
}

export async function loadStatsItem(id: string): Promise<StatsItem | null> {
  const { data } = await getSupabaseAdmin().from('stats_writeup_items').select(STATS_COLS).eq('id', id).eq('status', 'live').maybeSingle();
  return data ? toStatsItem(data as Record<string, unknown>) : null;
}

/** Model checks this student spent today (Singapore day). */
export async function modelChecksToday(identity: string): Promise<number> {
  const { count } = await getSupabaseAdmin().from('h2_tool_attempts').select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('tool', 'stats').eq('used_model', true).gte('created_at', sgtDayStartISO());
  return count ?? 0;
}

async function askModel(item: StatsItem, answer: string, ids: string[]): Promise<ModelElementVerdict[] | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const msg = await anthropic.messages.create({
      model: STATS_CHECK_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: buildElementCheckPrompt(item, answer, ids) }],
    });
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    return parseElementCheckReply(text, ids);
  } catch (e) {
    console.error('[h2-tools] element check failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Check one write-up: the rule pass, then — only for the elements it missed, and
 * only while the student is under the day's cap — the cheap model.
 */
export async function checkWriteup(item: StatsItem, answer: string, identity: string): Promise<{ results: ElementResult[]; usedModel: boolean; capped: boolean }> {
  const rule = ruleCheck(item, answer);
  const ids = idsForModel(item, answer, rule);
  if (ids.length === 0) return { results: mergeChecklist(item, answer, rule, null), usedModel: false, capped: false };
  const used = await modelChecksToday(identity).catch(() => DAILY_STATS_MODEL_CAP);
  if (used >= DAILY_STATS_MODEL_CAP) return { results: mergeChecklist(item, answer, rule, null), usedModel: false, capped: true };
  const verdicts = await askModel(item, answer, ids);
  return { results: mergeChecklist(item, answer, rule, verdicts), usedModel: verdicts !== null, capped: false };
}
