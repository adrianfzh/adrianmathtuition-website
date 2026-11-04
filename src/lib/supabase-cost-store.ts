// The fetching half of the daily Supabase cost check — pure rules in lib/supabase-cost.ts.
// Needs SUPABASE_ACCESS_TOKEN (the Supabase management login the backup and security checks use,
// Production scope on Vercel).
//
// TWO WAYS TO READ THE NUMBERS (4 Nov 2026):
//   1. EXACT — Supabase's own organisation usage (the numbers on the dashboard's Usage page). The
//      public Management API (api.supabase.com/v1) has NO organisation-usage endpoint, so this
//      asks the dashboard's own one (/platform/organizations/{slug}/usage). It is not a published
//      API: if Supabase refuses the login there, we fall back to 2 and say so.
//   2. ESTIMATE — what we can measure ourselves: file storage size per project (exact, from
//      storage.objects) and the last 24 h of FILE downloads per project (exact, from the logs).
//      Database reads cannot be measured from the logs (their size is not recorded), so the
//      estimate's "data sent out" is a LOWER bound, and the brief says so.
// Reads only; nothing is changed.

import { getSupabaseAdmin } from '@/lib/supabase';
import { cycleFor, type Usage } from '@/lib/supabase-cost';

export const ORG_SLUG = 'yzmhklvgtygnitjvexdd';   // "Adrian's Projects"
export const PROJECTS: Record<string, string> = {
  'the maths project': 'nempslbewxtlikfzachi',
  'the science project': 'eaxnstsecxmqdobfvmjh',
  'the trading-signals project': 'fkcltqvfcpgramncerrr',
};
const BILLING_ANCHOR_DAY = 27;   // Adrian's cycle: 27th → 27th

function token(): string {
  const t = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!t) throw new Error('SUPABASE_ACCESS_TOKEN is not set — the cost check needs the Supabase management login (Vercel → Settings → Environment Variables, Production)');
  return t;
}

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* text */ }
  return { ok: res.ok, status: res.status, body };
}

const toGb = (v: unknown): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 100_000 ? n / 1e9 : n;   // bytes → GB when Supabase answers in bytes
};

/** Parse the dashboard's usage answer: an array of { metric, usage, … } (under `usages` or bare). Pure. */
export function parsePlatformUsage(body: unknown): { egressGb: number | null; cachedEgressGb: number | null; storageGb: number | null } | null {
  const list = Array.isArray(body) ? body : (body && typeof body === 'object' && Array.isArray((body as { usages?: unknown }).usages) ? (body as { usages: unknown[] }).usages : null);
  if (!list) return null;
  const find = (re: RegExp) => {
    const it = list.find((x) => x && typeof x === 'object' && re.test(String((x as { metric?: unknown }).metric || '')));
    return it ? toGb((it as { usage?: unknown }).usage) : null;
  };
  const out = { egressGb: find(/^EGRESS$/i), cachedEgressGb: find(/^CACHED_EGRESS$/i), storageGb: find(/^STORAGE_SIZE$/i) };
  return out.egressGb == null && out.storageGb == null ? null : out;
}

/** Compute size per project from the billing add-ons (variant id "ci_micro" → "micro"). Unknown → micro. */
async function computeSizes(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, ref] of Object.entries(PROJECTS)) {
    out[name] = 'micro';
    try {
      const r = await call(`https://api.supabase.com/v1/projects/${ref}/billing/addons`);
      const addons = (r.body as { selected_addons?: { type?: string; variant?: { identifier?: string } }[] })?.selected_addons || [];
      const ci = addons.find((a) => a.type === 'compute_instance');
      const id = ci?.variant?.identifier?.replace(/^ci_/, '');
      if (id) out[name] = id;
    } catch { /* micro */ }
  }
  return out;
}

