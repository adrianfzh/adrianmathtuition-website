// data/science-bench/handin.js — upload a seeded script's pages, save the paper, queue it (SKILL.md Step 4).
// Usage: node data/science-bench/handin.js <paper dir> <seed dir name> [scheme.pdf]
//   no scheme → run 'rules-alone'; with a scheme PDF → it rides save-paper as source.scheme_source, run 'scheme-grounded'
const fs = require('fs'), path = require('path');
const W = '/Users/adrianfong/dev/adrianmathtuition-website';
const env = require(W + '/node_modules/dotenv').parse(fs.readFileSync(W + '/.env.local.bak-2026-09-08'));
const PW = String(env.ADMIN_PASSWORD).trim().replace(/^"|"$/g, '');
const SITE = 'https://www.adrianmathtuition.com';
const H = { Authorization: `Bearer ${PW}` };
const [paperDir, seedName, schemePdf] = process.argv.slice(2);
const mode = schemePdf ? 'scheme-grounded' : 'rules-alone';
const planFile = path.join(paperDir, seedName, 'plan.json');
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
(async () => {
  const pages = fs.readdirSync(path.join(paperDir, seedName, 'pages')).filter(f => f.endsWith('.png')).sort();
  const photos = [];
  for (const [i, f] of pages.entries()) {
    const t = await (await fetch(`${SITE}/api/admin/mark-paper-annotated-token?type=original&filename=${f}`, { headers: H })).json();
    if (!t.uploadUrl) throw new Error('token: ' + JSON.stringify(t));
    const put = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/png', 'x-upsert': 'true' }, body: fs.readFileSync(path.join(paperDir, seedName, 'pages', f)) });
    if (!put.ok) throw new Error('upload ' + put.status + ' ' + await put.text());
    photos.push({ photo_index: i, original_url: t.url });
  }
  let scheme = null;
  if (schemePdf) {
    const t = await (await fetch(`${SITE}/api/admin/mark-paper-annotated-token?type=paper`, { headers: H })).json();
    const put = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' }, body: fs.readFileSync(schemePdf) });
    if (!put.ok) throw new Error('scheme upload ' + put.status);
    scheme = { pdf_url: t.url, pages: [] };
  }
  const totalMax = plan.parts.reduce((a, p) => a + p.max, 0);
  const paperName = `BENCH · ${plan.subject} · ${plan.paperKey} · ${plan.grade} · seed ${String(plan.seed).padStart(2, '0')}${scheme ? ' · scheme' : ''}`;
  const save = await (await fetch(`${SITE}/api/admin/mark-paper`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ phase: 'save-paper', paperName, subject: plan.subject, totalMax, source: { photos, ...(scheme ? { scheme_source: scheme } : {}) } }) })).json();
  const runId = save.run_id || save.id || save.runId;
  if (!runId) throw new Error('save: ' + JSON.stringify(save).slice(0, 400));
  const q = await (await fetch(`${SITE}/api/admin/mark-paper`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ phase: 'enqueue', id: runId, model: 'opus', style: 'teacher' }) })).json();
  plan.runs[mode] = { runId, paperName, ...(schemePdf ? { scheme: require('path').basename(schemePdf) } : {}), queuedAt: new Date().toISOString() };
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 1));
  console.log(seedName, runId, paperName, JSON.stringify(q));
})().catch(e => { console.error(seedName, 'FAILED', e.message); process.exit(1); });
