// The fetching half of the weekly security-and-privacy check — pure rules in
// lib/security-scan.ts. Needs SUPABASE_ACCESS_TOKEN (the Supabase management login the
// monthly backup check already uses, Production scope on Vercel).
//
// Privacy: the candidate list is every public table/view the anon role is GRANTED select
// on, plus public storage buckets. A grant is not a leak (most tables have rules that let
// only the server or the owner in), so each candidate is then really read from outside with
// the public key, and only a table that hands a stranger a row counts. Reads only.
// The management login needs Advisors + Database + Backups READ on both projects (docs/OPS.md).

import { getSupabaseAdmin } from '@/lib/supabase';
import { advisorFindings, privacyFindings, type Finding, type Project } from '@/lib/security-scan';

export const PROJECT_REFS: Record<Project, string> = {
  maths: 'nempslbewxtlikfzachi',
  science: 'eaxnstsecxmqdobfvmjh',
};

const API = 'https://api.supabase.com/v1/projects';

function token(): string {
  const t = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!t) throw new Error('SUPABASE_ACCESS_TOKEN is not set — the security check needs the Supabase management login (Vercel → Settings → Environment Variables, Production)');
  return t;
}

async function mgmt(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path.split('/').slice(1).join('/')} answered ${res.status}: ${text.slice(0, 160)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function sql(ref: string, query: string): Promise<Record<string, unknown>[]> {
  const out = await mgmt(`${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
  return Array.isArray(out) ? (out as Record<string, unknown>[]) : [];
}

const CANDIDATES = `
select 'table' as kind, c.relname::text as name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m')
  and has_table_privilege('anon', c.oid, 'SELECT')
union all
select 'bucket', id::text from storage.buckets where public
order by 1, 2`;

// The PUBLIC keys an outsider holds (meant to be public — they ship to browsers). The
// science one is not in the site's env (nothing in a browser uses that project), so it is
// written here; a rotated key makes every probe fail, which the check reports, never hides.
const SCIENCE_PUBLISHABLE_KEY = 'sb_publishable_MpF9DbkbsBmGMvQ03QiKHQ_0dlr1QCD';
function publicKey(project: Project): string {
  if (project === 'science') return SCIENCE_PUBLISHABLE_KEY;
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
}

/** Tables among `names` that hand a stranger at least one row — read from OUTSIDE, through the
 *  public data door with the public key, exactly as a stranger would. (4 Nov 2026: the first
 *  version did `set role anon` inside SQL; the read-only management login may not switch role,
 *  every probe failed and the check said "0 readable" — so failures now count and are loud.) */
async function anonReadable(project: Project, names: string[]): Promise<string[]> {
  const key = publicKey(project);
  if (!key) throw new Error(`no public key for the ${project} database — cannot test what strangers can read`);
  const base = `https://${PROJECT_REFS[project]}.supabase.co/rest/v1`;
  const out: string[] = [];
  let failed = 0;
  for (let i = 0; i < names.length; i += 10) {
    await Promise.all(names.slice(i, i + 10).map(async (t) => {
      try {
        const r = await fetch(`${base}/${encodeURIComponent(t)}?select=*&limit=1`, { headers: { apikey: key } });
        if (r.status >= 500 || r.status === 401) { failed++; return; }   // 401 = the key itself was refused
        if (!r.ok) return;                                                // 403/404 = locked: not readable
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows.length > 0) out.push(t);
      } catch { failed++; }
    }));
  }
  if (names.length && failed > names.length / 2) {
    throw new Error(`could not test the ${project} tables as a stranger: ${failed} of ${names.length} reads failed (public key refused or Supabase down)`);
  }
  return out.sort();
}

export async function scanProject(project: Project): Promise<Finding[]> {
  const ref = PROJECT_REFS[project];
  const advisors = advisorFindings(project, await mgmt(`${ref}/advisors/security`));
  const cands = await sql(ref, CANDIDATES);
  const tables = cands.filter((r) => r.kind === 'table').map((r) => String(r.name));
  const buckets = cands.filter((r) => r.kind === 'bucket').map((r) => String(r.name));
  return [...advisors, ...privacyFindings(project, await anonReadable(project, tables), buckets)];
}

/** Last run's list of keys (job_runs `security-scan`, newest ok row), or null on the first run. */
export async function lastKeys(): Promise<string[] | null> {
  const { data } = await getSupabaseAdmin()
    .from('job_runs').select('meta').eq('job', 'security-scan').eq('ok', true)
    .order('ran_at', { ascending: false }).limit(1);
  const keys = (data?.[0]?.meta as { keys?: unknown } | undefined)?.keys;
  return Array.isArray(keys) ? keys.map(String) : null;
}
