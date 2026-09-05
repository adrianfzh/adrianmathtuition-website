// Two-account leak test for the student file door (/api/files) + every
// student-facing route — the "hit the API with account B's cookie" check that
// PLAN-PORTAL-SOLO.md makes mandatory per phase. First full run 5 Sep 2026 against
// prod after the private-bucket move: 117 checks, 0 leaks (docs/MARKING.md
// §Student files → Leak test).
//
// Actors: anon · A = the portal test student (Teste Echo) · B = Adrian's own
// portal account · admin bearer. Both A and B are Adrian's fixtures — no real
// student's session is ever minted. Sessions come from auth.admin.generateLink
// (magiclink) + verifyOtp, so no password is needed; cleanup revokes them.
//
// Phases (run from the repo root, needs .env.local with the Supabase secret key):
//   NODE_PATH=$PWD/node_modules node scripts/leak-test/leaktest.cjs setup
//   NODE_PATH=$PWD/node_modules node scripts/leak-test/leaktest.cjs probe
//   -- flip A's run unreleased in SQL (released_at = null), then:
//   NODE_PATH=$PWD/node_modules node scripts/leak-test/leaktest.cjs probe-unreleased
//   -- restore released_at, then:
//   NODE_PATH=$PWD/node_modules node scripts/leak-test/leaktest.cjs cleanup
// SITE=https://adrianmath-dev.vercel.app targets the preview instead.
// setup uploads 13 tiny fixture objects into the private bucket; cleanup removes
// them and prints the bucket root, which must be empty of leftovers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = process.env.LEAKTEST_STATE_DIR || path.join(ROOT, '.leak-test');
fs.mkdirSync(HERE, { recursive: true });
const STATE = path.join(HERE, 'state.json');
const env = dotenv.parse(fs.readFileSync(path.join(ROOT, '.env.local')));
const t = (s) => (s || '').trim().replace(/^"|"$/g, '').replace(/\\n$/, '').trim();
const SB_URL = t(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
const ANON = t(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY);
const SECRET = t(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
const ADMIN_PW = t(env.ADMIN_PASSWORD);
const SITE = process.env.SITE || 'https://www.adrianmathtuition.com';
const BUCKET = 'student-files';
for (const [k, v] of Object.entries({ SB_URL, ANON, SECRET, ADMIN_PW })) {
  if (!v || v.includes('SENSITIVE')) { console.error(`missing/masked ${k}`); process.exit(2); }
}

// ── fixtures (all rows belong to Adrian's own two accounts, or are ids only) ──
const A = { email: 'portal-teste@example.com', identity: 'recNjZkA3Z41nhwwK', run: '2bf5b9e1-9f18-40d1-9e5d-3959f7bbc84c',
  note: 'ac65079a-e2d5-455a-b197-25c8f570b3e0', assignments: ['440f54ea-d7fe-4b99-8d58-65d265bd5096', '6e890260-0a91-42ef-97da-4153a6c81ff7', 'cc3644ef-e6d7-4e40-994c-a45f2c617338'] };
const B = { email: 'adrianmathtuition@gmail.com', identity: 'rec42gfYk47inTQwz', run: '93674b04-a980-4925-a25e-f3c31bf94cfc' };
const OTHER_UNREL = '5a812cac-656f-4a90-9e8d-ea9a48e5c5c2';
const OTHER_REL = 'cdf47c13-8540-4bd4-be1b-64a691f1da3c';
const OTHER_NOTE = 'b6dee07b-805b-4409-8327-5db2837816c4';
const OTHER_ASSIGN = '0d21235b-3ef6-48ef-9e01-687ea8a525c3';

function loadState() { return fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {}; }
function saveState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

function fixtureKeys(st) {
  return {
    'runs/A': `runs/${A.run}/leak.pdf`,
    'runs/B': `runs/${B.run}/leak.pdf`,
    'runs/other-unreleased': `runs/${OTHER_UNREL}/leak.pdf`,
    'runs/other-released': `runs/${OTHER_REL}/leak.pdf`,
    'runs/nonexistent-run': `runs/${st.randRun}/leak.pdf`,
    'handins/A': `handins/${A.identity}/leak.pdf`,
    'handins/B': `handins/${B.identity}/leak.pdf`,
    'clippings/A': `clippings/${A.identity}/leak.pdf`,
    'clippings/B': `clippings/${B.identity}/leak.pdf`,
    'assignments/A': `assignments/${A.identity}/leak.pdf`,
    'assignments/B': `assignments/${B.identity}/leak.pdf`,
    'uploads/unreferenced': `uploads/${st.randUpload}/leak.pdf`,
    'inbox': `inbox/leak.pdf`,
  };
}

async function mintCookies(email) {
  const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink ${email}: ${error.message}`);
  const anon = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: v, error: e2 } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
  if (e2) throw new Error(`verifyOtp ${email}: ${e2.message}`);
  const session = v.session;
  // Let @supabase/ssr write the cookie exactly as the browser would.
  const jar = {};
  const ssr = createServerClient(SB_URL, ANON, {
    cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (cs) => { for (const c of cs) jar[c.name] = c.value; } },
    auth: { autoRefreshToken: false },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  await ssr.auth.getSession();
  if (!Object.keys(jar).length) {
    // manual fallback: base64url JSON session, chunked at 3180
    const ref = new URL(SB_URL).hostname.split('.')[0];
    const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
    const name = `sb-${ref}-auth-token`;
    if (raw.length <= 3180) jar[name] = raw; else for (let i = 0; i * 3180 < raw.length; i++) jar[`${name}.${i}`] = raw.slice(i * 3180, (i + 1) * 3180);
  }
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  return { cookie, userId: session.user.id, accessToken: session.access_token, cookieNames: Object.keys(jar) };
}

async function setup() {
  const st = loadState();
  st.randRun = crypto.randomUUID(); st.randUpload = crypto.randomUUID();
  const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false } });
  const keys = fixtureKeys(st);
  for (const [label, key] of Object.entries(keys)) {
    const body = Buffer.from(`LEAKTEST-FIXTURE ${label} ${key} ${new Date().toISOString()}\n`);
    const { error } = await admin.storage.from(BUCKET).upload(key, body, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`upload ${key}: ${error.message}`);
  }
  st.keys = keys;
  st.A = await mintCookies(A.email);
  st.B = await mintCookies(B.email);
  saveState(st);
  console.log('fixtures uploaded:', Object.keys(keys).length);
  console.log('cookies minted: A', st.A.cookieNames, 'B', st.B.cookieNames);
}

const ACTORS = (st) => ({
  anon: {},
  A: { Cookie: st.A.cookie },
  B: { Cookie: st.B.cookie },
  admin: { Authorization: `Bearer ${ADMIN_PW}` },
});

async function hit(pathname, headers, opts = {}) {
  const r = await fetch(SITE + pathname, { headers, redirect: 'manual', method: opts.method || 'GET', body: opts.body });
  const ct = r.headers.get('content-type') || '';
  let text = '';
  const buf = Buffer.from(await r.arrayBuffer());
  text = buf.toString('utf8');
  return { status: r.status, ct, len: buf.length, text, loc: r.headers.get('location') || '' };
}

const results = [];
function record(area, what, actor, expect, res, extraOk = true) {
  const ok = (Array.isArray(expect) ? expect.includes(res.status) : res.status === expect) && extraOk;
  results.push({ area, what, actor, expect: Array.isArray(expect) ? expect.join('|') : expect, got: res.status, len: res.len, ok });
  return ok;
}

async function probe() {
  const st = loadState();
  const actors = ACTORS(st);
  const K = st.keys;
  // expected [anon, A, B, admin]
  const M = {
    'runs/A': [401, 200, 401, 200],
    'runs/B': [401, 401, 200, 200],
    'runs/other-unreleased': [401, 401, 401, 200],
    'runs/other-released': [401, 401, 401, 200],
    'runs/nonexistent-run': [401, 401, 401, 200],
    'handins/A': [401, 200, 401, 200],
    'handins/B': [401, 401, 200, 200],
    'clippings/A': [401, 200, 401, 200],
    'clippings/B': [401, 401, 200, 200],
    'assignments/A': [401, 200, 401, 200],
    'assignments/B': [401, 401, 200, 200],
    'uploads/unreferenced': [401, 401, 401, 200],
    'inbox': [401, 401, 401, 200],
  };
  for (const [label, exp] of Object.entries(M)) {
    const key = K[label];
    const p = '/api/files/' + key.split('/').map(encodeURIComponent).join('/');
    for (const [i, actor] of ['anon', 'A', 'B', 'admin'].entries()) {
      const res = await hit(p, actors[actor]);
      const bodyOk = res.status !== 200 || res.text.includes('LEAKTEST-FIXTURE');
      const noLeak = res.status === 200 ? true : !res.text.includes('LEAKTEST-FIXTURE');
      record('files', label, actor, exp[i], res, bodyOk && noLeak);
    }
  }
  // path tricks as B (must never reach A's file) and anon
  const tricks = {
    'dotdot-encoded': `/api/files/runs/%2e%2e/handins/${A.identity}/leak.pdf`,
    'slash-in-segment-dotdot': `/api/files/handins/${B.identity}%2F..%2F${A.identity}/leak.pdf`,
    'uppercase-root': `/api/files/HANDINS/${A.identity}/leak.pdf`,
    'nul-byte': `/api/files/handins/${A.identity}/leak.pdf%00`,
    'trailing-dot': `/api/files/handins/${A.identity}/leak.pdf.`,
    'encoded-slash-whole-key': `/api/files/handins%2F${A.identity}%2Fleak.pdf`,
    'double-encoded': `/api/files/handins/${A.identity}/leak%252Etxt`,
    'backslash': `/api/files/handins/${A.identity}%5C..%5C${B.identity}/leak.pdf`,
  };
  for (const [label, p] of Object.entries(tricks)) {
    for (const actor of ['anon', 'B']) {
      const res = await hit(p, actors[actor]);
      record('files-tricks', label, actor, [401, 404, 400], res, !res.text.includes('LEAKTEST-FIXTURE'));
    }
  }
  // student routes
  const noA = (res) => !res.text.includes(A.identity) && !res.text.includes('Teste') && !res.text.includes('portal-teste') && !res.text.includes(A.run) && !res.text.includes(A.note) && !A.assignments.some(id => res.text.includes(id));
  const noB = (res) => !res.text.includes(B.identity) && !res.text.includes(B.run);
  let res;
  res = await hit(`/api/portal/marking-pdf?run=${A.run}`, actors.A); record('routes', 'marking-pdf A-run', 'A', 200, res, res.ct.includes('pdf'));
  res = await hit(`/api/portal/marking-pdf?run=${A.run}`, actors.B); record('routes', 'marking-pdf A-run', 'B', 404, res);
  res = await hit(`/api/portal/marking-pdf?run=${A.run}`, actors.anon); record('routes', 'marking-pdf A-run', 'anon', [401, 302, 303, 307], res);
  res = await hit(`/api/portal/marking-pdf?run=${B.run}`, actors.A); record('routes', 'marking-pdf B-run', 'A', 404, res);
  res = await hit(`/api/portal/marking-pdf?run=${B.run}`, actors.B); record('routes', 'marking-pdf B-run', 'B', 200, res, res.ct.includes('pdf'));
  res = await hit(`/api/portal/marking-pdf?run=${OTHER_REL}`, actors.A); record('routes', 'marking-pdf other-released', 'A', 404, res);
  res = await hit(`/api/portal/marking-pdf?run=${OTHER_UNREL}`, actors.B); record('routes', 'marking-pdf other-unreleased', 'B', 404, res);
  res = await hit(`/api/portal/practice-pdf?run=${A.run}`, actors.B); record('routes', 'practice-pdf A-run', 'B', 404, res);
  res = await hit(`/api/portal/practice-pdf?run=${A.run}`, actors.A); record('routes', 'practice-pdf A-run (own; 200 or "no practice" 404)', 'A', [200, 404], res);
  res = await hit(`/api/portal/my-notes`, actors.A); record('routes', 'my-notes list has own note', 'A', 200, res, res.text.includes(A.note) && noB(res));
  res = await hit(`/api/portal/my-notes`, actors.B); record('routes', 'my-notes list excludes A', 'B', 200, res, noA(res));
  res = await hit(`/api/portal/my-notes`, actors.anon); record('routes', 'my-notes', 'anon', 401, res);
  res = await hit(`/api/portal/my-notes?id=${A.note}`, actors.B, { method: 'DELETE' }); record('routes-writes', 'my-notes DELETE A-note', 'B', 404, res);
  res = await hit(`/api/portal/my-notes?id=${OTHER_NOTE}`, actors.A, { method: 'DELETE' }); record('routes-writes', 'my-notes DELETE other-note', 'A', 404, res);
  res = await hit(`/api/portal/my-notes`, actors.B, { method: 'PATCH', body: JSON.stringify({ id: A.note, note: 'leaktest' }) }); record('routes-writes', 'my-notes PATCH A-note', 'B', [404, 400], res);
  res = await hit(`/api/portal/assignments`, actors.A); record('routes', 'assignments list has own', 'A', 200, res, A.assignments.some(id => res.text.includes(id)) && noB(res));
  res = await hit(`/api/portal/assignments`, actors.B); record('routes', 'assignments list excludes A', 'B', 200, res, noA(res));
  res = await hit(`/api/portal/assignments`, actors.anon); record('routes', 'assignments', 'anon', 401, res);
  for (const id of [A.assignments[1], OTHER_ASSIGN]) {
    res = await hit(`/app/assignments/${id}`, actors.B); record('pages', `assignments/${id.slice(0, 8)} page`, 'B', [404, 302, 303, 307], res, noA(res));
  }
  res = await hit(`/app/assignments/${A.assignments[1]}`, actors.A); record('pages', 'own assignment page', 'A', 200, res);
  res = await hit(`/app/marking`, actors.A); record('pages', '/app/marking lists own run', 'A', 200, res, res.text.includes(A.run) && noB(res));
  res = await hit(`/app/marking`, actors.B); record('pages', '/app/marking excludes A', 'B', 200, res, noA(res));
  res = await hit(`/app/marking`, actors.anon); record('pages', '/app/marking', 'anon', [302, 303, 307], res);
  for (const r of ['dashboard', 'notebook', 'export', 'requests', 'practice-history', 'plan', 'reschedule']) {
    res = await hit(`/api/portal/${r}`, actors.B); record('routes', `${r} excludes A`, 'B', [200, 403, 404], res, noA(res));
    res = await hit(`/api/portal/${r}`, actors.A); record('routes', `${r} excludes B`, 'A', [200, 403, 404], res, noB(res));
    res = await hit(`/api/portal/${r}`, actors.anon); record('routes', r, 'anon', [401, 302, 303, 307], res);
  }
  // legacy Blob (known gap): A's clipping image is still public by URL
  const blobUrl = st.legacyBlobUrl;
  if (blobUrl) { const r = await fetch(blobUrl, { redirect: 'manual' }); results.push({ area: 'legacy-blob', what: 'A clipping image, anon', actor: 'anon', expect: 'known-public', got: r.status, len: 0, ok: true }); }
  report();
}

async function probeUnreleased() {
  const st = loadState(); const actors = ACTORS(st);
  const p = '/api/files/' + st.keys['runs/A'].split('/').map(encodeURIComponent).join('/');
  let res = await hit(p, actors.A); record('unreleased', 'files runs/A while unreleased', 'A', 401, res, !res.text.includes('LEAKTEST-FIXTURE'));
  res = await hit(`/api/portal/marking-pdf?run=${A.run}`, actors.A); record('unreleased', 'marking-pdf A-run while unreleased', 'A', 404, res);
  res = await hit(`/app/marking`, actors.A); record('unreleased', '/app/marking hides unreleased run', 'A', 200, res, !res.text.includes(A.run));
  res = await hit(p, actors.admin); record('unreleased', 'files runs/A admin still reads', 'admin', 200, res);
  report();
}

async function cleanup() {
  const st = loadState();
  const admin = createClient(SB_URL, SECRET, { auth: { persistSession: false } });
  const { data, error } = await admin.storage.from(BUCKET).remove(Object.values(st.keys || {}));
  if (error) throw error;
  console.log('removed fixtures:', (data || []).length);
  for (const who of ['A', 'B']) {
    if (st[who]?.accessToken) { const { error: e } = await admin.auth.admin.signOut(st[who].accessToken, 'global'); console.log(`signOut ${who}:`, e ? e.message : 'ok'); }
  }
  fs.rmSync(STATE, { force: true });
  const { data: left } = await admin.storage.from(BUCKET).list('', { limit: 5 });
  console.log('bucket root entries after cleanup:', (left || []).map(x => x.name));
}

function report() {
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length} checks, ${bad.length} FAILED`);
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${pad(r.area, 14)} ${pad(r.what, 46)} ${pad(r.actor, 6)} want ${pad(r.expect, 12)} got ${r.got} (${r.len}b)`);
  fs.writeFileSync(path.join(HERE, `results-${process.argv[2]}.json`), JSON.stringify(results, null, 2));
  if (bad.length) process.exitCode = 1;
}

(async () => {
  const phase = process.argv[2];
  if (phase === 'setup') await setup();
  else if (phase === 'probe') await probe();
  else if (phase === 'probe-unreleased') await probeUnreleased();
  else if (phase === 'cleanup') await cleanup();
  else { console.error('phase?'); process.exit(2); }
})().catch(e => { console.error(e); process.exit(1); });
