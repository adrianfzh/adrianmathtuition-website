#!/usr/bin/env node
// scripts/shorts/render.mjs — film a "common trap" Short (data/shorts/<slug>.json) to a vertical
// 1080 × 1920 MP4 (SPEC-CLIP-PIPELINE.md §10).
//
//   node scripts/shorts/render.mjs <slug…> | --all      after scripts/shorts/voice.mjs
//   --draft     no voice needed: timings guessed from the words, stills only, no MP4
//   --fps 30
//
// The board is the clip series' chalk look (src/lib/lesson-theme.ts chalk tokens, the Kalam hand
// and Permanent Marker title faces, KaTeX). The page is driven by a clock: every frame is drawn at
// an exact time and photographed, so the picture never drifts from the voice; each line of the
// voice is laid at its own start time with ffmpeg.
//
// Shape: hook (the question on screen) → "Pause. What's your answer?" with a 3-2-1 → the tempting
// wrong answer (red ✗) → why → the right way, one line at a time (green ✓), the answer boxed →
// end card with the site and the trap's one-line rule.
//
// Look checks (the clip pipeline's step 7, done on the rendered page at the end of every beat):
// nothing outside the frame or under the Shorts buttons (right edge) and caption band (bottom),
// maths ≥ 34 px tall at 1080 wide (= the clip rule's 12 px on a 390 px phone), nothing cut off
// sideways, the board never shrunk below 0.8. Writes out/shorts/<slug>/look.json + a still per
// beat (look/NN-part.jpg) + a contact sheet (sheet.jpg) for the picture read.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import katex from 'katex';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const DRAFT = argv.includes('--draft');
const FPS = Number(argv[argv.indexOf('--fps') + 1]) || 30;
const slugs = argv.includes('--all')
  ? fs.readdirSync(path.join(ROOT, 'data/shorts')).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.replace(/\.json$/, ''))
  : argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--fps');
if (!slugs.length) { console.error('usage: node scripts/shorts/render.mjs <slug…> | --all [--draft]'); process.exit(2); }

const W = 1080, H = 1920;
const GAP = 0.35;            // silence after each line of voice
const LEAD = 0.4;            // the hook's question shows before the first word
const MIN_MATH_PX = 34;
const SAFE = { left: 48, right: W - 140, top: 40, bottom: 1440 }; // right: Shorts' buttons; bottom: caption band + Shorts' title area
const KATEX_CSS = pathToFileURL(fs.realpathSync(path.join(ROOT, 'node_modules/katex/dist/katex.min.css'))).href;

// The Shorts look (Adrian, 5 Nov 2026: "the background is dark green (dull) > can we have something
// more catchy, exciting, more energy? (this can be different from the teaching clips itself), or even
// include a character/teacher animation"): a moving purple-pink background, white cards with dark
// ink so the maths stays easy to read, and the approved tutor (public/lessons/characters/tutor,
// docs/LESSONS.md §The PICTURE look) changing pose with each part.
const C = { ink: '#1b1c33', muted: '#5d6080', yellow: '#ffd84d', cyan: '#0b8fb3', pink: '#e2337d', green: '#139a4c', red: '#e5484d', amber: '#c98a00', card: '#ffffff', purple: '#4b1fc9' };
const TUTOR = Object.fromEntries(['idle', 'point', 'think', 'oops', 'nod', 'cheer'].map(p => [p, pathToFileURL(path.join(ROOT, 'public/lessons/characters/tutor', `${p}.png`)).href]));
/** The tutor's pose for each part of a Short; the answer line turns it to a cheer. */
const POSE = { hook: 'point', pause: 'think', wrong: 'oops', why: 'point', right: 'nod', end: 'cheer' };

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tex = (t, display = false) => katex.renderToString(t, { throwOnError: true, strict: 'ignore', displayMode: display });
/** A line with $…$ maths (an escaped \$ is a dollar sign). */
const mixed = (line) => line.split(/(?<!\\)\$/).map((p, i) => (i % 2 ? tex(p) : esc(p.replace(/\\\$/g, '$')))).join('');

