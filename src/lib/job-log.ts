// ─── The centre's logbook ────────────────────────────────────────────────────────
//
// One row per automated-job run (Supabase `job_runs`, math project): the crons
// stamp here, the Mac's plan-billed workers stamp via /api/job-log or their own
// SQL, and two readers make the rows worth writing — the 6-hourly health check's
// missed-slot alarms (lib/job-health.ts) and the /admin/ops board. Stamping is
// ALWAYS best-effort: a job must never fail because its diary entry didn't write.
//
// Deliberately only the SUCCESS paths stamp: a crashed or never-started run then
// alarms by ABSENCE, which needs no error plumbing and cannot itself crash.

import { getSupabaseAdmin } from '@/lib/supabase';

export type JobRunRow = {
  job: string;
  ran_at: string;
  ok: boolean;
  summary: string | null;
};

/** Write one logbook row. Never throws — fire and forget (await it or not). */
export async function logJobRun(
  job: string,
  ok: boolean,
  summary?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await getSupabaseAdmin().from('job_runs').insert({
      job,
      ok,
      summary: summary ? String(summary).slice(0, 300) : null,
      ...(meta ? { meta } : {}),
    });
  } catch (e) {
    console.error('[job-log] stamp failed for', job, (e as Error).message);
  }
}

/** The newest row per job, newest jobs first. */
export async function latestJobRuns(scan = 400): Promise<JobRunRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('job_runs')
    .select('job, ran_at, ok, summary')
    .order('ran_at', { ascending: false })
    .limit(scan);
  if (error) throw new Error(`job_runs read failed: ${error.message}`);
  const seen = new Set<string>();
  const out: JobRunRow[] = [];
  for (const r of (data || []) as JobRunRow[]) {
    if (seen.has(r.job)) continue;
    seen.add(r.job);
    out.push(r);
  }
  return out;
}
