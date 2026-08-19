const fs = require('fs');
const env = require('dotenv').parse(fs.readFileSync('/Users/adrianfong/dev/adrianmathtuition-website/.env.local'));
const H = { Authorization: `Bearer ${env.ADMIN_PASSWORD}`, 'Content-Type': 'application/json' };
const BASE = 'https://www.adrianmathtuition.com';
(async () => {
  const id = '06227fa2-13fd-4bc8-be36-b184831a318d';
  const d = await (await fetch(`${BASE}/api/admin/mark-paper`, { method: 'POST', headers: H, body: JSON.stringify({ phase: 'run', id }) })).json();
  const rj = d.run?.result_json || {};
  const mk = (mode) => ({
    results: (rj.results || []).map((r) => ({ question_number: r.question_number, marking_output: r.marking_output, photo_index: r.photo_index })),
    annotated_photos: rj.annotated_photos || [], totals: rj.totals || null,
    student: { name: '', level: '' }, multi: true, mode,
  });
  for (const mode of ['photos', 'full']) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${BASE}/api/admin/mark-paper-pdf`, { method: 'POST', headers: H, body: JSON.stringify(mk(mode)) });
      const txt = await r.text();
      console.log(`${mode}: HTTP ${r.status} in ${((Date.now()-t0)/1000).toFixed(1)}s -> ${txt.slice(0,300)}`);
    } catch (e) {
      console.log(`${mode}: THREW after ${((Date.now()-t0)/1000).toFixed(1)}s -> ${e.message} ${e.cause?.message||''}`);
    }
  }
})().catch(e => console.error('ERR', e.message));
