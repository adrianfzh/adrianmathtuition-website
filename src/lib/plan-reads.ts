// plan_reads — small readings done on PLAN usage, not the paid key (migrations/plan_reads.sql;
// Adrian, 7 Oct 2026: "all on plan"). The website writes the finished prompt; the Fly worker's
// one-minute lane (bot scripts/plan-reads.js) runs it and writes the raw reply back; the caller
// parses the reply with its own parser. Not instant: about a minute when the worker is awake,
// a few minutes when the bot has to start it first.
import { getSupabaseAdmin } from './supabase';

export interface PlanRead {
  id: string; kind: string; identity: string | null; ref: string | null; status: 'queued' | 'claimed' | 'replied' | 'failed';
  reply: string | null; error: string | null; meta: Record<string, unknown> | null; created_at: string; done_at: string | null;
}
const COLS = 'id, kind, identity, ref, status, reply, error, meta, created_at, done_at';

export async function enqueuePlanRead(row: { kind: string; identity: string; ref: string; prompt: string; model?: string; meta?: Record<string, unknown> }): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('plan_reads')
    .insert({ kind: row.kind, identity: row.identity, ref: row.ref, prompt: row.prompt, model: row.model ?? 'sonnet', meta: row.meta ?? null })
    .select('id').single();
  if (error) { console.error('[plan-reads] enqueue failed:', error.message); return null; }
  return (data as { id: string }).id;
}

export async function getPlanRead(id: string): Promise<PlanRead | null> {
  const { data } = await getSupabaseAdmin().from('plan_reads').select(COLS).eq('id', id).maybeSingle();
  return (data as PlanRead | null) ?? null;
}

export async function setPlanReadMeta(id: string, meta: Record<string, unknown>): Promise<void> {
  await getSupabaseAdmin().from('plan_reads').update({ meta }).eq('id', id);
}

/** One person's reads of a kind whose ref starts with a prefix, newest first. */
export async function planReadsFor(identity: string, kind: string, refPrefix: string, limit = 80): Promise<PlanRead[]> {
  const { data } = await getSupabaseAdmin().from('plan_reads').select(COLS)
    .eq('identity', identity).eq('kind', kind).like('ref', `${refPrefix}%`).order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as PlanRead[];
}

export async function planReadsSince(identity: string, kind: string, sinceISO: string): Promise<number> {
  const { count } = await getSupabaseAdmin().from('plan_reads').select('id', { count: 'exact', head: true })
    .eq('identity', identity).eq('kind', kind).gte('created_at', sinceISO);
  return count ?? 0;
}

/** Pure: how many reads have waited longer than `minutes` — the health check's question. */
export function stuckReads(rows: { status: string; created_at: string }[], now: number, minutes = 20): number {
  return rows.filter(r => (r.status === 'queued' || r.status === 'claimed') && now - Date.parse(r.created_at) > minutes * 60_000).length;
}

export async function waitingPlanReads(): Promise<{ status: string; created_at: string }[]> {
  const { data, error } = await getSupabaseAdmin().from('plan_reads').select('status, created_at').in('status', ['queued', 'claimed']).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as { status: string; created_at: string }[];
}
