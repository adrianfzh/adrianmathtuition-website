#!/usr/bin/env node
// Clip pipeline step 6b — the stand-in reviewer (Adrian, 18 Oct 2026: "build #2 > a stand-in
// reviewer"). A second model watches a finished clip the way Adrian does — the storyboard (what is
// said, what the board shows, beat by beat) and, when there are, the phone screenshots from
// look.mjs — and gives the notes HE would give, against his house rules. A clip goes to Adrian only
// after it passes.
//
//   node scripts/clips/review.mjs <slug | lesson.json> [--frames <dir>] [--no-frames] [--model id] [--out file]
//
// Frames default to look.mjs's folder (<tmp>/clip-look/<slug>) when it exists. Writes
// data/clip-runs/<slug>/review.json (or --out) and prints the findings. Exit 1 on "fix".
// Needs ANTHROPIC_API_KEY (from .env.local).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadTs, parseArgs } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const target = args._[0];
if (!target) { console.error('usage: node scripts/clips/review.mjs <slug | lesson.json> [--frames dir] [--no-frames] [--model id] [--out file]'); process.exit(2); }
const file = target.endsWith('.json') ? path.resolve(target) : path.join(ROOT, 'data/lessons', `${target}.json`);
const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
const slug = lesson.slug ?? path.basename(file, '.json');
const MODEL = String(args.model || 'claude-opus-5-5');

const { boardTextAfter } = await loadTs('src/lib/clip-said-shown.ts');
const { boardStateAt } = await loadTs('src/lib/lesson-beats.ts');

// ── The storyboard: beat by beat, what is said and what the board shows ──────────────────────
function storyboard() {
  const out = [];
  let n = 0;
  lesson.scenes.forEach((sc) => {
    if (sc.type !== 'equation-steps') return;
    out.push(`BOARD LINES (in order, each written by a beat below):`);
    sc.steps.forEach((st, i) => out.push(`  line ${i}${st.heading ? ` [heading "${st.heading}"]` : ''}: ${st.tokens.map(t => `${t.id ? `{${t.id}}` : ''}${t.tex}`).join('  ')}${st.graph ? `   [a sketch under it: y = ${st.graph.fn}${st.graph.curves ? ` + ${st.graph.curves.map(c => c.fn).join(', ')}` : ''}${st.graph.asymptote ? `, asymptote ${JSON.stringify(st.graph.asymptote)}` : ''}${st.graph.points ? `, points ${st.graph.points.map(p => p.label).join(' ')}` : ''}]` : ''}`));
    if (sc.pinned) out.push(`PINNED STEPS (above the board, shown by "pin" actions): ${sc.pinned.join(' · ')}`);
    if (sc.sketch) out.push(`SIDE SKETCH (beside the working, built by "sketch" actions): corner shapes ${[sc.sketch.inset.fn, ...(sc.sketch.inset.curves ?? []).map(c => c.fn)].join(', ')} (ids ${[sc.sketch.inset.id, ...(sc.sketch.inset.curves ?? []).map(c => c.id)].join(', ')}); the shape ${sc.sketch.shape} lifted from ${sc.sketch.from}, slid by ${JSON.stringify(sc.sketch.shift ?? {})}; asymptote ${JSON.stringify(sc.sketch.asymptote ?? {})}; points ${(sc.sketch.points ?? []).map(p => p.label).join(' ')}`);
    out.push('');
    (sc.beats ?? []).forEach((b, k) => {
      n++;
      const acts = b.do.map(a => {
        const what = a.do === 'write' ? `write ${a.step !== undefined ? `line ${a.step}` : `{${a.token}}`}`
          : a.do === 'note' ? `note "${a.text}" under {${a.near ?? '?'}}`
          : a.do === 'highlight' ? `light {${[].concat(a.token).join(', ')}}${a.part ? ` (${a.part})` : ''}`
          : a.do === 'mark' ? `${a.kind} round {${[].concat(a.token).join(', ')}}`
          : a.do === 'move' ? `move {${a.from}} to its new place`
          : a.do === 'sketch' ? `sketch: ${a.show ?? `point ${a.point}`}`
          : a.do === 'pin' ? (a.show !== undefined ? `pinned steps: show ${a.show}` : `pinned steps: light ${a.lit}`)
          : a.do;
        return `${what}${a.on ? ` on "${a.on}"` : ' (as the beat starts)'}`;
      });
      const shown = boardTextAfter(sc, k);
      const st = boardStateAt(sc, k, 9999);
      out.push(`BEAT ${n}`);
      out.push(`  voice: "${b.say}"`);
      out.push(`  board adds: ${acts.join('; ') || '(nothing)'}`);
      out.push(`  board shows after it: ${shown || '(empty)'}${st.sketch?.length ? `   | side sketch so far: ${st.sketch.join(', ')}` : ''}`);
      if (b.aside) out.push(`  💡 chip: "${b.aside.text}"${b.aside.read ? ` → written: ${b.aside.read.join(' / ')}` : ' → a side clip'}`);
    });
  });
  return out.join('\n');
}