/** The question flows as one paragraph; a line that is only maths gets a line of its own. */
function questionHtml(lines) {
  const alone = (l) => /^\$[^$]*\$\.?$/.test(l.trim());
  return lines.map((l, i) => (i === 0 ? '' : alone(l) || alone(lines[i - 1]) ? '<br>' : ' ') + mixed(l)).join('');
}

function probe(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
}

/** Beat timeline: start/end of each beat, its voice file and length, and when each working line appears. */
function timeline(short, voice) {
  let t = LEAD;
  const beats = short.beats.map((b, i) => {
    const audio = voice?.scenes?.[0]?.beats?.[i]?.audio;
    const file = audio ? path.join(ROOT, audio) : null;
    const speech = file && fs.existsSync(file) ? probe(file) : b.say.split(/\s+/).length / 2.6 + 0.3;
    const start = t;
    const end = start + speech + (b.hold || 0) + GAP;
    t = end;
    return { i, part: b.part, say: b.say, start, speech, end, file, hold: b.hold || 0 };
  });
  /** When the voice reaches `word` in a beat: characters dealt across the speech (lead 0.15 s, tail 0.3 s). */
  const wordTime = (beat, word) => {
    const at = beat.say.toLowerCase().indexOf(word.toLowerCase());
    if (at < 0) return null;
    return beat.start + 0.15 + (at / beat.say.length) * Math.max(0.5, beat.speech - 0.45);
  };
  const stepAt = {};
  short.beats.forEach((b, i) => {
    const beat = beats[i];
    const list = b.steps || [];
    list.forEach((s, k) => {
      const cue = short.steps[s].on ? wordTime(beat, short.steps[s].on) : null;
      // No cue word: lines dealt evenly over the first three quarters of the voice.
      stepAt[s] = Math.max(beat.start + 0.1, (cue ?? beat.start + 0.2 + (k * beat.speech * 0.75) / list.length) - 0.15);
    });
  });
  const figureAt = [];
  short.beats.forEach((b, i) => { if (b.figure) figureAt.push({ at: beats[i].start + 0.15, mode: b.figure === true ? 'all' : b.figure }); });
  // Captions: a sentence at a time (long sentences split at a comma), timed by characters.
  const captions = [];
  for (const beat of beats) {
    // At most ~2 lines a caption: a long sentence is cut into word runs of ≤ 64 characters.
    const chunks = beat.say.match(/[^.?!]+[.?!]?/g).map(s => s.trim()).filter(Boolean).flatMap(s => {
      if (s.length <= 70) return [s];
      // n even pieces, each cut at the word nearest its share (no orphan "a half." at the end).
      const n = Math.ceil(s.length / 64), words = s.split(' '), out = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (cur && out.length < n - 1 && Math.abs(next.length - s.length / n) > Math.abs(cur.length - s.length / n)) { out.push(cur); cur = w; } else cur = next;
      }
      if (cur) out.push(cur);
      return out;
    });
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let acc = 0;
    for (const c of chunks) {
      const s = beat.start + 0.1 + (acc / total) * beat.speech;
      acc += c.length;
      captions.push({ text: c, start: s, end: beat.start + 0.1 + (acc / total) * beat.speech + 0.25 });
    }
  }
  return { beats, stepAt, figureAt, captions, total: t + 0.2 };
}

