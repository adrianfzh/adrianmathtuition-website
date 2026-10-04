// The I/O half of the weekly leak test — the judging rules are in lib/leak-test.ts.
//
// The test student is the demo account (portal-teste@example.com, Adrian's own
// test login). Its session is minted on the server with the service key — a
// magic link that is generated and verified in memory, never e-mailed, no
// password involved — then used exactly as a phone would use it.
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listStudentFiles } from '@/lib/student-files';
import { judgeProbe, judgeTableRead, type Probe, type Self } from '@/lib/leak-test';

export const LEAK_TEST_EMAIL = (process.env.LEAK_TEST_EMAIL || 'portal-teste@example.com').trim();

const supaUrl = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const anonKey = () => (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const serviceKey = () => (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export interface TestSession { self: Self; accessToken: string; cookie: string }

export async function mintTestSession(admin: SupabaseClient = getSupabaseAdmin()): Promise<TestSession> {
  const { data: acct } = await admin.from('portal_accounts').select('id, airtable_student_id')
    .eq('email', LEAK_TEST_EMAIL).maybeSingle<{ id: string; airtable_student_id: string | null }>();
  if (!acct) throw new Error(`the test student ${LEAK_TEST_EMAIL} has no portal account`);
  const identity = acct.airtable_student_id?.trim() ? acct.airtable_student_id : `acct:${acct.id}`;

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const jar = new Map<string, string>();
    const sb = createServerClient(supaUrl(), anonKey(), {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cs) => cs.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))),
      },
    });
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: LEAK_TEST_EMAIL });
    if (linkErr || !link?.properties?.hashed_token) { lastErr = linkErr?.message || 'no link'; continue; }
    const { data, error } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
    if (error || !data.session) { lastErr = error?.message || 'no session'; continue; }
    if (data.session.user.id !== acct.id) throw new Error('the minted session is not the test student');
    return {
      self: { uid: acct.id, identity },
      accessToken: data.session.access_token,
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    };
  }
  throw new Error(`could not sign the test student in: ${lastErr}`);
}

/** Every table and view the database's public API exposes (from its own OpenAPI listing). */
export async function exposedTables(): Promise<string[]> {
  const res = await fetch(`${supaUrl()}/rest/v1/`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) throw new Error(`the table list would not load (HTTP ${res.status})`);
  const spec = (await res.json()) as { paths?: Record<string, unknown> };
  return Object.keys(spec.paths || {})
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1));
}

