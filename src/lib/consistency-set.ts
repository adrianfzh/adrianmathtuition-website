// 📏 lib/consistency-set — the fixed set of papers re-read in SHADOW each week
// (17 Sep 2026). Table: `consistency_set` (migrations/consistency_set.sql).
//
// Adrian curates the set by hand — it is not a sample. It is seeded with the
// bot's golden-bench papers (the ones every marking fix is already checked
// against), and he adds or rests a paper from /api/admin/consistency-set.
//
// The comparison itself lives in lib/shadow-diff.ts; this module only knows who
// is in the set and how to read their readings back.

import { getSupabaseAdmin } from '@/lib/supabase';
import { diffAssemblies, latestPair, paperRollup, type PaperRollup, type ShadowDiff, type ShadowReading, type MarkedResult } from '@/lib/shadow-diff';

export type ConsistencyRow = {
  run_id: string;
  added_at: string;
  note: string | null;
  active: boolean;
};

export type ConsistencyPaper = ConsistencyRow & {
  paper_name: string | null;
  student_name: string | null;
  readings: number;
  /** The latest shadow reading against the one before it — the week-on-week move. */
  vs_previous: ShadowDiff | null;
  /** The latest shadow reading against the marking the student actually has. */
  vs_released: ShadowDiff | null;
  /** True while the paper is waiting for, or inside, a shadow read. */
  queued: boolean;
};

/** Every row in the set, newest addition first. */
export async function listSet(activeOnly = false): Promise<ConsistencyRow[]> {
  let q = getSupabaseAdmin().from('consistency_set')
    .select('run_id, added_at, note, active')
    .order('added_at', { ascending: false });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`consistency_set read failed: ${error.message}`);
  return (data ?? []) as ConsistencyRow[];
}

/** Add a paper (or bring a rested one back). Idempotent — re-adding keeps added_at. */
export async function addToSet(runId: string, note?: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin().from('consistency_set')
    .upsert({ run_id: runId, active: true, ...(note != null ? { note: String(note).slice(0, 300) } : {}) }, { onConflict: 'run_id' });
  if (error) throw new Error(`consistency_set write failed: ${error.message}`);
}

/**
 * Rest a paper. Deliberately NOT a delete: the readings already filed on the run
 * stay where they are, and the row keeps the note that says why it was watched,
 * so bringing it back is one tap rather than an act of memory.
 */
export async function restInSet(runId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('consistency_set')
    .update({ active: false }).eq('run_id', runId);
  if (error) throw new Error(`consistency_set write failed: ${error.message}`);
}

type RunRow = {
  id: string;
  paper_name: string | null;
  student_name: string | null;
  result_json: {
    results?: MarkedResult[] | null;
    shadow_runs?: ShadowReading[] | null;
    shadow_queue?: unknown;
  } | null;
};

/** A paper's name as the report says it: "Isabelle EM 2023 P2". */
export function paperLabel(run: { paper_name?: string | null; student_name?: string | null }): string {
  const bits = [run.student_name, run.paper_name].filter(Boolean);
  return bits.length ? bits.join(' ') : 'paper';
}

/**
 * The whole measure: every row in the set with its two comparisons. `vs_previous`
 * is the week-on-week number the Monday line reports; `vs_released` is the
 * standing gap between the marking the student has and what the marker would do
 * with the same pages today — a bigger, slower number, and the one that says
 * whether a released paper would still be marked the way it was.
 */
export async function consistencyReport(activeOnly = true): Promise<ConsistencyPaper[]> {
  const rows = await listSet(activeOnly);
  if (!rows.length) return [];
  const { data, error } = await getSupabaseAdmin().from('paper_marking_runs')
    .select('id, paper_name, student_name, result_json')
    .in('id', rows.map((r) => r.run_id));
  if (error) throw new Error(`paper_marking_runs read failed: ${error.message}`);
  const byId = new Map(((data ?? []) as RunRow[]).map((r) => [r.id, r]));
  const out: ConsistencyPaper[] = [];
  for (const row of rows) {
    const run = byId.get(row.run_id);
    const rj = run?.result_json ?? null;
    const shadows = Array.isArray(rj?.shadow_runs) ? rj!.shadow_runs! : [];
    const { latest, previous } = latestPair(shadows);
    out.push({
      ...row,
      paper_name: run?.paper_name ?? null,
      student_name: run?.student_name ?? null,
      readings: shadows.length,
      vs_previous: latest && previous
        ? diffAssemblies(previous.results, latest.results, { beforeAt: previous.at, afterAt: latest.at })
        : null,
      vs_released: latest
        ? diffAssemblies(rj?.results ?? [], latest.results, { afterAt: latest.at })
        : null,
      queued: !!rj?.shadow_queue,
    });
  }
  return out;
}

/**
 * The roll-ups the Monday line is built from — one per paper that HAS a
 * week-on-week comparison. A paper read for the first time has nothing to
 * compare against yet and is simply absent, which is why the line can be null
 * in the first week and says nothing misleading in it.
 */
export function weeklyRollups(report: ConsistencyPaper[]): PaperRollup[] {
  return report
    .filter((p) => p.vs_previous)
    .map((p) => paperRollup(paperLabel(p), p.vs_previous!));
}
