// The fetching half of the weekly security-and-privacy check — pure rules in
// lib/security-scan.ts. Needs SUPABASE_ACCESS_TOKEN (the Supabase management login the
// monthly backup check already uses, Production scope on Vercel).
//
// Privacy: the candidate list is every public table/view the anon role is GRANTED select
// on, plus public storage buckets. A grant is not a leak (most tables have rules that let
// only the server or the owner in), so each candidate is then really read AS anon —
// `set role anon` in the same SQL call — and only a table that hands an outsider a row
// counts. Reads only; nothing is changed.

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

const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Tables among `names` that hand the anon role at least one row. */
async function anonReadable(ref: string, names: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < names.length; i += 40) {
    const chunk = names.slice(i, i + 40);
    const probe = (ts: string[]) =>
      `set role anon; select ${ts.map((t, j) => `(select count(*) from (select 1 from public.${qi(t)} limit 1) x) as c${j}`).join(', ')};`;
    try {
      const row = (await sql(ref, probe(chunk)))[0] || {};
      chunk.forEach((t, j) => { if (Number(row[`c${j}`]) > 0) out.push(t); });
    } catch {
      // one refused read (e.g. a view over a table anon may not touch) fails the whole
      // call — read that chunk one table at a time; a refusal means "not readable".
      for (const t of chunk) {
        try { if (Number(((await sql(ref, probe([t])))[0] || {}).c0) > 0) out.push(t); } catch { /* not readable */ }
      }
    }
  }
  return out;
}

export async function scanProject(project: Project): Promise<Finding[]> {
  const ref = PROJECT_REFS[project];
  const advisors = advisorFindings(project, await mgmt(`${ref}/advisors/security`));
  const cands = await sql(ref, CANDIDATES);
  const tables = cands.filter((r) => r.kind === 'table').map((r) => String(r.name));
  const buckets = cands.filter((r) => r.kind === 'bucket').map((r) => String(r.name));
  return [...advisors, ...privacyFindings(project, await anonReadable(ref, tables), buckets)];
}

/** Last run's list of keys (job_runs `security-scan`, newest ok row), or null on the first run. */
export async function lastKeys(): Promise<string[] | null> {
  const { data } = await getSupabaseAdmin()
    .from('job_runs').select('meta').eq('job', 'security-scan').eq('ok', true)
    .order('ran_at', { ascending: false }).limit(1);
  const keys = (data?.[0]?.meta as { keys?: unknown } | undefined)?.keys;
  return Array.isArray(keys) ? keys.map(String) : null;
}