async function readAs(table: string, bearer: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${supaUrl()}/rest/v1/${encodeURIComponent(table)}?select=*&limit=50`, {
    headers: { apikey: anonKey(), Authorization: `Bearer ${bearer}` },
  }).catch(() => null);
  if (!res || !res.ok) return []; // a refusal is the right answer
  const body = await res.json().catch(() => []);
  return Array.isArray(body) ? body : [];
}

/** Step 1: read every table signed out and as the test student. */
export async function tableLeaks(session: TestSession): Promise<{ tables: number; problems: string[] }> {
  const tables = await exposedTables();
  const problems: string[] = [];
  for (const t of tables) {
    const p1 = judgeTableRead(t, await readAs(t, anonKey()), null);
    if (p1) problems.push(p1);
    const p2 = judgeTableRead(t, await readAs(t, session.accessToken), session.self);
    if (p2) problems.push(p2);
  }
  return { tables: tables.length, problems };
}

/** Another student's things to ask for: newest of each kind not belonging to the test student. */
export async function otherStudentProbes(admin: SupabaseClient, self: Self): Promise<Probe[]> {
  const probes: Probe[] = [];
  const not = (q: any, col: string) => q.not(col, 'is', null).neq(col, self.identity); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { data: run } = await not(admin.from('paper_marking_runs').select('id, paper_name, subject, paper_subject'), 'student_id')
    .not('released_at', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (run) {
    const r = run as { id: string; paper_name: string | null };
    probes.push(
      { label: "another student's marked paper (PDF)", path: `/api/portal/marking-pdf?run=${r.id}` },
      { label: "another student's marked paper (with notes)", path: `/api/portal/marking-pdf?run=${r.id}&notes=1` },
      { label: "another student's marking cover", path: `/api/portal/marking-cover?run=${r.id}` },
      { label: "another student's ink on their paper", path: `/api/portal/marking/ink?run=${r.id}` },
      { label: "another student's Practice Again PDF", path: `/api/portal/practice-pdf?run=${r.id}` },
      { label: "another student's paper page", path: `/app/marking/${r.id}`, page: true, marker: r.paper_name },
      { label: "another student's paper page (science)", path: `/app/science/marking/${r.id}`, page: true, marker: r.paper_name },
      { label: "another student's one-minute explanation", path: `/app/marking/${r.id}/explain/1`, page: true, marker: r.paper_name },
    );
    const files = await listStudentFiles(`runs/${r.id}`).catch(() => []);
    const file = files.find((f) => f.size > 0);
    if (file) probes.push({ label: "another student's stored file", path: `/api/files/${file.key}` });
  }

  const { data: asg } = await not(admin.from('portal_assignments').select('id'), 'airtable_student_id')
    .neq('status', 'revoked').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (asg) {
    const a = asg as { id: string };
    probes.push(
      { label: "another student's worksheet ink", path: `/api/portal/work/ink?assignment=${a.id}` },
      { label: "another student's assignment page", path: `/app/assignments/${a.id}`, page: true },
    );
  }

  const { data: essay } = await not(admin.from('essay_runs').select('id, essay_text'), 'airtable_student_id')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (essay) {
    const e = essay as { id: string; essay_text: string | null };
    const marker = (e.essay_text || '').trim().slice(0, 40);
    probes.push(
      { label: "another student's essay", path: `/api/portal/essays?id=${e.id}` },
      { label: "another student's essay page", path: `/app/languages/${e.id}`, page: true, marker },
    );
  }

  const { data: hum } = await not(admin.from('humanities_runs').select('id, answer_text'), 'airtable_student_id')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (hum) {
    const h = hum as { id: string; answer_text: string | null };
    const marker = (h.answer_text || '').trim().slice(0, 40);
    probes.push(
      { label: "another student's humanities answer", path: `/api/portal/humanities?id=${h.id}` },
      { label: "another student's humanities page", path: `/app/humanities/${h.id}`, page: true, marker },
    );
  }

  const { data: gp } = await not(admin.from('portal_generated_papers').select('id'), 'airtable_student_id')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (gp) probes.push({ label: "another student's printed paper", path: `/api/portal/print-paper/pdf?id=${(gp as { id: string }).id}` });

  return probes;
}

/**
 * Step 2: ask each door, signed in as the test student and signed out. Pages are
 * asked twice when signed out — once as a browser, once as the app's own
 * in-page navigation (`RSC: 1`), which skips the /app layout's sign-in check.
 */
export async function probeLeaks(base: string, session: TestSession, probes: Probe[]): Promise<{ asked: number; problems: string[] }> {
  const problems: string[] = [];
  let asked = 0;
  const ask = async (p: Probe, cookie: string | null, rsc: boolean) => {
    asked += 1;
    const headers: Record<string, string> = { 'user-agent': 'adrianmath-leak-test' };
    if (cookie) headers.cookie = cookie;
    if (rsc) headers.RSC = '1';
    const res = await fetch(`${base}${p.path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res) return;
    const body = p.page && res.status >= 200 && res.status < 300 ? await res.text().catch(() => '') : '';
    if (!p.page) await res.body?.cancel().catch(() => {});
    const problem = judgeProbe(p, res.status, !!cookie, body);
    if (problem) problems.push(rsc ? `${problem} (in-app navigation)` : problem);
  };
  for (const p of probes) {
    await ask(p, session.cookie, false);
    await ask(p, null, false);
    if (p.page) await ask(p, null, true);
  }
  return { asked, problems };
}

/**
 * The test must not go blind: a broken login or a wrong key would make every
 * door say "no" and the test pass for the wrong reason. So the test student must
 * be able to read their OWN account row and open their OWN marked paper.
 */
export async function controlProblems(admin: SupabaseClient, base: string, session: TestSession): Promise<string[]> {
  const out: string[] = [];
  const own = await readAs('portal_accounts', session.accessToken);
  if (!own.some((r) => r.id === session.self.uid)) out.push('control: the test student could not read their own account — the test is blind');
  const pub = await readAs('subgroups', anonKey());
  if (!pub.length) out.push('control: public content did not read with the public key — the test is blind');
  const { data: run } = await admin.from('paper_marking_runs').select('id').eq('student_id', session.self.identity)
    .not('released_at', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (run) {
    const res = await fetch(`${base}/api/portal/marking-pdf?run=${(run as { id: string }).id}`, {
      headers: { cookie: session.cookie }, redirect: 'manual', signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    await res?.body?.cancel().catch(() => {});
    if (!res || res.status !== 200) out.push(`control: the test student could not open their own marked paper (HTTP ${res?.status ?? 'none'}) — the test is blind`);
  }
  return out;
}
