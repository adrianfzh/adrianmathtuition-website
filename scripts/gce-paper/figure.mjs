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
// The two spec languages are documented by the code that draws them — an agent
// authoring a figure reads these BEFORE writing a spec (the gce-paper skill's
// figure step), never from memory:
//   node scripts/gce-paper/figure.mjs --families          every registry family, one line each
//   node scripts/gce-paper/figure.mjs --doc <family>      that family's SPEC_DOC (fields, ranges, an example)
//   node scripts/gce-paper/figure.mjs --doc engine        the construction engine's API + file contract
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

// ── --families / --doc: print the spec language and exit ─────────────────────
const familyNames = () => (registry.figureFamilies?.() ?? Object.keys(registry.FAMILY_MODULES ?? {}))
  .map((f) => (typeof f === 'string' ? f : f?.FAMILY))
  .filter(Boolean);
if (args.includes('--families')) {
  for (const name of familyNames()) {
    const fam = registry.getFamily(name);
    const first = String(fam?.SPEC_DOC ?? '').split('\n').find((l) => l.trim()) ?? '';
    console.log(`${name.padEnd(32)} ${first.trim().slice(0, 110)}`);
  }
  console.log(`\n${familyNames().length} families · node scripts/gce-paper/figure.mjs --doc <family> for one · --doc engine for the construction engine`);
  process.exit(0);
}
if (args.includes('--doc')) {
  const want = argOf('--doc', '');
  if (want === 'engine') {
    const methods = Object.getOwnPropertyNames(engine.Construction.prototype).filter((m) => m !== 'constructor');
    console.log(`ai/figure-engine — a CONSTRUCTION engine for geometry the registry has no family for.
File contract (Q<n>.figure.cjs, CommonJS, no requires):
  module.exports = ({ Construction, el }) => ({
    cons,                 // the Construction (its assert* calls are the proof the drawing is consistent — they THROW, so a wrong figure draws nothing)
    width, height,        // px of the drawing box (≈ 260–320 × 200–300)
    tall: true?,          // portrait box
    margin,               // px padding
    base: [ …el.* ],      // what is always drawn
    layers: [[ …el.* ]],  // reveal layers for solutions; a single empty layer [[]] for a question figure
  });
Points are named ('A'); every el.* takes point names or {x, y}. Labels: el.label(point, 'A', dx, dy, { italic: true, fs: 13 }); el.mathlabel for TeX.
Construction methods (chainable): ${methods.join(', ')}
el constructors: ${Object.keys(engine.el).join(', ')}
Rules: build the geometry from the question's given lengths/angles, then assert every relation the question states (assertOnCircle, assertTangentAt, assertParallel, assertEqualLength, assertBetween …); read the PNG after rendering and fix labels that collide; never draw a relation the question asks the student to prove as if it were given (no right-angle mark on an angle to be proved right).
Example: the plane-geometry figure in .claude/skills/gce-paper/examples/Q7.figure.cjs`);
    process.exit(0);
  }
  const fam = registry.getFamily(want);
  if (!fam) { console.error(`unknown family "${want}" — --families lists them`); process.exit(1); }
  console.log(`family: ${fam.FAMILY}  spec_version: ${fam.SPEC_VERSION ?? '?'}\n`);
  console.log(fam.SPEC_DOC ?? '(no SPEC_DOC on this family — read lib/figures/' + want + '.js in the bot repo)');
  process.exit(0);
}

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

// A graph-paper grid is centred on a wide canvas, so a tall narrow plot comes
// with blank side margins that would either waste the column or shrink the
// squares when the figure is fitted to it. Trim the viewBox to the plot plus
// 1.3 major squares each side (room for the axis numbering and the x label);
// the top and bottom already hug the axis label and the tick labels.
export function trimGraphPaper(svg) {
  const open = svg.match(/<svg[^>]*>/)?.[0] ?? '';
  const vb = open.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/);
  const grid = svg.match(/<path d="([^"]+)"/)?.[1];
  if (!vb || !grid) return svg;
  const xs = [...new Set([...grid.matchAll(/M ([\d.]+) [\d.]+ L ([\d.]+) /g)].filter((m) => m[1] === m[2]).map((m) => Number(m[1])))].sort((a, b) => a - b);
  if (xs.length < 3) return svg;
  let minor = Infinity;
  for (let i = 1; i < xs.length; i++) minor = Math.min(minor, xs[i] - xs[i - 1]);
  const major = minor * 5;
  // 1.3 major squares is room enough on a normal sheet, but a tall sheet (many
  // majors under the height cap) has small majors, and 1.3 of them is narrower
  // than a "0.2" tick label — the numbering and the origin O were sliced in half.
  // Never trim the left side below the width the numbering needs.
  const x0 = Math.max(Number(vb[1]), xs[0] - Math.max(1.3 * major, 46));
  // The right side must still hold the x-axis label, which sits past the arrow
  // head: measure where the drawn text actually ends rather than guess in majors.
  let textEnd = 0;
  for (const m of svg.matchAll(/<text x="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)</g)) {
    const w = 0.58 * Number(m[2]) * m[4].length;
    const start = m[3] === 'middle' ? Number(m[1]) - w / 2 : m[3] === 'end' ? Number(m[1]) - w : Number(m[1]);
    textEnd = Math.max(textEnd, start + w);
  }
  const x1 = Math.min(Number(vb[1]) + Number(vb[3]), Math.max(xs[xs.length - 1] + 1.3 * major, textEnd + 6));
  const w = Math.round(x1 - x0), h = Number(vb[4]);
  return svg
    .replace(/viewBox="[^"]*"/, `viewBox="${x0.toFixed(2)} ${vb[2]} ${w} ${h}"`)
    .replace(/(<svg[^>]*\swidth=")[\d.]+(")/, `$1${w}$2`)
    .replace(/(<svg[^>]*\sheight=")[\d.]+(")/, `$1${h}$2`);
}

function renderSpec(spec) {
  const v = registry.verifyFigure(spec);
  if (!v.ok) throw new Error(`verify: ${v.reason}`);
  const svg = registry.renderFigure(spec);
  return spec.family === 'graph-paper' ? trimGraphPaper(svg) : svg;
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
