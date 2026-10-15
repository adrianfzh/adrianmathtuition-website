#!/usr/bin/env node
// Clip pipeline — put a checked board and its picked narration together into a
// lesson script (SPEC-CLIP-PIPELINE.md §2, between steps 5 and 3).
//
//   node scripts/clips/assemble.mjs <slug> [--draft A|B] [--force]
//
// Reads data/clip-plans/<slug>.json (the board, maths-checked by chain-check.py)
// and data/clip-runs/<slug>/draft-<X>.json (the narration). The draft is the
// blind reader's pick (data/clip-runs/<slug>/blind-read.json) unless --draft is
// given; the reader's `fixed_beats` replace those beats. Writes
// data/lessons/<slug>.json — the board's lines are copied from the plan, never
// from the draft, so the board on screen is exactly the board that was checked.
// Keeps any audio / timing already stamped on a beat whose `say` is unchanged.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, formatJson } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
const slug = args._[0];
if (!slug) { console.error('usage: node scripts/clips/assemble.mjs <slug> [--draft A|B]'); process.exit(2); }

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const plan = read(`data/clip-plans/${slug}.json`);
const runDir = `data/clip-runs/${slug}`;
const blindPath = path.join(ROOT, runDir, 'blind-read.json');
const blind = fs.existsSync(blindPath) ? JSON.parse(fs.readFileSync(blindPath, 'utf8')) : null;
const draftKey = String(args.draft || blind?.pick || '').toUpperCase();
if (!['A', 'B'].includes(draftKey)) { console.error('no draft picked — run the blind read or pass --draft A|B'); process.exit(2); }
const draft = read(`${runDir}/draft-${draftKey}.json`);

const beats = draft.beats.map((b, i) => {
  const fix = blind && !args.draft ? blind.fixed_beats?.[String(i + 1)] : null;
  return fix ? { say: fix.say, do: fix.do } : { say: b.say, do: b.do };
});

// Keep audio already made for an unchanged line (a rewrite drops it: it belongs to the old words).
const outPath = path.join(ROOT, 'data/lessons', `${slug}.json`);
if (fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const old = prev.scenes?.[0]?.beats ?? [];
  beats.forEach((b, i) => {
    if (old[i] && old[i].say === b.say) {
      if (old[i].audio) b.audio = old[i].audio;
      if (old[i].timing) b.timing = old[i].timing;
    }
  });
}

const scene = {
  type: 'equation-steps',
  heading: plan.heading,
  ...(plan.intro ? { intro: plan.intro } : {}),
  steps: plan.lines.map(l => ({ tokens: l.tokens.map(t => ({ ...t })), ...(l.note ? { note: l.note } : {}) })),
  beats,
};
const lesson = {
  slug: plan.slug,
  title: plan.title,
  level: plan.level,
  topic: plan.topic,
  minutes: 1,
  kind: 'clip',
  theme: 'chalk',
  scenes: [scene],
};
fs.writeFileSync(outPath, formatJson(lesson) + '\n');
console.log(`data/lessons/${slug}.json ← plan + draft ${draftKey}${blind && !args.draft && blind.fixed_beats ? ` (+ ${Object.keys(blind.fixed_beats).length} fixed beat(s))` : ''} · ${beats.length} beats`);