function figureSvg(fig) {
  if (!fig) return '';
  if (fig.kind === 'venn') {
    return `<svg class="fig" viewBox="0 0 720 330" width="720" height="330">
      <g class="rv" data-fig="base" fill="none" stroke-width="5">
        <rect x="6" y="6" width="708" height="318" rx="22" stroke="${C.muted}" stroke-opacity="0.45" stroke-width="3"/>
        <circle cx="270" cy="170" r="135" stroke="${C.cyan}"/>
        <circle cx="450" cy="170" r="135" stroke="${C.pink}"/>
        <text x="190" y="62" fill="${C.cyan}" stroke="none" font-size="34" font-family="Kalam" text-anchor="middle">${esc(fig.left)}</text>
        <text x="530" y="62" fill="${C.pink}" stroke="none" font-size="34" font-family="Kalam" text-anchor="middle">${esc(fig.right)}</text>
        <text class="rv" data-fig="both" x="360" y="190" fill="${C.amber}" stroke="none" font-size="64" font-family="Kalam" font-weight="700" text-anchor="middle">${esc(fig.both)}</text>
      </g>
      <text class="rv" data-step="0" x="205" y="190" fill="${C.green}" font-size="64" font-family="Kalam" font-weight="700" text-anchor="middle">${esc(fig.leftOnly)}</text>
      <text class="rv" data-step="1" x="515" y="190" fill="${C.green}" font-size="64" font-family="Kalam" font-weight="700" text-anchor="middle">${esc(fig.rightOnly)}</text>
    </svg>`;
  }
  if (fig.kind === 'segment') {
    const [p, q] = fig.parts;
    const x0 = 70, x1 = 650, xc = x0 + ((x1 - x0) * p) / (p + q);
    return `<svg class="fig rv" data-fig="all" viewBox="0 0 720 200" width="720" height="200">
      <line x1="${x0}" y1="100" x2="${x1}" y2="100" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
      ${[[x0, fig.from, C.ink], [xc, fig.mid, C.pink], [x1, fig.to, C.ink]].map(([x, l, col]) => `<circle cx="${x}" cy="100" r="11" fill="${col}"/><text x="${x}" y="168" fill="${col}" font-size="48" font-family="Kalam" font-weight="700" text-anchor="middle">${esc(l)}</text>`).join('')}
      <text x="${(x0 + xc) / 2}" y="72" fill="${C.cyan}" font-size="46" font-family="Kalam" text-anchor="middle">${p}</text>
      <text x="${(xc + x1) / 2}" y="72" fill="${C.cyan}" font-size="46" font-family="Kalam" text-anchor="middle">${q}</text>
    </svg>`;
  }
  if (fig.kind === 'numberline') {
    const xs = [250, 470];
    const regions = [[60, xs[0]], [xs[0], xs[1]], [xs[1], 680]];
    return `<div class="fig rv" data-fig="all" style="position:relative;width:720px;height:190px">
      <svg viewBox="0 0 720 190" width="720" height="190" style="position:absolute;inset:0">
        ${fig.keep.map(r => `<rect class="rv" data-keep="1" x="${regions[r][0]}" y="66" width="${regions[r][1] - regions[r][0]}" height="28" rx="6" fill="${C.green}" fill-opacity="0.28"/>`).join('')}
        <line x1="40" y1="80" x2="690" y2="80" stroke="${C.ink}" stroke-width="5"/>
        <path d="M690 80 l-18 -11 v22 z" fill="${C.ink}"/>
        ${xs.map(x => `<circle cx="${x}" cy="80" r="12" fill="#fff" stroke="${C.purple}" stroke-width="5"/>`).join('')}
        ${fig.signs.map((s, k) => `<text class="rv" data-sign="${k}" x="${(regions[k][0] + regions[k][1]) / 2}" y="48" fill="${s === '+' ? C.pink : C.green}" font-size="58" font-family="Kalam" font-weight="700" text-anchor="middle">${esc(s)}</text>`).join('')}
      </svg>
      ${fig.points.map((p, k) => `<div style="position:absolute;top:112px;left:${xs[k] - 60}px;width:120px;text-align:center;color:${C.purple};font-size:44px">${tex(p)}</div>`).join('')}
    </div>`;
  }
  throw new Error(`unknown figure kind ${fig.kind}`);
}

// Maths symbols drifting behind everything (faint): fixed places, so every Short moves the same.
const BUBBLES = ['+', '×', '÷', '=', 'π', '√', 'x²', '%', '∞', '−', '≤', 'Σ'].map((ch, k) => ({ ch, size: 70 + ((k * 37) % 90), x: (k * 173) % 1000, y: 80 + ((k * 331) % 1700), sp: 0.25 + ((k * 7) % 5) / 10, ph: k * 1.3 }));

