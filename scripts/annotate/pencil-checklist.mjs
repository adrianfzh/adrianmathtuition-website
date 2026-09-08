// SPEC-ANNOTATE §8 — the iPad Pencil checklist, EMULATED (8 Sep 2026).
//
// Drives the desk's in-place pen on a run's page 13 with a CDP pen pointer
// (pointerType 'pen', force = pressure) and emulated touch (finger, resting palm,
// two-/three-finger taps, pinch) and reads two witnesses: the autosaved draft
// (localStorage annotate-draft:v1:<run>, written 800 ms after a change — every
// probe waits past that) and the overlay's ink log (annotate-inklog:v1).
//
//   node scripts/annotate/pencil-checklist.mjs            # against adrianmath-dev
//
// ⚠ The Done step EDITS the run (page 13 composed, flags cleared, PDF assembled):
// snapshot result_json + annotated_pdf_url first and restore them after — the
// memory "overlay-verify-press-done-on-a-real-run" has the recipe. Needs
// puppeteer-core (devDependency) and a local Chrome. What this cannot prove is
// the hardware: real-glass palm feel, latency, and coalesced-event smoothness
// of a fast scribble — those three stay a real-iPad check.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('/Users/adrianfong/dev/adrianmathtuition-website/.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const BASE = 'https://adrianmath-dev.vercel.app';
const RUN = '73cf0b11-6afa-4f64-a176-652067f4d116';
const OUT = '/private/tmp/claude-501/-Users-adrianfong-dev-adrianmathtuition-website/1ba4b5a6-37dd-416e-b50f-087c2a3d6101/scratchpad';
const R = []; const ok = (name, pass, detail = '') => { R.push({ name, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const supa = async (path) => { const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }); return r.json(); };
const runRow = async () => { const [r] = await supa(`paper_marking_runs?id=eq.${RUN}&select=annotated_pdf_url,result_json`); const ap = r.result_json.annotated_photos || []; return { pdf: r.annotated_pdf_url, urls: ap.map(p => p.url), edited: ap[12]?.edited_at || null }; };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 1400, height: 1000 } });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(async (pw) => fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }), env.ADMIN_PASSWORD);
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const pen = {
  down: (x, y, force = 0.5) => cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force }),
  move: (x, y, force = 0.5) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'pen', force }),
  up: (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force: 0 }),
};
const tp = (x, y, r, id) => ({ x, y, radiusX: r, radiusY: r, force: 0.5, id });
const touch = {
  start: (pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts }),
  move: (pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts }),
  end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
};
const inkLog = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('annotate-inklog:v1') || '[]'); } catch { return []; } });
const strokes = () => page.evaluate((run) => { try { const d = JSON.parse(localStorage.getItem('annotate-draft:v1:' + run) || 'null'); return (d && d.pages && d.pages['12']) || []; } catch { return []; } }, RUN);
const clickAria = async (label) => { await page.click(`button[aria-label="${label}"]`); await sleep(150); };
const clickText = async (re) => { for (const b of await page.$$('button')) { const t = await b.evaluate(x => x.textContent?.trim() || ''); if (re.test(t)) { await b.click(); return true; } } return false; };
const indicator = () => page.evaluate(() => [...document.querySelectorAll('span')].map(s => s.textContent?.trim()).find(t => /^\d+ \/ \d+$/.test(t || '')));
const openPen = async () => {
  await page.goto(`${BASE}/admin/desk?run=${RUN}`, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(2500);
  for (let a = 0; a < 6; a++) { const img = await page.$('img[alt^="Marked page 13"]'); if (!img) { await sleep(2000); continue; } try { await img.click(); break; } catch { await sleep(2000); } }
  await page.waitForSelector('button[aria-label="Select the marker\'s ink"]', { timeout: 60000 });
  await sleep(7000);
};
const before = await runRow();
await openPen();
ok('overlay opens in place on page 13', (await indicator()) === '13 / 19', await indicator());
await clickAria('Pen');

// ② pressure + palm: a pen stroke with a force ramp while a palm rests on the glass
{
  const n0 = (await strokes()).length;
  await pen.down(700, 200, 0.2);
  for (let i = 1; i <= 40; i++) {
    const f = 0.2 + 0.7 * (i / 40);
    await pen.move(700 + i * 7.5, 200 + Math.sin(i / 3) * 4, f);
    if (i === 20) await touch.start([tp(900, 620, 45, 9)]);   // the resting palm (contact 90 px)
    if (i === 30) await touch.end();
    await sleep(12);
  }
  await pen.up(1000, 260);
  await sleep(1200);
  const s = await strokes();
  const st = s[s.length - 1];
  const ps = st ? st.points.map(p => p.p) : [];
  ok('palm on the glass adds no ink and does not break the pen stroke', s.length === n0 + 1 && st.points.length >= 35, `strokes ${n0}→${s.length}, points ${st ? st.points.length : 0}`);
  ok('pressure recorded per point (width tapers from it)', ps.length > 0 && Math.min(...ps) <= 0.3 && Math.max(...ps) >= 0.8, `p ${Math.min(...ps)}…${Math.max(...ps)}`);
}
// ③ draw-and-hold snaps; the same shapes without holding stay freehand
const drawPath = async (pts, hold) => {
  await pen.down(pts[0][0], pts[0][1], 0.5);
  for (const [x, y] of pts.slice(1)) { await pen.move(x, y, 0.5); await sleep(10); }
  if (hold) await sleep(720);
  await pen.up(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  await sleep(1200);
  const s = await strokes(); return s[s.length - 1];
};
const wobblyLine = (y) => Array.from({ length: 24 }, (_, i) => [700 + i * 12.5, y + Math.sin(i) * 3]);
{
  const l = await drawPath(wobblyLine(320), true); ok('draw-and-hold line snaps straight', l?.snapped === 'line', `snapped=${l?.snapped}, points=${l?.points.length}; log snaps: ${(await inkLog()).filter(e => e.k === 'snap').map(e => e.shape).join(',')}`);
  const rectPts = [];
  for (let i = 0; i <= 10; i++) rectPts.push([700 + i * 20, 360 + Math.sin(i) * 2]);
  for (let i = 1; i <= 6; i++) rectPts.push([900 + Math.sin(i) * 2, 360 + i * 16]);
  for (let i = 1; i <= 10; i++) rectPts.push([900 - i * 20, 456 + Math.sin(i) * 2]);
  for (let i = 1; i <= 6; i++) rectPts.push([700 + Math.sin(i) * 2, 456 - i * 15.5]);
  const r = await drawPath(rectPts, true); ok('draw-and-hold box snaps', /rect|box/.test(r?.snapped || ''), `snapped=${r?.snapped}`);
  const circ = Array.from({ length: 40 }, (_, i) => { const a = (i / 38) * Math.PI * 2; return [850 + 55 * Math.cos(a) + Math.sin(i) * 2, 560 + 55 * Math.sin(a)]; });
  const c = await drawPath(circ, true); ok('draw-and-hold circle snaps', /circle|ellipse/.test(c?.snapped || ''), `snapped=${c?.snapped}`);
  const f = await drawPath(wobblyLine(650), false); ok('the same line WITHOUT holding stays freehand', !f?.snapped, `snapped=${f?.snapped}, points=${f?.points.length}`);
}
// ⑤ eraser removes exactly the touched stroke; undo restores; redo re-removes
{
  const n0 = (await strokes()).length;
  await clickAria('Eraser'); await clickText(/^Stroke$/);
  await pen.down(850, 650, 0.5); await pen.up(850, 650); await sleep(1200);
  const n1 = (await strokes()).length;
  await clickAria('Undo'); await sleep(1200); const n2 = (await strokes()).length;
  await clickAria('Redo'); await sleep(1200); const n3 = (await strokes()).length;
  ok('eraser removes exactly the touched stroke; undo restores; redo re-removes', n1 === n0 - 1 && n2 === n0 && n3 === n0 - 1, `${n0}→${n1}→${n2}→${n3}`);
  await clickAria('Pen');
}
// two-finger tap = undo, three-finger tap = redo
{
  const n0 = (await strokes()).length;
  await touch.start([tp(400, 760, 8, 1), tp(450, 760, 8, 2)]); await sleep(90); await touch.end(); await sleep(1200);
  const n1 = (await strokes()).length;
  await touch.start([tp(400, 760, 8, 1), tp(450, 760, 8, 2), tp(500, 760, 8, 3)]); await sleep(90); await touch.end(); await sleep(1200);
  const n2 = (await strokes()).length;
  const lifts = (await inkLog()).filter(e => e.k === 'touch-lift').slice(-2).map(e => `${e.maxT}f→${e.fired || 'none'}`);
  ok('2-finger tap undoes, 3-finger tap redoes', n1 === n0 + 1 && n2 === n0, `${n0}→${n1}→${n2}; log: ${lifts.join(', ')}`);
}
// ② finger cannot draw; pinch zooms; ink while zoomed lands at the right spot
{
  const dot = async (x, y) => { await pen.down(x, y, 0.5); await pen.up(x, y); await sleep(1200); const s = await strokes(); return s[s.length - 1].points[0]; };
  const S = [820, 520];
  const A = await dot(S[0], S[1]); const D = await dot(S[0] + 100, S[1]);
  await touch.start([tp(S[0] - 60, S[1], 8, 1), tp(S[0] + 60, S[1], 8, 2)]);
  for (let i = 1; i <= 10; i++) { await touch.move([tp(S[0] - 60 - i * 12, S[1], 8, 1), tp(S[0] + 60 + i * 12, S[1], 8, 2)]); await sleep(16); }
  await touch.end(); await sleep(600);
  const n0 = (await strokes()).length;
  const B = await dot(S[0], S[1]); const C = await dot(S[0] + 100, S[1]);
  const ratio = (D.x - A.x) / (C.x - B.x);
  ok('two-finger pinch zooms and ink while zoomed lands at the right spot', Math.hypot(B.x - A.x, B.y - A.y) < 20 && ratio > 1.5 && ratio < 5, `zoom ×${ratio.toFixed(2)}, anchor drift ${Math.hypot(B.x - A.x, B.y - A.y).toFixed(1)}px`);
  const n1 = (await strokes()).length;
  await touch.start([tp(400, 800, 8, 1)]);
  for (let i = 1; i <= 10; i++) { await touch.move([tp(400 + i * 15, 800 - i * 6, 8, 1)]); await sleep(16); }
  await touch.end(); await sleep(1200);
  const tl = (await inkLog()).filter(e => e.k === 'touch-lift').slice(-1)[0];
  ok('a finger cannot draw (one finger scrolls)', (await strokes()).length === n1, `strokes ${n1}→${(await strokes()).length}; last touch-lift: ${tl ? JSON.stringify(tl) : 'n/a'}`);
}
// page switch < 1 s on a 19-page paper
{
  const t0 = Date.now(); await clickAria('Next page');
  await page.waitForFunction(() => [...document.querySelectorAll('span')].some(s => s.textContent?.trim() === '14 / 19'), { timeout: 5000 }).catch(() => {});
  const dt = Date.now() - t0; ok('page switch under 1 s (19-page paper)', dt < 1000 && (await indicator()) === '14 / 19', `${dt} ms`);
  await clickAria('Previous page'); await sleep(400);
}
// cancel with ink → confirm dialog; discard uploads nothing
{
  await clickAria('Close'); await sleep(400);
  const dlg = await clickText(/Discard ink/);
  await sleep(800);
  const gone = !(await page.$('button[aria-label="Select the marker\'s ink"]'));
  const row = await runRow();
  const draft = await page.evaluate((run) => localStorage.getItem('annotate-draft:v1:' + run), RUN);
  ok('cancel with ink asks; Discard closes, uploads nothing, keeps no draft', dlg && gone && row.edited === before.edited && row.pdf === before.pdf && !draft, `dialog=${dlg} closed=${gone} edited=${row.edited} pdf=${!!row.pdf} draft=${!!draft}`);
}
// Done → PDF timing; un-inked pages untouched; mark-paper rows; reload persists
{
  await openPen(); await clickAria('Pen');
  await drawPath(wobblyLine(300), false);
  const t0 = Date.now();
  await clickText(/^Done/);
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Select the marker\'s ink"]'), { timeout: 240000 }).catch(() => {});
  const dt = Date.now() - t0;
  const after = await runRow();
  ok('Done → PDF (one composed page) under 20 s', dt < 20000 && !!after.pdf, `${(dt / 1000).toFixed(1)} s, pdf=${!!after.pdf}`);
  const untouched = after.urls.every((u, i) => i === 12 || u === before.urls[i]);
  ok('un-inked pages keep their exact bytes (same URL, no re-encode)', untouched && after.urls[12] !== before.urls[12], `18/18 unchanged: ${untouched}`);
  await page.goto(`${BASE}/admin/mark-paper?run=${RUN}`, { waitUntil: 'networkidle2', timeout: 90000 }); await sleep(2500);
  const mp = await page.evaluate(() => {
    const pdfLinks = [...document.querySelectorAll('a')].map(a => a.textContent?.trim() || '').filter(t => /^(✍️|🖼|📄|📷) .*PDF ↗$/.test(t));
    const hist = [...document.querySelectorAll('a')].find(a => /✍️ Annotated ↗/.test(a.textContent || ''));
    const href = hist ? hist.getAttribute('href') || '' : '';
    const name = decodeURIComponent((href.match(/[?&]name=([^&]+)/) || [])[1] || '');
    return { first: pdfLinks[0] || '', all: pdfLinks, hist: !!hist, name };
  });
  ok('send row lists ✍️ Annotated PDF first; history row shows ✍️ Annotated ↗ with a real filename', /Annotated PDF/.test(mp.first) && mp.hist && /\.pdf$/i.test(mp.name), `send row: ${mp.all.join(' | ')}; download name="${mp.name}"`);
  await page.reload({ waitUntil: 'networkidle2' }); await sleep(2000);
  const again = await page.evaluate(() => !![...document.querySelectorAll('a')].find(a => /✍️ Annotated ↗/.test(a.textContent || '')));
  ok('reload: the annotated copy persists', again);
}
await page.screenshot({ path: `${OUT}/pencil-checklist.png` });
await browser.close();
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
console.log(`RESULT ${R.filter(r => r.pass).length}/${R.length} passed`);
fs.writeFileSync(`${OUT}/pencil-checklist.json`, JSON.stringify(R, null, 2));