async function sql(ref: string, query: string): Promise<Record<string, unknown>[]> {
  const r = await call(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, { method: 'POST', body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`database query answered ${r.status}`);
  return Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : [];
}

/** Bytes of FILE downloads in the last 24 h (storage GETs carry their size in the logs). */
async function fileDownloadBytes24h(ref: string): Promise<number | null> {
  const q = `select sum(toFloat64OrZero(log_attributes['response.headers.content_length'])) as b from logs
    where source = 'edge_logs' and log_attributes['request.method'] = 'GET'
      and (log_attributes['request.path'] like '/storage/v1/object/%' or log_attributes['request.path'] like '/storage/v1/render/%')`;
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 86_400_000).toISOString();
  const r = await call(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?sql=${encodeURIComponent(q)}&iso_timestamp_start=${start}&iso_timestamp_end=${end}`);
  if (!r.ok) return null;
  const row = ((r.body as { result?: { b?: unknown }[] })?.result || [])[0];
  const n = Number(row?.b);
  return Number.isFinite(n) ? n : null;
}

/** Today's usage — Supabase's own numbers when it lets us read them, else our estimate. */
export async function readUsage(now = Date.now()): Promise<Usage & { platformError?: string }> {
  const compute = await computeSizes();
  let { start, end } = cycleFor(now, BILLING_ANCHOR_DAY);
  try {
    const sub = await call(`https://api.supabase.com/platform/organizations/${ORG_SLUG}/billing/subscription`);
    const b = sub.body as { current_period_start?: number; current_period_end?: number };
    if (sub.ok && b?.current_period_start && b?.current_period_end) { start = b.current_period_start * 1000; end = b.current_period_end * 1000; }
  } catch { /* anchor day */ }

  let platformError = '';
  try {
    const r = await call(`https://api.supabase.com/platform/organizations/${ORG_SLUG}/usage?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`);
    const parsed = r.ok ? parsePlatformUsage(r.body) : null;
    if (parsed) {
      // Which project sends the most: the same call per project (best effort, egress only).
      let topEgress: string | null = null, top = 0;
      for (const [name, ref] of Object.entries(PROJECTS)) {
        try {
          const pr = await call(`https://api.supabase.com/platform/organizations/${ORG_SLUG}/usage?project_ref=${ref}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`);
          const g = pr.ok ? parsePlatformUsage(pr.body)?.egressGb ?? 0 : 0;
          if (g > top) { top = g; topEgress = name; }
        } catch { /* skip */ }
      }
      return { cycleStart: start, cycleEnd: end, now, ...parsed, compute, exact: true, topEgress };
    }
    platformError = `usage answered ${r.status}`;
  } catch (e) { platformError = (e as Error).message; }

  // ── ESTIMATE ──────────────────────────────────────────────────────────────────────────────
  let storageGb = 0, filesPerDay = 0, topEgress: string | null = null, top = 0, storageOk = true, filesOk = true;
  for (const [name, ref] of Object.entries(PROJECTS)) {
    try {
      const row = (await sql(ref, `select coalesce(sum((metadata->>'size')::bigint), 0)::text as b from storage.objects`))[0];
      storageGb += Number(row?.b || 0) / 1e9;
    } catch { storageOk = false; }
    const f = await fileDownloadBytes24h(ref).catch(() => null);
    if (f == null) filesOk = false;
    else { filesPerDay += f / 1e9; if (f > top) { top = f; topEgress = `${name}'s file downloads`; } }
  }
  const daysElapsed = Math.max(0.5, (now - start) / 86_400_000);
  return {
    cycleStart: start, cycleEnd: end, now, compute, exact: false, platformError,
    storageGb: storageOk ? storageGb : null,
    egressGb: filesOk ? filesPerDay * daysElapsed : null,
    cachedEgressGb: null,
    topEgress,
    caveat: 'Supabase did not share its own billing numbers, so this is our measurement: file storage is exact, '
      + '"data sent out" counts file downloads only — database reads are not counted, so the real figure is higher. '
      + 'The exact numbers are on supabase.com → your organisation → Usage',
  };
}

/** Warnings already sent this cycle (job_runs `supabase-cost`, newest ok row). */
export async function lastSent(): Promise<{ sent: string[]; cycleStart: number } | null> {
  const { data } = await getSupabaseAdmin()
    .from('job_runs').select('meta').eq('job', 'supabase-cost').eq('ok', true)
    .order('ran_at', { ascending: false }).limit(1);
  const meta = data?.[0]?.meta as { sent?: unknown; cycle_start?: unknown } | undefined;
  if (!meta || !Array.isArray(meta.sent)) return null;
  return { sent: meta.sent.map(String), cycleStart: Number(meta.cycle_start) };
}