// ── Frames: look.mjs's screenshots, one per action, in order (capped) ───────────────────────
function frames() {
  if (args['no-frames']) return [];
  const dir = args.frames ? path.resolve(String(args.frames)) : path.join(os.tmpdir(), 'clip-look', slug);
  if (!fs.existsSync(dir)) return [];
  let files = fs.readdirSync(dir).filter(f => /\.png$/.test(f) && !/^zz/.test(f)).sort();
  // At most 24: keep the last frame of each beat first, then fill in order.
  if (files.length > 24) {
    const lastOfBeat = new Map();
    for (const f of files) { const m = f.match(/-b(\d+)-/); if (m) lastOfBeat.set(m[1], f); }
    const keep = new Set([...lastOfBeat.values()]);
    for (const f of files) { if (keep.size >= 24) break; keep.add(f); }
    files = files.filter(f => keep.has(f));
  }
  return files.map(f => ({ name: f, data: fs.readFileSync(path.join(dir, f)).toString('base64') }));
}

const rules = fs.readFileSync(path.join(ROOT, 'data/clip-bibles/_house.md'), 'utf8');
const brief = fs.readFileSync(path.join(ROOT, 'scripts/clips/prompts/reviewer.md'), 'utf8');
const imgs = frames();
const content = [
  { type: 'text', text: `${brief}\n\n---\n\n# The house rules\n\n${rules}\n\n---\n\n# The clip: ${lesson.title} (${lesson.level} ${lesson.topic})\n\nThe question (shown above the clip): ${lesson.question ?? '(none)'}\n\n${storyboard()}` },
  ...(imgs.length ? [{ type: 'text', text: `\n\n${imgs.length} phone screenshots follow, in order; each is named <n>-b<beat>-<action>.` }] : []),
  ...imgs.flatMap(im => [{ type: 'text', text: im.name }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: im.data } }]),
  { type: 'text', text: '\n\nGive your notes as the JSON object, nothing else.' },
];

const key = (process.env.ANTHROPIC_API_KEY || '').replace(/^["']|["']$/g, '').trim();
if (!key) { console.error('ANTHROPIC_API_KEY is not set (source .env.local)'); process.exit(2); }
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_tokens: 16000, messages: [{ role: 'user', content }] }),
});
const j = await res.json();
if (!res.ok) { console.error(`review: ${res.status} ${JSON.stringify(j).slice(0, 400)}`); process.exit(2); }
const text = (j.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
const m = text.match(/\{[\s\S]*\}/);
let review;
try { review = JSON.parse(m ? m[0] : text); } catch { console.error('review: no JSON in the reply:\n' + text.slice(0, 800)); process.exit(2); }

// The verdict follows the notes: a "must" sends it back, "should"s alone do not.
review.verdict = (review.findings ?? []).some(f => f.severity === 'must') ? 'fix' : 'pass';
const record = { slug, at: new Date().toISOString(), model: MODEL, frames: imgs.length, usage: j.usage, ...review };
const outFile = args.out ? path.resolve(String(args.out)) : path.join(ROOT, 'data/clip-runs', slug, 'review.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(record, null, 1) + '\n');
const musts = (review.findings ?? []).filter(f => f.severity === 'must');
console.log(`${review.verdict === 'pass' ? '✓' : '✗'} ${slug}: ${review.verdict} · ${musts.length} must, ${(review.findings ?? []).length - musts.length} should · ${imgs.length} frames · ${j.usage?.input_tokens ?? '?'} in / ${j.usage?.output_tokens ?? '?'} out`);
for (const f of review.findings ?? []) console.log(`   ${f.severity === 'must' ? '✗' : '·'} b${f.beat} [${f.rule}] ${f.problem}\n        → ${f.fix}`);
process.exit(review.verdict === 'pass' ? 0 : 1);
