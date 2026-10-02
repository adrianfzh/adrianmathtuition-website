// 👻 The one loader for the cheaper-reader shadow (1 Oct 2026): shadowed runs in the
// window + the noise floor from the weekly consistency re-reads → the summary
// lib/shadow-read-report.ts renders. Shared by /api/cron/shadow-read-report and the
// Monday auto-release-report.
import { getSupabaseAdmin } from './supabase';
import { summariseShadowReads, noiseFloor, type ShadowRun, type ShadowSummary } from './shadow-read-report';

export async function loadShadowSummary(days = 60): Promise<ShadowSummary> {
  const sb = getSupabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const sel = 'id, paper_name, student_name, created_at, result_json';
  const [{ data: runs, error: e1 }, { data: noise, error: e2 }] = await Promise.all([
    sb.from('paper_marking_runs').select(sel).not('result_json->shadow_read', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
    sb.from('paper_marking_runs').select(sel).not('result_json->shadow_runs', 'is', null).order('created_at', { ascending: false }).limit(100),
  ]);
  if (e1) throw new Error(`shadow runs: ${e1.message}`);
  if (e2) throw new Error(`noise runs: ${e2.message}`);
  return summariseShadowReads((runs ?? []) as ShadowRun[], noiseFloor((noise ?? []) as ShadowRun[]));
}
