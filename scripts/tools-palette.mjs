#!/usr/bin/env node
// Re-palette the static /tools pages from the old warm-paper scheme to the
// site palette (cool near-white + navy), so the tools stop looking like a
// separate beige world from adrianmathtuition.com.
//
// Only the files that actually carry the beige scheme are touched: five tools
// (argand-diagram, calculus-drill, graph-transformations, mental-math,
// vectors-3d) are deliberately dark and trig-graphs is already cool, so they
// are skipped. The Dropbox conflict copies ("… 2.html") are skipped too.
//
// Idempotent: the new values are not in the old map, so a second run is a
// no-op. Run: node scripts/tools-palette.mjs [--check]

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tools');
const CHECK = process.argv.includes('--check');

// old → new. Hex keys are matched case-insensitively.
const HEX = {
  '#F4EFE6': '#F8FAFC', // paper background
  '#fbf8f1': '#FFFFFF', // raised panel
  '#e7ded0': '#DDE3EC', // panel border
  '#e6ddcd': '#E3E9F1', // grid line
  '#cfc6b6': '#AEBDCE', // axis / rule
  '#2b2b2b': '#142033', // ink
  '#7d756a': '#5A6B80', // muted ink
  '#2E7C8F': '#1F6F84', // teal
  '#D8693C': '#C85A2E', // orange
  '#BC5A6E': '#B04A62', // rose
  '#7B5EA7': '#6B4E9C', // plum
  // warm greys that crept in around the older tools
  '#c9bfae': '#B9C4D2',
  '#cdc4b3': '#C3CDDA',
  '#a89d8c': '#94A3B8',
  '#9b9081': '#8494A8',
  '#8d8578': '#8494A8',
  // instrument / grid tones found in the first visual sweep
  '#8a7b63': '#6B7A8C',
  '#6f6a63': '#5A6B80',
  '#d9d2c6': '#D3DBE5',
  '#dad0bf': '#D6DEE8',
  '#f1ebdd': '#EEF2F7',
  '#f4b183': '#EDA98A',
  '#9fd6c7': '#8FC6D6',
  // answer-feedback tints
  '#e9f1ef': '#E8F2F6',
  '#f6e9ec': '#FBEAEE',
};
// rgba(...) prefixes — the alpha is kept, only the colour moves
const RGBA = {
  'rgba(244,239,230': 'rgba(248,250,252',  // halo behind canvas text
  'rgba(251,248,241': 'rgba(255,255,255',  // panel fill
  'rgba(230,221,205': 'rgba(227,233,241',  // grid wash
  'rgba(43,43,43': 'rgba(20,32,51',        // ink wash
  'rgba(46,124,143': 'rgba(31,111,132',    // teal wash
  'rgba(216,105,60': 'rgba(200,90,46',     // orange wash
  'rgba(188,90,110': 'rgba(176,74,98',     // rose wash
  'rgba(123,94,167': 'rgba(107,78,156',    // plum wash
  'rgba(255,253,248': 'rgba(255,255,255',  // cream card fill
};

const files = readdirSync(DIR)
  .filter(f => f.endsWith('.html'))
  .filter(f => !/ \d\.html$/.test(f));           // skip Dropbox conflict copies

let changed = 0;
const skipped = [];
for (const f of files) {
  const path = join(DIR, f);
  const before = readFileSync(path, 'utf8');
  if (!/#F4EFE6/i.test(before)) { skipped.push(f); continue; }
  let after = before;
  for (const [from, to] of Object.entries(HEX))
    after = after.replace(new RegExp(from, 'gi'), to);
  for (const [from, to] of Object.entries(RGBA))
    after = after.split(from).join(to);
  if (after !== before) {
    changed++;
    if (!CHECK) writeFileSync(path, after);
  }
}
console.log(`[tools-palette] ${CHECK ? 'would update' : 'updated'} ${changed} file(s)`);
console.log(`[tools-palette] skipped (not the beige scheme): ${skipped.join(', ') || 'none'}`);
