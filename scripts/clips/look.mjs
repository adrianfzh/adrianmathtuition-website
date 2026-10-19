#!/usr/bin/env node
// Clip pipeline step 6b + 7 — play the clip in a real phone-sized browser and look at it
// (SPEC-CLIP-PIPELINE.md §2). Adrian's rule: look at the rendered thing, not the source.
//
//   node scripts/clips/look.mjs <slug…> [--base http://localhost:3000] [--out <dir>] [--width 390]
//   node scripts/clips/look.mjs qc-a118ba7c --path '/app/clip/q/<id>?check=1'   (a question clip, one slug)
//
// Needs a running server (npm run dev) with .env.local. Signs an admin session the
// same way lib/admin-session.ts does, opens /app/lesson/<slug> at 390 × 844 with the
// voice ON (autoplay allowed), and for every board action:
//   · CUE  — when the action fired on the playing clip vs when the voice starts its
//            word (the clip's timing sidecar). Gate: every cue within 0.3 s.
//   · LOOK — a picture ~0.7 s later, plus measurements of the board at that moment:
//            maths cut off (a shown piece outside the board), pieces overlapping, maths
//            smaller than 12 px. Gate: none.
// Writes <out>/<slug>/NN-<kind>.png (default: the OS temp dir) and
// data/clip-runs/<slug>/look.json. The pictures are for the vision read (an agent
// looks at them); the measurements are the deterministic half.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, parseArgs } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const slugs = args._;
if (!slugs.length) { console.error('usage: node scripts/clips/look.mjs <slug…> [--base URL] [--out DIR]'); process.exit(2); }
const BASE = String(args.base || 'http://localhost:3000').replace(/\/$/, '');
const OUT = String(args.out || path.join(os.tmpdir(), 'clip-look'));
const WIDTH = Number(args.width || 390);
const CUE_GATE_S = 0.3;
const MIN_PX = 12;

function dotenv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n$/, '').trim();
  }
  return out;
}
function adminToken() {
  const env = { ...dotenv(path.join(ROOT, '.env.local')), ...process.env };
  const s = env.ADMIN_SESSION_SECRET || env.SIGNUP_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET / SIGNUP_SECRET not in .env.local');
  const expires = Date.now() + 3600_000;
  return `${expires}.${crypto.createHmac('sha256', s).update(`admin.${expires}`).digest('base64url')}`;
}

/** Where each cued action's word starts in its clip, from the sidecar — the engine's own search:
 *  cues are looked for in listed order, a repeated word resolving to its next use. */
function cueWordStarts(beat, sidecar) {
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
  const words = beat.say.split(/\s+/).filter(Boolean).map(norm);
  const out = [];
  let from = 0;
  for (const a of beat.do) {
    if (typeof a.on !== 'string') { out.push(null); continue; }
    const cue = a.on.split(/\s+/).map(norm).filter(Boolean);
    let hit = -1;
    for (let i = from; i <= words.length - cue.length; i++) {
      if (cue.every((c, k) => words[i + k] === c)) { hit = i; break; }
    }
    if (hit < 0) { out.push({ missing: true }); continue; }
    from = hit + 1;
    const w = sidecar?.words?.[hit];
    out.push(w ? { word: a.on, start: w[1] } : { word: a.on, start: null });
  }
  return out;
}