function pageHtml(short, tl) {
  const stepsHtml = short.steps.map((s, k) => `<div class="step rv ${s.answer ? 'answer' : ''} ${s.quiet ? 'quiet' : ''}" data-step="${k}"><span class="m">${tex(s.tex, false)}</span></div>`).join('');
  const wrongAt = tl.beats.find(b => b.part === 'wrong').start + 0.15;
  const whyAt = tl.beats.find(b => b.part === 'why').start + 0.15;
  const firstRight = tl.beats.find(b => b.part === 'right').start + 0.1;
  const pause = tl.beats.find(b => b.part === 'pause');
  const end = tl.beats.find(b => b.part === 'end');
  const poses = tl.beats.map(b => ({ at: b.start, pose: POSE[b.part] || 'idle' }));
  const data = { BUBBLES, poses, stepAt: tl.stepAt, figureAt: tl.figureAt, captions: tl.captions, wrongAt, whyAt, firstRight, pause: { start: pause.start, end: pause.end }, endAt: end.start, total: tl.total, answerAt: tl.stepAt[short.steps.findIndex(s => s.answer)] };
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${KATEX_CSS}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Permanent+Marker&family=Inter:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#3b1fd1}
#f{position:relative;width:${W}px;height:${H}px;overflow:hidden;color:${C.ink};font-family:Kalam,cursive;
  background:linear-gradient(160deg,#2a1bb8 0%,#6a2cf0 38%,#c22fd6 68%,#ff4f8b 100%);background-size:140% 140%}
.bubbles{position:absolute;inset:0;pointer-events:none}
.bubbles span{position:absolute;font-family:Inter,sans-serif;font-weight:700;color:rgba(255,255,255,.13);line-height:1}
.col{position:absolute;left:${SAFE.left}px;right:${W - SAFE.right}px;top:56px;bottom:${H - SAFE.bottom}px;display:flex;flex-direction:column;gap:22px}
.chips{display:flex;gap:16px;align-items:center;max-width:770px}
.chip{white-space:nowrap;font-family:Inter,sans-serif;font-weight:700;font-size:28px;letter-spacing:.05em;padding:8px 20px;border-radius:999px}
.chip.trap{color:#fff;background:${C.red};box-shadow:0 6px 0 rgba(0,0,0,.18)}
.chip.lvl{color:${C.purple};background:#fff;font-weight:600;letter-spacing:.01em;box-shadow:0 6px 0 rgba(0,0,0,.12)}
.hook{font-family:'Permanent Marker',cursive;font-size:76px;line-height:1.05;color:${C.yellow};max-width:760px;
  text-shadow:0 5px 0 #2a1373,0 0 26px rgba(42,19,115,.55)}
.q{background:#fff;border-radius:28px;padding:26px 34px;font-size:44px;line-height:1.38;box-shadow:0 10px 0 rgba(42,19,115,.28)}
.q .katex{font-size:1.08em;white-space:nowrap}
.stage{position:relative;flex:1;display:flex;flex-direction:column;gap:18px;min-height:0}
.board{display:flex;flex-direction:column;gap:18px;transform-origin:top left}
.card{border-radius:24px;padding:18px 28px 20px;background:#fff;box-shadow:0 10px 0 rgba(42,19,115,.28)}
.wrong{border-left:12px solid ${C.red};background:#fff1f1}
.wrong .row{display:flex;align-items:center;gap:22px;font-size:52px}
.wrong .x{font-family:Inter,sans-serif;font-weight:700;color:${C.red};font-size:58px}
.wrong .m{color:#8f1d22}
.wrong .m .katex{font-size:1.0em}
.wrong .why{font-size:36px;color:${C.muted};margin-top:2px}
.wrong.strike .m{text-decoration:line-through;text-decoration-color:${C.red};text-decoration-thickness:5px}
.trapline{font-family:'Permanent Marker',cursive;font-size:46px;color:${C.yellow};line-height:1.15;text-shadow:0 4px 0 #2a1373}
.right{border-left:12px solid ${C.green};background:#f0fff4}
.right .head{font-family:Inter,sans-serif;font-weight:700;color:${C.green};font-size:32px;letter-spacing:.05em;margin-bottom:6px}
.figcard{display:flex;justify-content:center;padding:14px}
.step{font-size:52px;line-height:normal;padding:3px 0;white-space:nowrap}
.step .katex{font-size:1.0em}
.step:has(.mfrac){padding:14px 0}
.step.quiet{font-size:40px;color:${C.muted}}
.step.answer .m{display:inline-block;border:5px solid ${C.pink};border-radius:16px;padding:4px 18px;color:${C.green};background:#fff;box-shadow:0 6px 0 rgba(226,51,125,.25)}
.fig{display:block;align-self:center}
.pausebox{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px}
.pausebox .ring{position:relative;width:300px;height:300px}
.pausebox .num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Permanent Marker';font-size:170px;color:#fff;text-shadow:0 6px 0 #2a1373}
.pausebox .t{font-family:'Permanent Marker';font-size:64px;color:#fff;text-align:center;line-height:1.12;text-shadow:0 5px 0 #2a1373}
.pausebox .t b{color:${C.yellow};font-weight:400}
.cap{position:absolute;left:60px;right:150px;top:${SAFE.bottom + 8}px;display:flex;justify-content:center}
.cap span{background:rgba(20,10,60,.72);color:#fff;font-family:Inter,sans-serif;font-weight:500;font-size:40px;line-height:1.3;padding:10px 22px;border-radius:16px;text-align:center}
.endc{position:absolute;inset:0;background:linear-gradient(160deg,#2a1bb8 0%,#6a2cf0 45%,#ff4f8b 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;padding:330px 70px 330px;text-align:center}
.endc .rule{font-family:'Permanent Marker';font-size:58px;color:${C.yellow};line-height:1.15;text-shadow:0 5px 0 #2a1373}
.endc .more{font-size:56px;color:#fff}
.endc .site{font-family:Inter,sans-serif;font-weight:700;font-size:62px;color:${C.purple};background:${C.yellow};padding:14px 30px;border-radius:22px;box-shadow:0 8px 0 rgba(42,19,115,.35)}
.endc .sub{font-size:40px;color:rgba(255,255,255,.85)}
.tutor{position:absolute;right:20px;top:40px;width:250px;height:250px;transform-origin:50% 100%;z-index:5}
.tutor img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;filter:drop-shadow(0 8px 0 rgba(42,19,115,.35))}
</style></head><body><div id="f">
<div class="bubbles" id="bubbles">${BUBBLES.map((b, k) => `<span data-k="${k}" style="font-size:${b.size}px">${b.ch}</span>`).join('')}</div>
<div class="col">
  <div class="chips"><span class="chip trap">⚠ COMMON TRAP</span><span class="chip lvl">${esc(short.levelLabel)} · ${esc(short.topic)}</span></div>
  <div class="hook rv" data-at="0">${esc(short.hook)}</div>
  <div class="q rv" data-at="0.15">${questionHtml(short.question)}</div>
  <div class="stage" id="stage">
    <div class="board" id="board">
      <div class="card wrong rv" id="wrong" data-at="${wrongAt}"><div class="row"><span class="x">✗</span><span class="m">${tex(short.wrong.tex)}</span></div><div class="why">← ${esc(short.wrong.why)}</div></div>
      <div class="trapline rv" data-at="${whyAt}">${esc(short.trap)}</div>
      ${short.figure ? `<div class="card figcard rv" data-at="${tl.figureAt[0].at}">${figureSvg(short.figure)}</div>` : ''}
      <div class="card right rv" data-at="${firstRight}"><div class="head">✓ THE RIGHT WAY</div>${stepsHtml}</div>
    </div>
    <div class="pausebox" id="pause" style="opacity:0">
      <div class="ring"><svg width="300" height="300" viewBox="0 0 300 300"><circle cx="150" cy="150" r="130" fill="none" stroke="rgba(251,250,243,.15)" stroke-width="16"/><circle id="arc" cx="150" cy="150" r="130" fill="none" stroke="${C.yellow}" stroke-width="16" stroke-linecap="round" transform="rotate(-90 150 150)" stroke-dasharray="816.8" stroke-dashoffset="0"/></svg><div class="num" id="num">3</div></div>
      <div class="t">Pause.<br><b>What do you think<br>the next step is?</b></div>
    </div>
  </div>
</div>
<div class="cap"><span id="cap" style="opacity:0"></span></div>
<div class="endc" id="endc" style="opacity:0">
  <div class="rule">${esc(short.trap)}</div>
  <div class="more">More like this — free</div>
  <div class="site">adrianmathtuition.com</div>
  <div class="sub">link in the description</div>
</div>
<div class="tutor" id="tutor">${Object.entries(TUTOR).map(([p, src]) => `<img data-pose="${p}" src="${src}">`).join('')}</div>
</div>
<script>
const D = ${JSON.stringify(data)};
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
let SCALE = 1;
function atOf(el) {
  if (el.dataset.at !== undefined) return Number(el.dataset.at);
  if (el.dataset.step !== undefined) return D.stepAt[el.dataset.step];
  if (el.dataset.fig !== undefined) { const f = D.figureAt.find(x => el.dataset.fig === 'base' || el.dataset.fig === 'all' ? true : x.mode === el.dataset.fig || x.mode === 'all'); return f ? f.at : 1e9; }
  if (el.dataset.sign !== undefined) { const f = D.figureAt[0]; return f ? f.at + 0.6 + Number(el.dataset.sign) * 0.9 : 1e9; }
  if (el.dataset.keep !== undefined) return D.answerAt ?? 1e9;
  return 0;
}
const rv = [...document.querySelectorAll('.rv')].map(el => ({ el, at: atOf(el) }));
const tut = document.getElementById('tutor'), tutImgs = [...tut.querySelectorAll('img')];
window.renderAt = (t) => {
  // background drifts; symbols float up and sway
  document.getElementById('f').style.backgroundPosition = (50 + 40 * Math.sin(t / 4)).toFixed(1) + '% ' + (50 + 40 * Math.cos(t / 5)).toFixed(1) + '%';
  document.querySelectorAll('#bubbles span').forEach((el) => {
    const b = D.BUBBLES[el.dataset.k];
    const y = ((b.y - t * 40 * b.sp) % 1920 + 1920) % 1920 - 100;
    el.style.transform = 'translate(' + (b.x + 30 * Math.sin(t * b.sp + b.ph)).toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (12 * Math.sin(t * 0.6 + b.ph)).toFixed(1) + 'deg)';
  });
  // the tutor: pose of the current part (cheer from the answer line on), a pop on each change, breathing
  let cur = D.poses[0], since = 0;
  for (const p of D.poses) if (t >= p.at) { cur = p; since = p.at; }
  let pose = cur.pose;
  if (D.answerAt != null && t >= D.answerAt && pose === 'nod') { pose = 'cheer'; since = D.answerAt; }
  const k = Math.min(1, (t - since) / 0.22);
  tutImgs.forEach(img => { img.style.opacity = img.dataset.pose === pose ? String(k) : '0'; });
  const pop = 1 + 0.08 * Math.sin(Math.min(1, (t - since) / 0.3) * Math.PI);
  const breath = 1 + 0.025 * Math.sin(t * 2.2);
  const inTo = ease((t - D.endAt) / 0.5);
  // on the end card the tutor comes to the middle, bigger
  const tx = -395 * inTo, ty = 150 * inTo, sc = (1 + 0.5 * inTo) * pop * breath;
  tut.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + sc.toFixed(4) + ')';
  for (const { el, at } of rv) {
    const p = ease((t - at) / 0.35);
    el.style.opacity = String(p);
    if (!(el instanceof SVGElement)) el.style.transform = p < 1 ? 'translateY(' + ((1 - p) * 16).toFixed(1) + 'px)' : '';
  }
  // the wrong answer is crossed out once the right way starts
  document.getElementById('wrong').classList.toggle('strike', t >= D.firstRight);
  document.getElementById('wrong').style.opacity = t >= D.firstRight ? '0.92' : document.getElementById('wrong').style.opacity;
  // pause: the board area is empty; a ring runs down 3-2-1
  const pz = D.pause, pin = ease((t - pz.start) / 0.25), pout = 1 - ease((t - (pz.end - 0.25)) / 0.25);
  const inP = t >= pz.start && t < pz.end;
  document.getElementById('pause').style.opacity = inP ? String(Math.min(pin, pout)) : '0';
  if (inP) {
    const f = (t - pz.start) / (pz.end - pz.start);
    document.getElementById('arc').setAttribute('stroke-dashoffset', String(816.8 * f));
    document.getElementById('num').textContent = String(Math.max(1, 3 - Math.floor(f * 3)));
  }
  const c = D.captions.find(c => t >= c.start && t < c.end);
  const cap = document.getElementById('cap');
  if (c) { if (cap.textContent !== c.text) cap.textContent = c.text; cap.style.opacity = '1'; } else cap.style.opacity = '0';
  if (t >= D.endAt) cap.style.opacity = '0';
  document.getElementById('endc').style.opacity = String(ease((t - D.endAt) / 0.4));
};
// The board at its fullest must fit the stage: shrink it once (never below 0.8 — the look check fails it).
window.fit = () => {
  const stage = document.getElementById('stage'), board = document.getElementById('board');
  board.style.transform = '';
  const need = board.scrollHeight, have = stage.clientHeight;
  const wide = Math.max(...[...board.querySelectorAll('.step,.row,.trapline,.fig')].map(e => e.scrollWidth));
  SCALE = Math.min(1, have / need, board.clientWidth / Math.max(1, wide));
  board.style.transform = SCALE < 1 ? 'scale(' + SCALE.toFixed(4) + ')' : '';
  board.style.width = SCALE < 1 ? (100 / SCALE).toFixed(2) + '%' : '';
  return { need, have, scale: SCALE };
};
// The look check of what is on screen now.
window.look = (minPx, safe) => {
  const probs = [];
  const shown = [...document.querySelectorAll('.rv, .pausebox, .cap span')].filter(el => Number(getComputedStyle(el).opacity) > 0.5);
  const endOn = Number(document.getElementById('endc').style.opacity) > 0.5;
  if (endOn) return { probs, shown: 'end card' };
  for (const el of shown) {
    if (el.closest('.cap')) continue;
    const r = el.getBoundingClientRect();
    const name = (el.className.baseVal ?? el.className) + (el.dataset.step ? '#' + el.dataset.step : '');
    if (r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1) probs.push(name + ' outside the safe area (' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(', ') + ')');
  }
  for (const k of document.querySelectorAll('.step .katex, .wrong .katex, .q .katex')) {
    if (Number(getComputedStyle(k.closest('.rv')).opacity) < 0.5) continue;
    const px = parseFloat(getComputedStyle(k).fontSize) * (k.closest('#board') ? SCALE : 1);
    if (px < minPx) probs.push('maths ' + px.toFixed(0) + ' px < ' + minPx + ' px: ' + k.textContent.slice(0, 40));
  }
  // two working lines must not touch (5 Nov 2026: stacked fractions ran into each other)
  const lines = [...document.querySelectorAll('.step')].filter(el => Number(getComputedStyle(el).opacity) > 0.5);
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1].querySelector('.katex-html')?.getBoundingClientRect(), b = lines[i].querySelector('.katex-html')?.getBoundingClientRect();
    if (a && b && a.bottom > b.top + 1) probs.push('working lines ' + i + ' and ' + (i + 1) + ' touch');
  }
  for (const el of document.querySelectorAll('.step, .row, .q')) if (el.scrollWidth > el.clientWidth + 2) probs.push('cut off sideways: ' + el.textContent.slice(0, 40));
  // the badges sit on one line (5 Nov 2026: "COMMON TRAP" wrapped under a long topic name)
  const chips = document.querySelector('.chips');
  if (chips.scrollWidth > chips.clientWidth + 1 || [...chips.children].some(c => c.getBoundingClientRect().height > 70)) probs.push('the badges do not fit on one line');
  for (const k of document.querySelectorAll('.q .katex')) if (k.getClientRects().length > 1) probs.push('a formula in the question breaks across lines: ' + k.textContent.slice(0, 30));
  const cap = document.querySelector('.cap span');
  if (Number(cap.style.opacity) > 0.5) { const r = cap.getBoundingClientRect(); if (r.bottom > ${H - 300}) probs.push('caption runs into the Shorts title area (bottom ' + Math.round(r.bottom) + ')'); }
  return { probs, shown: shown.length };
};
</script></body></html>`;
}

const puppeteer = await import('puppeteer-core');
const browser = await puppeteer.default.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--allow-file-access-from-files'],
});

let failed = 0;
for (const slug of slugs) {
  const t0 = Date.now();
  const short = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/shorts', `${slug}.json`), 'utf8'));
  const dir = path.join(ROOT, 'out/shorts', slug);
  fs.mkdirSync(path.join(dir, 'look'), { recursive: true });
  for (const f of fs.readdirSync(path.join(dir, 'look'))) fs.rmSync(path.join(dir, 'look', f));
  const voiceFile = path.join(dir, 'voice.json');
  const voice = !DRAFT && fs.existsSync(voiceFile) ? JSON.parse(fs.readFileSync(voiceFile, 'utf8')) : null;
  if (!DRAFT && (!voice || voice.scenes[0].beats.length !== short.beats.length || voice.scenes[0].beats.some((b, i) => b.say !== short.beats[i].say || !b.audio))) {
    console.error(`✗ ${slug}: the voice is missing or out of date — run node scripts/shorts/voice.mjs ${slug}`);
    failed++;
    continue;
  }
  const tl = timeline(short, voice);
  const htmlFile = path.join(dir, 'stage.html');
  fs.writeFileSync(htmlFile, pageHtml(short, tl));

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0', timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ['Kalam', 'Permanent Marker', 'Inter'].map(f => document.fonts.check(`${f === 'Inter' ? '700 ' : ''}40px "${f}"`)));
  const fit = await page.evaluate(() => window.fit());

  // Look: at the end of every beat (and mid-pause), what is on screen.
  const look = { slug, fit, fonts, problems: [], stills: [] };
  if (fonts.includes(false)) look.problems.push(`a font did not load (${fonts})`);
  if (fit.scale < 0.8) look.problems.push(`the board is ${fit.need} px tall for ${fit.have} px — shrunk to ${fit.scale.toFixed(2)} (< 0.8): shorten the working`);
  const moments = tl.beats.map(b => ({ t: b.part === 'pause' ? (b.start + b.end) / 2 : b.end - 0.05, name: `${String(b.i + 1).padStart(2, '0')}-${b.part}` }));
  for (const m of moments) {
    await page.evaluate((t) => window.renderAt(t), m.t);
    const r = await page.evaluate((minPx, safe) => window.look(minPx, safe), MIN_MATH_PX, SAFE);
    for (const p of r.probs) look.problems.push(`${m.name}: ${p}`);
    const file = path.join(dir, 'look', `${m.name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    look.stills.push(path.relative(ROOT, file));
  }
  look.problems = [...new Set(look.problems)];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob', '-i', path.join(dir, 'look', '*.jpg'), '-vf', `scale=360:640,tile=${moments.length}x1:padding=8:color=white`, '-frames:v', '1', path.join(dir, 'sheet.jpg')]);

  let mp4 = null;
  if (!DRAFT) {
    // Voice track: each line at its own start time.
    const audioFile = path.join(dir, 'voice-track.m4a');
    const inputs = tl.beats.flatMap(b => ['-i', b.file]);
    const filt = tl.beats.map((b, k) => `[${k}:a]adelay=${Math.round(b.start * 1000)}|${Math.round(b.start * 1000)}[a${k}]`).join(';') +
      `;${tl.beats.map((_, k) => `[a${k}]`).join('')}amix=inputs=${tl.beats.length}:normalize=0,apad,atrim=0:${tl.total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filt, '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '160k', audioFile]);

    mp4 = path.join(dir, `${slug}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', audioFile,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-c:a', 'copy', '-shortest', '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
    const frames = Math.ceil(tl.total * FPS);
    for (let n = 0; n < frames; n++) {
      await page.evaluate((t) => window.renderAt(t), n / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92, optimizeForSpeed: true });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    look.mp4 = { file: path.relative(ROOT, mp4), seconds: +probe(mp4).toFixed(2), bytes: fs.statSync(mp4).size };
    if (look.mp4.seconds >= 60) look.problems.push(`${look.mp4.seconds} s — a Short must be under 60 s`);
  }
  await page.close();
  look.seconds = +tl.total.toFixed(2);
  look.ok = look.problems.length === 0;
  fs.writeFileSync(path.join(dir, 'look.json'), JSON.stringify(look, null, 2) + '\n');
  if (!look.ok) failed++;
  console.log(`${look.ok ? '✓' : '✗'} ${slug}: ${tl.total.toFixed(1)} s · board scale ${fit.scale.toFixed(2)}${mp4 ? ` · ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB` : ' (draft)'} · ${((Date.now() - t0) / 1000).toFixed(0)} s to make`);
  for (const p of look.problems) console.log(`    ✗ ${p}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
