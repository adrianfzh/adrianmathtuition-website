// The Airtable side of the worker's job switches (lib/worker-jobs.ts): one `Settings`
// row, Setting Name = worker_jobs, Value = the JSON map. The slot-accounts store's shape,
// 30 s cache (the worker reads every two minutes; the page reads fresh).
import { airtableRequest } from '@/lib/airtable';
import { WORKER_JOBS_SETTING, parseWorkerJobs, withWorkerJob, type WorkerJobMap } from './worker-jobs';

const TTL_MS = 30_000;
let cache: { at: number; map: WorkerJobMap } | null = null;

async function fetchRow(): Promise<{ id: string | null; map: WorkerJobMap }> {
  const data = await airtableRequest('Settings', `?filterByFormula=${encodeURIComponent(`{Setting Name}='${WORKER_JOBS_SETTING}'`)}&maxRecords=1`);
  const rec = (data as { records?: { id: string; fields: Record<string, unknown> }[] }).records?.[0];
  return { id: rec?.id ?? null, map: parseWorkerJobs(rec?.fields?.Value) };
}

export async function getWorkerJobs(fresh = false): Promise<WorkerJobMap> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const row = await fetchRow();
  cache = { at: Date.now(), map: row.map };
  return row.map;
}

export async function setWorkerJob(key: string, on: boolean, by: string): Promise<WorkerJobMap> {
  const row = await fetchRow();
  const map = withWorkerJob(row.map, key, on, by);
  const json = JSON.stringify(map);
  if (row.id) await airtableRequest('Settings', `/${row.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Value: json } }) });
  else await airtableRequest('Settings', '', { method: 'POST', body: JSON.stringify({ fields: { 'Setting Name': WORKER_JOBS_SETTING, Value: json } }) });
  cache = { at: Date.now(), map };
  return map;
}