const puppeteer = await import('puppeteer-core');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.default.launch({
  executablePath: chromePath,
  headless: 'new',
  // No timer throttling: under launchd (the clip worker) a background Chrome played a 1-minute
  // clip in 4 minutes (15 Oct 2026).
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const token = adminToken();
let anyFail = false;

for (const slug of slugs) {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lessons', `${slug}.json`), 'utf8'));
  const beats = script.scenes.flatMap(sc => sc.beats);
  const cueStarts = script.scenes.map(scene => scene.beats.map(b => {
    const sc = b.timing ? JSON.parse(fs.readFileSync(path.join(ROOT, 'public', b.timing), 'utf8')) : null;
    return cueWordStarts(b, sc);
  }));
  const dir = path.join(OUT, slug);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const page = await browser.newPage();
  const wide = WIDTH >= 768;
  await page.setViewport({ width: WIDTH, height: Number(args.height || (wide ? 800 : 844)), deviceScaleFactor: wide ? 1 : 2, isMobile: !wide, hasTouch: !wide });
  await page.setCookie({ name: 'admin_session', value: token, url: BASE });
  await page.evaluateOnNewDocument(() => {
    window.__lsn = [];
    for (const name of ['lsn:beat', 'lsn:action']) {
      document.addEventListener(name, (e) => window.__lsn.push({ name, ...e.detail }), true);
    }
  });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`${BASE}${args.path ? String(args.path) : `/app/lesson/${slug}`}`, { waitUntil: 'networkidle2', timeout: 120_000 });
  // A refused autoplay shows the "Play with voice" poster — one tap starts it, as on a phone.
  await new Promise(r => setTimeout(r, 1500));
  const poster = await page.$('button[aria-label*="voice" i], [data-lsn-poster] button');
  if (poster) await poster.click().catch(() => {});

  // The whole question: a panel beside the clip on a wide screen, the 📄 button on a phone.
  const question = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll('.lsn-question')).find(el => el.getBoundingClientRect().width > 0);
    const pill = Array.from(document.querySelectorAll('button')).find(b => /📄/.test(b.textContent || '') && b.getBoundingClientRect().width > 0);
    return panel ? 'panel' : pill ? 'button' : null;
  });
  const shots = [];
  let seen = 0;
  const t0 = Date.now();
  // A ~1-minute clip gets 4 minutes; a longer one about 15 s a beat (19 Oct 2026: a 31-beat clip on a
  // busy Mac ran out at 46/54 actions).
  while (Date.now() - t0 < Math.max(240_000, beats.length * 15_000)) {
    const ev = await page.evaluate(() => window.__lsn.slice());
    const done = await page.evaluate(() => /Now try one/.test(document.body.innerText));
    const fresh = ev.slice(seen).filter(e => e.name === 'lsn:action');
    seen = ev.length;
    for (const e of fresh) {
      await new Promise(r => setTimeout(r, 700));
      const n = shots.length + 1;
      const file = path.join(dir, `${String(n).padStart(2, '0')}-${e.scene ? `s${e.scene + 1}` : ''}b${e.beat + 1}-${e.kind}.png`);
      const board = args.page ? null : await page.$('.lsn-stage');
      await (board || page).screenshot({ path: file });
      // What this beat talks about (Adrian, 17 Oct 2026: "make sure content is not obscure (even
      // partially) when narrator is talking about it"): its actions' tokens and lines.
      const beatDo = script.scenes[e.scene ?? 0]?.beats?.[e.beat]?.do ?? [];
      // (A move's START is not checked here: when it is far above, the beat before shows it — "Look
      // back at the question" — and the piece comes down from there.)
      const focusIds = [...new Set(beatDo.flatMap(a => [a.token, a.near, a.span].flat().filter(x => typeof x === 'string')))];
      const focusLines = beatDo.map(a => a.step).filter(x => typeof x === 'number');
      const m = await page.evaluate((MIN_PX, focusIds, focusLines) => {
        const stage = document.querySelector('.lsn-stage');
        if (!stage) return { error: 'no board' };
        const sr = stage.getBoundingClientRect();
        // A piece in flight is a copy (aria-hidden) over its landing spot — not an overlap.
        const shown = Array.from(stage.querySelectorAll('.lsn-el.on')).filter(el => el.getAttribute('aria-hidden') !== 'true');
        const cut = [], small = [], overlap = [], hidden = [];
        // The fold: the top of whatever is pinned to the bottom of the screen (the tab bar).
        let fold = window.innerHeight;
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.top > window.innerHeight * 0.6 && r.top < fold) fold = r.top;
        }
        const boxes = [];
        // A scrolling board slides older lines up off its top on purpose (they fade there): a piece
        // above the board's fade line is scrolled away, not cut off.
        const boardEl = stage.querySelector('.lsn-board');
        const zoomEl = stage.querySelector('.lsn-zoom');
        const slid = zoomEl && Math.abs(parseFloat((zoomEl.style.translate || '0 0').split(' ')[1] || '0')) > 0.5;
        const scrollTop = slid && boardEl ? boardEl.getBoundingClientRect().top + 36 : -Infinity;
        // The beat's own targets: never under the top fade or the board's edges while it is said.
        if (boardEl) {
          const br = boardEl.getBoundingClientRect();
          const zoomEl2 = stage.querySelector('.lsn-zoom');
          const fadeTop = zoomEl2 && Math.abs(parseFloat((zoomEl2.style.translate || '0 0').split(' ')[1] || '0')) > 0.5 ? br.top + 36 : br.top;
          const targets = [
            ...focusIds.flatMap(id => Array.from(stage.querySelectorAll(`[data-token-id="${CSS.escape(id)}"]`))),
            ...focusLines.map(n => stage.querySelector(`[data-line="${n}"]`)).filter(Boolean),
          ];
          for (const el of targets) {
            if (!el.classList.contains('on') && !el.closest('.lsn-line.on')) continue;
            const r = el.getBoundingClientRect();
            if (r.height === 0) continue;
            if (r.top < fadeTop - 1 || r.bottom > br.bottom + 1) cut.push(`talked about but hidden: ${(el.getAttribute('data-token-id') || el.getAttribute('data-key') || '')} ${(el.textContent || '').trim().slice(0, 24)}`);
          }
        }
        for (const el of shown) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.top < scrollTop) continue;
          // …and on a scrolling board, lines below its bottom edge are simply not scrolled to yet.
          if (zoomEl && zoomEl.style.translate && boardEl && r.top > boardEl.getBoundingClientRect().bottom - 40) continue;
          const label = (el.getAttribute('data-key') || '') + ' ' + (el.textContent || '').trim().slice(0, 30);
          if (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1) cut.push(label);
          if (r.bottom > fold - 2 + window.scrollY - window.scrollY) hidden.push(`${label} (bottom ${r.bottom.toFixed(0)} px, bar at ${fold.toFixed(0)} px)`);
          const k = el.querySelector('.katex') || el;
          const fs = parseFloat(getComputedStyle(k).fontSize);
          if (fs < MIN_PX) small.push(`${label} (${fs.toFixed(1)} px)`);
          boxes.push({ el, r, label });
        }
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 3 && h > 3) overlap.push(`${a.label} × ${b.label} (${w.toFixed(0)}×${h.toFixed(0)} px)`);
        }
        // The whole board must fit on the screen with the page at the top: its bottom (page
        // position) above the bottom bar. A taller board hides its top or bottom while it plays.
        const tall = sr.bottom + window.scrollY > fold + 1 ? [`board bottom ${Math.round(sr.bottom + window.scrollY)} px, screen ends at ${Math.round(fold)} px`] : [];
        // The subtitle (YouTube-style, over the board's foot) must never cover written maths.
        const subs = stage.querySelector('.lsn-subs');
        const subsHide = [];
        if (subs && (subs.textContent || '').trim()) {
          const ur = subs.getBoundingClientRect();
          // On a scrolling board only the lines this beat talks about must clear the subtitle (an older
          // line below them, while the board looks back up, is not being talked about).
          const zoomS = stage.querySelector('.lsn-zoom');
          const scrolling = !!(zoomS && zoomS.style.translate);
          const talkLines = new Set([
            ...focusIds.flatMap(id => Array.from(stage.querySelectorAll(`[data-token-id="${CSS.escape(id)}"]`))),
            ...focusLines.map(n => stage.querySelector(`[data-line="${n}"]`)).filter(Boolean),
          ].map(el => el.closest('.lsn-line')).filter(Boolean));
          for (const { el, r, label } of boxes) {
            if (scrolling && talkLines.size && !talkLines.has(el.closest('.lsn-line'))) continue;
            const w = Math.min(ur.right, r.right) - Math.max(ur.left, r.left);
            const h = Math.min(ur.bottom, r.bottom) - Math.max(ur.top, r.top);
            if (w > 3 && h > 3) subsHide.push(label);
          }
        }
        // The slider comes after the clip.
        const scrub = document.querySelector('.lsn-scrub');
        const order = scrub && scrub.getBoundingClientRect().top < sr.bottom - 2 ? ['the slider is not below the board'] : [];
        // A law beside a line stays on ONE line (Adrian, 15 Oct 2026: "putting as two lines make it less clear").
        const wrapped = [];
        for (const t of stage.querySelectorAll('.lsn-note-up.on .lsn-note-text')) {
          const fs = parseFloat(getComputedStyle(t).fontSize);
          if (t.getBoundingClientRect().height > fs * 2.2) wrapped.push((t.textContent || '').trim().slice(0, 40));
        }
        return { cut, small, overlap, hidden, tall, subsHide, order, wrapped, shown: shown.length };
      }, MIN_PX, focusIds, focusLines);
      const cue = cueStarts[e.scene ?? 0]?.[e.beat]?.[e.index] ?? null;
      const offset = cue && cue.start != null && e.clipElapsed != null ? +(e.clipElapsed - cue.start).toFixed(3) : null;
      shots.push({ file: path.relative(OUT, file), scene: (e.scene ?? 0) + 1, beat: e.beat + 1, index: e.index, kind: e.kind, on: e.on, source: e.source,
        clipElapsed: e.clipElapsed, wordStart: cue?.start ?? null, offset, ...m });
    }
    if (done && fresh.length === 0) break;
    await new Promise(r => setTimeout(r, 120));
  }
  // The end state, once more.
  const endFile = path.join(dir, 'zz-end.png');
  await ((await page.$('.lsn-stage')) || page).screenshot({ path: endFile });
  await page.close();

  const cued = shots.filter(s => s.on);
  const cueBad = cued.filter(s => s.offset == null || Math.abs(s.offset) > CUE_GATE_S);
  const lookBad = shots.filter(s => s.error || s.cut?.length || s.overlap?.length || s.small?.length || s.hidden?.length || s.tall?.length || s.subsHide?.length || s.order?.length || s.wrapped?.length);
  const expected = beats.reduce((n, b) => n + b.do.length, 0);
  const result = {
    slug, at: new Date().toISOString(), width: WIDTH,
    actions: { expected, fired: shots.length, fromClip: shots.filter(s => s.source === 'clip').length },
    cue: { cued: cued.length, worst: cued.reduce((w, s) => Math.max(w, Math.abs(s.offset ?? 99)), 0), over: cueBad.length, gateS: CUE_GATE_S },
    look: { problems: lookBad.length },
    question,
    pageErrors: consoleErrors,
    pass: !!question && shots.length === expected && cueBad.length === 0 && lookBad.length === 0 && consoleErrors.length === 0,
    shots,
    picturesDir: dir,
  };
  const runDir = path.join(ROOT, 'data/clip-runs', slug);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'look.json'), JSON.stringify(result, null, 1) + '\n');
  anyFail ||= !result.pass;
  console.log(`${result.pass ? '✓' : '✗'} ${slug}: ${shots.length}/${expected} actions fired (${result.actions.fromClip} on the voice) · cues worst ${result.cue.worst.toFixed(2)} s, ${cueBad.length} over ${CUE_GATE_S} s · question ${question ?? 'MISSING'} · look problems ${lookBad.length}${consoleErrors.length ? ` · page errors ${consoleErrors.length}` : ''} → ${dir}`);
  for (const s of cueBad) console.log(`    cue  b${s.beat} ${s.kind} "${s.on}" fired ${s.clipElapsed?.toFixed(2)} s, word at ${s.wordStart?.toFixed?.(2)} s`);
  for (const s of lookBad) console.log(`    look b${s.beat} ${s.kind}: ${[...(s.cut || []).map(x => 'cut off ' + x), ...(s.overlap || []).map(x => 'overlap ' + x), ...(s.small || []).map(x => 'small ' + x), ...(s.hidden || []).map(x => 'under the bottom bar ' + x), ...(s.tall || []).map(x => 'taller than the screen: ' + x), ...(s.subsHide || []).map(x => 'subtitle covers ' + x), ...(s.order || []), ...(s.wrapped || []).map(x => 'note on two lines: ' + x), s.error].filter(Boolean).join('; ')}`);
}
await browser.close();
process.exit(anyFail ? 1 : 0);
