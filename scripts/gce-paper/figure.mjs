#!/usr/bin/env node
// scripts/gce-paper/figure.mjs — draw the figures a generated GCE paper needs.
//
// For each slot in a run dir it looks for ONE of:
//   Q<n>.figure.json — a typed spec for the bot's figure registry
//                      (lib/figures: 33 families, verify() fails closed)
//   Q<n>.figure.cjs  — a construction for the bot's figure engine
//                      (ai/figure-engine): module.exports = ({ Construction, el }) =>
//                      ({ cons, base, layers, width, height, tall, margin })
// and writes Q<n>.figure.svg (embedded in the PDF by `generate.mjs assemble`)
// plus Q<n>.figure.png (for the docx export), rasterised with the bot's sharp.
//
//   node scripts/gce-paper/figure.mjs --run <dir> [--slots 7,9] [--density 288]
//
// Both engines are zero-dep CommonJS in the bot repo; nothing here calls a model.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BOT = process.env.BOT_REPO || '/Users/adrianfong/dev/adrianmath-telegram-math-bot';
const botRequire = createRequire(join(BOT, 'package.json'));
const registry = botRequire('./lib/figures');
const engine = botRequire('./ai/figure-engine');
let sharp = null;
try { sharp = botRequire('sharp'); } catch { /* PNG step skipped */ }

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const runDir = resolve(argOf('--run', '.'));
const only = argOf('--slots', null)?.split(',').map((s) => Number(s.trim())).filter(Boolean) ?? null;
const density = Number(argOf('--density', '288'));

function ensureSvgNs(svg) {
  let out = /<svg[^>]*xmlns=/.test(svg) ? svg : svg.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  // The engine emits a viewBox only; without width/height Chromium prints the
  // <img> at a thumbnail size in the PDF. Give it the viewBox's size in px.
  const open = out.match(/<svg[^>]*>/)?.[0] ?? '';
  const vb = open.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/);
  // Registry figures are ~640px wide and print at a good size, so scale the
  // engine's small viewBox up to the same footprint (the PDF caps height at 300pt).
  if (vb && !/\swidth=/.test(open)) {
    const w = 600, h = Math.round((w * Number(vb[2])) / Number(vb[1]));
    out = out.replace(/<svg/, `<svg width="${w}" height="${h}"`);
  }
  return out;
}

function renderSpec(spec) {
  const v = registry.verifyFigure(spec);
  if (!v.ok) throw new Error(`verify: ${v.reason}`);
  return registry.renderFigure(spec);
}

function renderEngine(file) {
  const build = botRequire(file);
  const fig = build(engine);
  const svgs = engine.renderLayers(fig);
  return svgs[svgs.length - 1];
}

const slots = readdirSync(runDir)
  .map((f) => f.match(/^Q(\d+)\.figure\.(json|cjs)$/))
  .filter(Boolean)
  .map((m) => ({ pos: Number(m[1]), kind: m[2], file: join(runDir, m[0]) }))
  .filter((s) => !only || only.includes(s.pos))
  .sort((a, b) => a.pos - b.pos);

if (!slots.length) { console.error(`no Q<n>.figure.json / .cjs in ${runDir}`); process.exit(1); }

let failed = 0;
for (const s of slots) {
  try {
    const svg = ensureSvgNs(s.kind === 'json' ? renderSpec(JSON.parse(readFileSync(s.file, 'utf8'))) : renderEngine(s.file));
    const svgPath = join(runDir, `Q${s.pos}.figure.svg`);
    writeFileSync(svgPath, svg);
    let png = null;
    if (sharp) {
      png = join(runDir, `Q${s.pos}.figure.png`);
      const buf = await sharp(Buffer.from(svg), { density }).flatten({ background: '#ffffff' }).png().toBuffer();
      writeFileSync(png, buf);
    }
    const family = s.kind === 'json' ? JSON.parse(readFileSync(s.file, 'utf8')).family : 'engine';
    console.log(`Q${s.pos} ✓ ${family} → ${svgPath}${png ? ' + png' : ' (no sharp: png skipped)'}`);
  } catch (e) {
    failed++;
    console.log(`Q${s.pos} ✗ ${e.message.split('\n')[0]}`);
  }
}
process.exit(failed ? 1 : 0);
