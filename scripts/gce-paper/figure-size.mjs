// The printed size of a graph-paper grid, shared by generate.mjs (the paper PDF) and
// publish.mjs (the bank row the app prints from). A grid the candidate draws on prints
// with one major square = 1 cm exactly, so its scale is real graph paper's (Adrian,
// 24 Sep 2026: "is the graph to scale?" — the app printed it at 72% of the text width).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// One major square of a rendered graph-paper grid, in viewBox px: the first <path> is
// the minor grid, its vertical lines are `minor` apart, 5 to a major.
export function graphPaperMajorPx(svg) {
  const grid = svg.match(/<path d="([^"]+)"/)?.[1];
  if (!grid) return null;
  const xs = [...new Set([...grid.matchAll(/M ([\d.]+) [\d.]+ L ([\d.]+) /g)].filter((a) => a[1] === a[2]).map((a) => Number(a[1])))].sort((a, b) => a - b);
  if (xs.length < 3) return null;
  let minor = Infinity;
  for (let i = 1; i < xs.length; i++) minor = Math.min(minor, xs[i] - xs[i - 1]);
  return minor * 5;
}

// Major squares across a graph-paper spec: the x range in steps, times majors per step.
export function gridColumns(spec) {
  const x = spec?.xAxis;
  if (!x || !(Number(x.step) > 0)) return null;
  const n = ((Number(x.max) - Number(x.min)) / Number(x.step)) * (Number(x.majorsPerStep) || 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Printed width in mm of Q<pos>'s figure PNG when it is a graph-paper grid, else null
// — measured on the PNG that is uploaded, because export-docx.py trims a figure PNG to
// its ink IN PLACE (so neither the SVG's width nor the spec alone says how wide the PNG
// is): the outermost vertical lines that run most of the PNG's height are the grid's
// edges, the spec says how many major squares lie between them, and one major square
// prints at 10 mm.
export async function gridPrintWidthMm(dir, pos, sharp) {
  if (!dir || !sharp) return null;
  const specPath = resolve(dir, `Q${pos}.figure.json`);
  const pngPath = resolve(dir, `Q${pos}.figure.png`);
  if (!existsSync(specPath) || !existsSync(pngPath)) return null;
  let spec;
  try { spec = JSON.parse(readFileSync(specPath, 'utf8')); } catch { return null; }
  if (spec?.family !== 'graph-paper') return null;
  const cols = gridColumns(spec);
  if (!cols) return null;
  const { data, info } = await sharp(pngPath).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return gridWidthFromPixels(data, info.width, info.height, info.channels, cols);
}

// The pure half, testable without an image file.
export function gridWidthFromPixels(data, width, height, channels, cols) {
  const full = [];
  for (let x = 0; x < width; x++) {
    let ink = 0;
    for (let y = 0; y < height; y++) if (data[(y * width + x) * channels] < 250) ink++;
    if (ink >= 0.5 * height) full.push(x);
  }
  if (full.length < 2) return null;
  const span = full[full.length - 1] - full[0];
  if (span <= 0) return null;
  const mm = Math.round(((width * cols) / span) * 100) / 10;
  return mm >= 20 && mm <= 200 ? mm : null;
}
