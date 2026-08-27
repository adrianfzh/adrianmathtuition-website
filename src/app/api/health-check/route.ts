import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';
import { listPrintablesForLevel, dropboxFolderFor } from '@/lib/notes-list';
import { publishedSolutions } from '@/data/model-solutions';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Synthetic monitoring of the parent/student-facing surfaces (cron: every 6h).
// Each check probes a real dependency the way production traffic would; any
// failure fires a Telegram alert naming exactly what broke. Quiet when green.
//
// Adding a feature with a new parent-facing surface? Add a check here —
// see CLAUDE.md "Testing & monitoring policy".

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return verifyAdminAuth(req);
}

type Result = { name: string; ok: boolean; ms: number; info?: string };

async function timed(name: string, fn: () => Promise<string | void>): Promise<Result> {
  const t0 = Date.now();
  try {
    const info = await fn();
    return { name, ok: true, ms: Date.now() - t0, ...(info ? { info } : {}) };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, info: (e as Error).message.slice(0, 160) };
  }
}

const T = (ms: number) => AbortSignal.timeout(ms);

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const base = process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com';

  // Airtable first — its slot feeds the signup-link check.
  let firstSlotId = '';
  const results: Result[] = [];
  results.push(await timed('airtable', async () => {
    const d = await airtableRequest('Slots', `?filterByFormula=${encodeURIComponent('{Is Active}=1')}&maxRecords=1`);
    if (!d.records?.length) throw new Error('no active slots returned');
    firstSlotId = d.records[0].id;
    return `${d.records.length} slot`;
  }));

  const parallelChecks = await Promise.all([
    // Every live slot must state how many bodies it takes. The bot falls back to
    // DEFAULT_MAKEUP_CAPACITY (4) when the field is blank, and Adrian's answer to
    // "why would Makeup Capacity be blank?" was "it should not be" — so the
    // fallback should never actually fire. This is what makes that true: nothing
    // the website creates leaves it blank, and if a slot is ever hand-made in
    // Airtable without one, this alerts instead of quietly booking 4 into it.
    // Same check catches a Time that no picker can parse (it would sort last).
    timed('slot-fields', async () => {
      const d = await airtableRequest('Slots', `?filterByFormula=${encodeURIComponent('{Is Active}=1')}&fields[]=Day&fields[]=Time&fields[]=Makeup Capacity`);
      type SlotRow = { fields: Record<string, unknown> };
      const rows: SlotRow[] = d.records || [];
      const blankCap = rows.filter((r) => !r.fields['Makeup Capacity']);
      const badTime = rows.filter((r) =>
        !/\d{1,2}(:\d{2})?\s*(am|pm)?\s*-\s*\d{1,2}(:\d{2})?\s*(am|pm)/i.test(String(r.fields['Time'] || '')));
      const label = (r: SlotRow) => `${r.fields['Day'] || '?'} ${r.fields['Time'] || '?'}`;
      const problems = [
        ...blankCap.map((r) => `blank Makeup Capacity: ${label(r)}`),
        ...badTime.map((r) => `unreadable Time: ${label(r)}`),
      ];
      if (problems.length) throw new Error(problems.slice(0, 4).join('; '));
      return `${rows.length} slots OK`;
    }),
    // Public schedule the homepage renders
    timed('public-schedule', async () => {
      const r = await fetch(`${base}/api/schedule`, { signal: T(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!Array.isArray(d.slots) || d.slots.length === 0) throw new Error('no slots in response');
      return `${d.slots.length} slots`;
    }),
    // Signup link validation — the exact HMAC handshake a parent's link performs
    timed('signup-link', async () => {
      if (!firstSlotId || !process.env.SIGNUP_SECRET) throw new Error('no slot/secret to test with');
      const params = new URLSearchParams();
      params.set('slotId', firstSlotId);
      params.set('level', 'Sec 3');
      params.set('subjects', 'E Math');
      params.set('expires', String(Date.now() + 10 * 60 * 1000));
      const sig = createHmac('sha256', process.env.SIGNUP_SECRET).update(params.toString()).digest('hex').slice(0, 16);
      params.set('sig', sig);
      const r = await fetch(`${base}/api/signup-data?${params.toString()}`, { signal: T(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.slotName) throw new Error('no slotName in response');
      return d.slotName;
    }),
    // Invoice PDF storage — a stored invoice PDF must still download
    timed('invoice-pdf', async () => {
      const d = await airtableRequest('Invoices', `?filterByFormula=${encodeURIComponent(`NOT({PDF URL}='')`)}&maxRecords=1&fields[]=PDF%20URL`);
      const url = d.records?.[0]?.fields?.['PDF URL'];
      if (!url) return 'no stored PDFs to probe (skipped)';
      const r = await fetch(url, { signal: T(10000) });
      if (!r.ok) throw new Error(`blob HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 5_000) throw new Error(`blob suspiciously small (${buf.byteLength}b)`);
      return `${Math.round(buf.byteLength / 1024)}KB`;
    }),
    // Dropbox notes — kiosk "Learn" + /admin/notes
    timed('dropbox-notes', async () => {
      if (!dropboxConfigured()) return 'not configured (skipped)';
      // Probe through the real listing path (incl. the legacy-root fallback) so
      // a wrong folder is caught here rather than silently listing nothing.
      const { notes } = await listPrintablesForLevel('notes', 'em');
      const pdfs = notes.filter(n => n.source === 'dropbox').length;
      if (pdfs === 0) throw new Error('EM notes folder returned 0 files');
      return `${pdfs} files`;
    }),
    // Dropbox revision worksheets — kiosk "Revise" (student-facing since 2026-08-11)
    timed('dropbox-revision', async () => {
      if (!dropboxConfigured()) return 'not configured (skipped)';
      const { notes } = await listPrintablesForLevel('revision', 'em');
      const pdfs = notes.filter(n => n.source === 'dropbox').length;
      if (pdfs === 0) throw new Error('EM revision folder returned 0 files');
      return `${pdfs} files`;
    }),
    // Dropbox practice worksheets — kiosk "Practice" → printed sheets.
    // Practice/ is new and fills up as Adrian uploads, so 0 PDFs is not yet a
    // failure — but a MISSING folder is, and listFolder surfaces that as
    // not_found where listPrintablesForLevel would swallow it as "no files".
    timed('dropbox-practice', async () => {
      if (!dropboxConfigured()) return 'not configured (skipped)';
      const folder = dropboxFolderFor('practice', 'em');
      if (!folder) throw new Error('no Practice folder mapped for EM');
      const entries = await listFolder(`/${folder}`);
      const pdfs = entries.filter(e => e.tag === 'file' && /\.pdf$/i.test(e.name)).length;
      return pdfs > 0 ? `${pdfs} files` : 'folder ok, 0 PDFs yet';
    }),
    // Referral landing (/r/<code> — parent-facing invite links in invoice emails).
    // Probes with a syntactically-valid-but-unknown id: the page must still 200
    // with the generic invite (no Airtable data dependency in the check).
    timed('referral-landing', async () => {
      const r = await fetch('https://www.adrianmathtuition.com/r/recAAAAAAAAAAAAAA', { signal: T(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      if (!html.includes('Adrian')) throw new Error('landing rendered without expected content');
      return 'ok';
    }),
    // The public model-solutions library (Adrian approved the content
    // 2026-08-24; linked from the footer + sitemap since). Index and the first
    // published solution page must both render.
    timed('solutions', async () => {
      const r = await fetch(`${base}/solutions`, { signal: T(10000) });
      if (!r.ok) throw new Error(`index HTTP ${r.status}`);
      const first = publishedSolutions()[0];
      if (first) {
        const s = await fetch(`${base}/solutions/${first.slug}`, { signal: T(10000) });
        if (!s.ok) throw new Error(`${first.slug}: HTTP ${s.status}`);
      }
      return 'ok';
    }),
    // Print-a-paper (SPEC-PRINT-PAPER.md): the pre-registration table must be
    // reachable with the service key — generation and hand-in linkage both
    // die without it. Head count only; the draw itself rides kiosk_pool,
    // already covered by the kiosk probe.
    timed('print-paper', async () => {
      const { getSupabaseAdmin } = await import('@/lib/supabase');
      const { error } = await getSupabaseAdmin()
        .from('portal_generated_papers')
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return 'ok';
    }),
    // Resend (welcome emails, invoices, receipts)
    timed('resend', async () => {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
      // Resend's API occasionally dawdles past the 10s cap on quiet nights (false
      // alarm 2026-08-20 02:00 SGT; fine again seconds later) — one retry separates
      // a slow night from a real outage.
      const ping = async () => {
        const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: T(10000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      };
      try { await ping(); } catch { await ping(); }
    }),
    // Kiosk status endpoint
    timed('kiosk', async () => {
      const r = await fetch(`${base}/api/kiosk/status`, { signal: T(10000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    }),
    // Marking triage: the released_at column the release gate writes. Without it
    // every marked script silently re-appears in the queue forever.
    timed('mark-triage', async () => {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/paper_marking_runs?select=id,released_at&limit=1`,
        {
          headers: {
            apikey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          },
          signal: T(10000),
        }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    }),
    // /app/marking — where the release nudge sends the student. This check is
    // here because that link shipped BEFORE the page did and 404'd silently:
    // nothing on Adrian's side goes red when a student taps a dead link. An
    // unauthenticated GET must redirect to /login (the auth gate), so anything
    // that isn't a redirect — 404 especially — means the route is gone. The
    // second half proves the two columns that scope a student to their OWN
    // papers still resolve; lose either and the page shows the wrong scripts or
    // none at all.
    timed('portal-marking', async () => {
      const r = await fetch(`${base}/app/marking`, { redirect: 'manual', signal: T(10000) });
      if (r.status === 404) throw new Error('/app/marking is missing — release links 404');
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);

      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const q = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/paper_marking_runs?select=id,student_id,released_at&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!q.ok) throw new Error(`columns? HTTP ${q.status}: ${(await q.text()).slice(0, 120)}`);
      return `page ${r.status}`;
    }),
    // Student paper hand-ins (/app/submit). The token route must answer — 401
    // without a session is the healthy signal (the route is deployed and its
    // auth gate is up); a 404 means students silently lose the submit path,
    // and a 500 usually means the Blob token env broke.
    timed('portal-submit', async () => {
      const r = await fetch(`${base}/api/portal/submit-token?filename=probe.jpg`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      return 'auth gate up';
    }),
    // The error notebook (/app/notebook). 401 anonymously proves the API is
    // deployed with its gate up; the REST probe proves notebook_entries still
    // answers — a dropped table would otherwise surface only as students'
    // notebooks silently emptying.
    timed('portal-notebook', async () => {
      const r = await fetch(`${base}/api/portal/notebook`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const q = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/notebook_entries?select=id&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!q.ok) throw new Error(`notebook_entries? HTTP ${q.status}`);
      return 'auth gate up';
    }),
    // "My Plan" (/app/plan, SPEC-REVISION-PLAN.md). Anonymous 401 proves the
    // route is deployed with its auth gate up; the tables it reads are already
    // probed by portal-marking + portal-notebook above.
    timed('portal-plan', async () => {
      const r = await fetch(`${base}/api/portal/plan`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      return 'auth gate up';
    }),
    // "From Adrian" assigned work (SPEC-ASSIGN.md). The student list route must
    // hold its auth gate (401 anonymously — a 404 means the Home card and
    // /app/assignments silently vanish), and the table + the columns the Home
    // card reads must still resolve.
    timed('assignments', async () => {
      const r = await fetch(`${base}/api/portal/assignments`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const q = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/portal_assignments?select=id,status,kind,title,due_on,airtable_student_id&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!q.ok) throw new Error(`table? HTTP ${q.status}: ${(await q.text()).slice(0, 120)}`);
      return 'auth gate up';
    }),
    // Student resource requests (/app/requests → /admin/requests, v1
    // human-in-the-loop). The student route must hold its auth gate (401
    // anonymously — a 404 means the tab silently vanishes and asks stop
    // reaching Adrian's Telegram), and the table + the columns both UIs read
    // must still resolve.
    timed('portal-requests', async () => {
      const r = await fetch(`${base}/api/portal/requests`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const q = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/portal_requests?select=id,status,kind,detail,result_url,admin_note,airtable_student_id&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!q.ok) throw new Error(`table? HTTP ${q.status}: ${(await q.text()).slice(0, 120)}`);
      return 'auth gate up';
    }),
    // Photo→similar + search→generate on the practice tab (lib/portal-find).
    // Anonymous 401 proves each route is deployed with its session gate up —
    // a 404 means the 📷/🔍 finder silently dies for every student.
    timed('portal-similar', async () => {
      const r = await fetch(`${base}/api/portal/similar`, { method: 'POST', redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      return 'auth gate up';
    }),
    // The generate route additionally leans on portal_generation_log (the
    // 5-a-day cap's ledger) — a dropped table would fail the cap OPEN, so the
    // REST probe proves the table + the columns the routes write still resolve.
    timed('portal-generate', async () => {
      const r = await fetch(`${base}/api/portal/generate`, { method: 'POST', redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const q = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/portal_generation_log?select=id,airtable_student_id,kind,qb_hit,generated,question_id&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!q.ok) throw new Error(`portal_generation_log? HTTP ${q.status}: ${(await q.text()).slice(0, 120)}`);
      return 'auth gate up';
    }),
    // Portal reschedule (Home "Change" → /app/reschedule → bot lib/reschedule.js).
    // The route must hold its auth gate — a 404 here means students silently
    // lose self-service lesson moves and fall back to messaging Adrian.
    timed('portal-reschedule', async () => {
      const r = await fetch(`${base}/api/portal/reschedule`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      return 'auth gate up';
    }),
    // Web-push subscriptions (/app/settings toggle → "marked paper ready"
    // notifications). 401 anonymously proves the subscribe route is deployed
    // with its session gate up — a 404 means students silently stop being able
    // to opt in, and released-paper pushes dry up as endpoints expire.
    timed('portal-push', async () => {
      const r = await fetch(`${base}/api/portal/push`, { method: 'POST', redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      return 'auth gate up';
    }),
    // HitPay payment webhook (the $29 portal-pass money plumbing). An empty
    // unsigned POST must draw 503 (deployed but HITPAY_WEBHOOK_SALT not yet
    // configured — expected until Adrian pastes the keys) or 403 (salt set and
    // the signature gate rejecting the probe — correct live behaviour). EITHER
    // passes: both prove the route exists and refuses unverified input. What
    // must never happen is 404 (route gone → HitPay retries exhaust and real
    // payments silently stop granting passes) or 500 (handler crashing).
    timed('hitpay-webhook', async () => {
      const r = await fetch(`${base}/api/payments/hitpay-webhook`, { method: 'POST', redirect: 'manual', signal: T(10000) });
      if (r.status !== 503 && r.status !== 403) {
        throw new Error(`expected 503 (unconfigured) or 403 (sig gate), got HTTP ${r.status}`);
      }
      return r.status === 503 ? 'deployed, awaiting HitPay salt' : 'signature gate up';
    }),
    // "Save to My Notes" (/app/my-notes + the ✂️ clipper on /app/marking).
    // Anonymous 401 proves the route is deployed with its auth gate up; the
    // REST probe proves portal_notes still answers — a dropped table would
    // otherwise surface only as students' clippings silently vanishing.
    timed('portal-my-notes', async () => {
      const r = await fetch(`${base}/api/portal/my-notes`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const q = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/portal_notes?select=id&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!q.ok) throw new Error(`portal_notes? HTTP ${q.status}`);
      return 'auth gate up';
    }),
    // Practice topic picker (/app/practice → lib/practice-strands + topic-picker).
    // The question-type route must hold its auth gate, and the two RPCs the
    // picker is built on must still answer with rows for a JC bank AND a Sec 3
    // scope — the picker went silently EMPTY for JC and Sec 3 students for
    // weeks (2026-08-22) because the portal passed 'JC2' / 'S3_AM' straight to
    // subgroup-keyed RPCs; an overload drift on `practice_subgroups` would do
    // the same. Zero rows here = students see "no topics", nothing red anywhere.
    timed('practice-picker', async () => {
      const r = await fetch(`${base}/api/portal/practice/subgroups?level=AM`, { redirect: 'manual', signal: T(10000) });
      if (r.status !== 401) throw new Error(`expected 401 (auth gate), got HTTP ${r.status}`);
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const rpc = async (fn: string, body: Record<string, unknown>) => {
        const q = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: T(10000),
        });
        if (!q.ok) throw new Error(`${fn}: HTTP ${q.status}: ${(await q.text()).slice(0, 120)}`);
        const rows = await q.json();
        if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${fn} ${JSON.stringify(body)} returned no rows`);
        return rows as { n?: number }[];
      };
      const jc = await rpc('practice_topics', { p_level: 'JC', p_qlevel: null });
      const s3 = await rpc('practice_topics', { p_level: 'AM', p_qlevel: 'S3_AM' });
      const types = await rpc('practice_subgroups', { p_level: 'AM', p_topic: null, p_qlevel: null });
      // Pool-size floor (2026-08-22): the topic-tag fallback (practice_pool)
      // lifted JC from ~2.1k to ~8k topic-rows. A regression to filing-only
      // (someone redefining an RPC without the pool) would silently show JC
      // students a quarter of the bank — the floor makes that red.
      const jcTotal = jc.reduce((a, r) => a + (Number(r.n) || 0), 0);
      if (jcTotal < 4000) throw new Error(`JC practice pool shrank to ${jcTotal} (expected ≥ 4000 — topic-tag fallback lost?)`);
      return `JC ${jc.length} topics / ${jcTotal} q · S3 AM ${s3.length} · AM ${types.length} question types`;
    }),
    // The parent-report store the monthly cron writes into. It runs unattended
    // on the 1st, so a broken table or renamed column would mean parents simply
    // stop hearing anything, with nothing on screen to say why.
    timed('parent-digests', async () => {
      const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/parent_digests?select=id,period,period_label,body_md,status&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: T(10000) }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    }),
    // The Next Lesson Plan field the kiosk "📌 For you today" card reads. A
    // missing field means students land on the kiosk with no starting point.
    timed('next-lesson-plan', async () => {
      const r = await fetch(
        `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Lessons?maxRecords=1&fields%5B%5D=${encodeURIComponent('Next Lesson Plan')}`,
        { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` }, signal: T(10000) }
      );
      if (!r.ok) throw new Error(`field missing? HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    }),
    // Worksheet-on-demand (/api/bot/worksheet) — the bot asks this route for a
    // practice PDF and forwards the link to a parent, so a break here is
    // parent-facing and silent (the bot just says it can't build a sheet).
    // Dry mode does everything except Puppeteer + Blob: it proves the
    // x-render-secret handshake, the level alias map, the topic RPC and the
    // question pool all still answer. A pool that has emptied out is a failure —
    // a sheet with no questions is exactly the thing this must never send.
    timed('bot-worksheet', async () => {
      if (!process.env.RENDER_MARKING_SECRET) throw new Error('RENDER_MARKING_SECRET missing');
      const r = await fetch(`${base}/api/bot/worksheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-render-secret': process.env.RENDER_MARKING_SECRET },
        body: JSON.stringify({ dry: true, level: 'S3_AM', topic: 'Binomial Theorem' }),
        signal: T(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
      const j = await r.json() as { ok?: boolean; poolSize?: number };
      if (!j.ok || !j.poolSize) throw new Error(`empty pool for A Math · Binomial Theorem (poolSize ${j.poolSize ?? '?'})`);
      return `pool ${j.poolSize}`;
    }),
    // Telegram bot machine on Fly (deploys have left it stopped before)
    timed('telegram-bot', async () => {
      const r = await fetch('https://adrianmath-telegram-math-bot.fly.dev/', { signal: T(15000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status} — machine down?`);
    }),
  ]);
  results.push(...parallelChecks);

  // ── The centre's logbook (job_runs): missed-slot + failed-run alarms ──────────
  // Every automated job stamps one row when it finishes (lib/job-log.ts); the
  // rules live in lib/job-health.ts (pure, tested). A job that misses its rhythm
  // or last finished in failure goes red HERE — which is what turns a silent 3:30am
  // no-show on the Mac into a Telegram at breakfast. Jobs that have never stamped
  // are skipped (visible on /admin/ops, never an alarm).
  results.push(await timed('ops-jobs', async () => {
    const { latestJobRuns } = await import('@/lib/job-log');
    const { staleJobs } = await import('@/lib/job-health');
    const latest = await latestJobRuns();
    const stale = staleJobs(latest, new Date());
    if (stale.length) throw new Error(stale.map(s => `${s.job}: ${s.reason}`).join(' · '));
    return `${latest.length} jobs stamped, all on rhythm`;
  }));
  // The marking queue is event-driven (no rhythm), so its health signal is LAG:
  // a queued, unmarked, unfailed paper older than 2h means the worker is stuck —
  // Batch API rounds normally land well inside the hour.
  results.push(await timed('marking-queue-lag', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase');
    const { data, error } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .select('id, created_at, queue:result_json->queue')
      .is('total_max', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`queue read failed: ${error.message}`);
    type Q = { queued_at?: string; failed_at?: string };
    const lagged = (data || []).filter((r) => {
      const q = (r as { queue?: Q }).queue;
      if (!q || !q.queued_at || q.failed_at) return false;
      return Date.now() - new Date(q.queued_at).getTime() > 2 * 3600e3;
    });
    if (lagged.length) throw new Error(`${lagged.length} queued paper(s) unmarked for over 2h — worker stuck?`);
    return 'no queue lag';
  }));

  // The health check stamps its own row too, so /admin/ops shows when the watcher
  // itself last watched. Best-effort like every stamp.
  {
    const { logJobRun } = await import('@/lib/job-log');
    const bad = results.filter(r => !r.ok).length;
    await logJobRun('health-check', bad === 0, bad === 0 ? `all ${results.length} checks green` : `${bad}/${results.length} checks failing`);
  }

  const failures = results.filter(r => !r.ok);
  if (failures.length) {
    try {
      await sendTelegram(
        `🚨 <b>Health check FAILED</b> (${failures.length}/${results.length})\n\n` +
        failures.map(f => `❌ <b>${f.name}</b>: ${f.info || 'failed'}`).join('\n') +
        `\n\n✅ passing: ${results.filter(r => r.ok).map(r => r.name).join(', ') || 'none'}`
      );
    } catch { /* alert is best-effort */ }
  }

  return NextResponse.json({ ok: failures.length === 0, results });
}
