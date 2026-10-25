#!/usr/bin/env node
// Clip pipeline step 6 — did the voice say what the script says? (SPEC-CLIP-PIPELINE.md §2)
//
//   node scripts/lessons/generate-narration.mjs <slug> --verify > data/clip-runs/<slug>/asr.txt
//   node scripts/clips/asr-score.mjs <slug…>
//
// generate-narration --verify transcribes every clip and scores it as a bag of whole
// words. That bag is fooled by HOW the transcript is written, not by what was said:
// the script says "one point two", "L N A", "seven point five K"; the transcript writes
// "1.2", "LNA", "7.5k" — a correct line scores 57–83 %. This re-scores every line the
// transcript printed (the ones under 85 %) on a canonical character stream: number
// words → digits, "-" → "minus", case, spaces and punctuation dropped — then a
// similarity of 1 − edit distance / length. A misread word still costs its letters.
// Writes data/clip-runs/<slug>/asr.json { worst, lines[] }. Gate: every line ≥ 0.85.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs } from '../lessons/shared.mjs';

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "fifteen point eight" → "15.8", "one hundred" → "100"; everything else unchanged. */
export function numberWordsToDigits(text) {
  const toks = text.toLowerCase().replace(/[-–]/g, ' minus ').split(/\s+/).filter(Boolean);
  const out = [];
  const val = (w) => { const c = w.replace(/[^a-z]/g, ''); const u = UNITS.indexOf(c); return u >= 0 ? u : (TENS[c] ?? null); };
  for (let i = 0; i < toks.length;) {
    if (val(toks[i]) === null || toks[i].replace(/[^a-z]/g, '') === 'and') { out.push(toks[i]); i += 1; continue; }
    let n = 0, cur = 0, j = i;
    while (j < toks.length) {
      const c = toks[j].replace(/[^a-z]/g, '');
      const v = val(toks[j]);
      if (v !== null) { cur += v; j += 1; continue; }
      if (c === 'hundred') { cur *= 100; j += 1; continue; }
      // "one hundred and twenty" is one number (25 Oct 2026); "negative one and one" stays two.
      if (c === 'and' && cur >= 100 && cur % 100 === 0 && j + 1 < toks.length && val(toks[j + 1]) !== null) { j += 1; continue; }
      if (c === 'thousand') { n += cur * 1000; cur = 0; j += 1; continue; }
      break;
    }
    let s = String(n + cur);
    if (j < toks.length && toks[j].replace(/[^a-z]/g, '') === 'point') {
      let d = '', k = j + 1;
      while (k < toks.length && UNITS.indexOf(toks[k].replace(/[^a-z]/g, '')) >= 0 && UNITS.indexOf(toks[k].replace(/[^a-z]/g, '')) <= 9) { d += UNITS.indexOf(toks[k].replace(/[^a-z]/g, '')); k += 1; }
      if (d) { s += '.' + d; j = k; }
    }
    out.push(s);
    i = j;
  }
  return out.join(' ');
}

// Spoken maths the transcript writes as symbols (15 Oct 2026, question clips): "a half" → 1/2,
// "times" → *, "cubed" → "cube". Both sides go through the same map, so a misheard word still costs.
const SPOKEN_SYMBOLS = [
  [/\b(a|one) half\b/g, ' 1/2 '], [/\b(a|one) third\b/g, ' 1/3 '], [/\b(a|one) quarter\b/g, ' 1/4 '],
  [/\btimes\b|×|\*/g, ' x '], [/\bcubed\b/g, ' cube '], [/\bsquared\b/g, ' square '],
  [/\bover\b/g, ' / '], [/\bplus\b|\+/g, ' plus '], [/\bequals\b|=/g, ' equals '],
  // 16 Oct 2026: "seven to the power X" heard as "7 ^ x"; "write two" heard as "right two".
  [/\^|\bto the power( of)?\b/g, ' pow '], [/\b(write|rite)\b/g, ' right '],
  // 'negative one' is heard as '-1' (the transcript writes the sign): both read as minus.
  [/\bnegative\b/g, ' minus '],
  // 25 Oct 2026 (kinematics): "centimetres" heard as "cm", "centre" as the US "center".
  [/\bcentimet(re|er)s?\b|\bcm\b/g, ' cm '], [/\bcent(re|er)\b/g, ' centre '],
];
const spoken = (t) => SPOKEN_SYMBOLS.reduce((acc, [re, to]) => acc.replace(re, to), t.toLowerCase());
const canon = (t) => numberWordsToDigits(spoken(t)).replace(/\bnought\b/g, 'not').replace(/[^a-z0-9.\/]/g, '').replace(/\.(?![0-9])/g, '');

function similarity(a, b) {
  const m = a.length, n = b.length;
  if (!m && !n) return 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

const args = parseArgs(process.argv.slice(2));
let failed = false;
for (const slug of args._) {
  const scenesB = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lessons', `${slug}.json`), 'utf8')).scenes.map(sc => sc.beats);
  const beats = scenesB.flat();
  const txt = fs.readFileSync(path.join(ROOT, 'data/clip-runs', slug, 'asr.txt'), 'utf8').split('\n');
  const lines = [];
  for (let i = 0; i < txt.length; i++) {
    const m = txt[i].match(/scene-(\d+)-b(\d+): (\d+)% of narration words heard/);
    if (!m) continue;
    const sceneN = Number(m[1]);
    const k = scenesB.slice(0, sceneN - 1).reduce((n, b) => n + b.length, 0) + Number(m[2]);
    const bag = Number(m[3]) / 100;
    const heard = txt[i + 1]?.match(/^\s+heard: (.*)$/)?.[1] ?? null;
    const score = heard ? Math.max(bag, similarity(canon(beats[k - 1].say), canon(heard))) : bag;
    lines.push({ beat: k, bag, score: +score.toFixed(3), heard, said: heard ? beats[k - 1].say : undefined });
  }
  const worst = lines.length === beats.length ? Math.min(...lines.map(l => l.score)) : 0;
  fs.writeFileSync(path.join(ROOT, 'data/clip-runs', slug, 'asr.json'), JSON.stringify({ slug, worst, lines }, null, 1) + '\n');
  const ok = worst >= 0.85;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${slug}: ${lines.length}/${beats.length} lines heard · worst ${Math.round(worst * 100)} %`);
  for (const l of lines.filter(l => l.heard)) console.log(`    b${l.beat} ${Math.round(l.bag * 100)} % → ${Math.round(l.score * 100)} %  said "${l.said}" · heard "${l.heard}"`);
}
process.exit(failed ? 1 : 0);
