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
if (!/^[A-Z][0-9]*$/.test(draftKey)) { console.error('no draft picked — run the blind read or pass --draft A|B'); process.exit(2); }
const draft = read(`${runDir}/draft-${draftKey}.json`);

// fixed_beats are keyed by beat number, first beat = "1". A reader that counted from 0 (a key
// "0" present — seen 15 Oct 2026 on a question clip) is read as 0-based, never shifted silently.
const fixKeys = Object.keys((blind && !args.draft ? blind.fixed_beats : null) ?? {});
const zeroBased = fixKeys.includes('0');
const beats = draft.beats.map((b, i) => {
  const fix = blind && !args.draft ? blind.fixed_beats?.[String(zeroBased ? i : i + 1)] : null;
  // `asks` (the ready questions of "Ask about this step", lib/clip-ask.ts) ride with the draft's beat.
  const asks = fix?.asks ?? b.asks;
  // `aside` (a side link to another clip, Beat.aside) rides with the beat too.
  const aside = fix?.aside ?? b.aside;
  return { say: fix ? fix.say : b.say, ...(asks?.length ? { asks } : {}), ...(aside ? { aside } : {}), do: fix ? fix.do : b.do };
});

// Keep audio already made for an unchanged line (a rewrite drops it: it belongs to the old words).
// A plan may have two boards (`boards`, each line's `board`, each beat's `board`): one scene each.
const nBoards = Math.max(1, plan.boards?.length ?? 1);
const sceneBeats = Array.from({ length: nBoards }, (_, k) => beats.filter((b, i) => (draft.beats[i].board ?? 0) === k));
// --out <file>: write elsewhere (draft-check.mjs checks a draft without touching the clip).
const outPath = args.out ? path.resolve(ROOT, String(args.out)) : path.join(ROOT, 'data/lessons', `${slug}.json`);
if (fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  sceneBeats.forEach((list, k) => {
    const old = prev.scenes?.[k]?.beats ?? [];
    list.forEach((b, i) => {
      if (old[i] && old[i].say === b.say) {
        if (!b.asks && old[i].asks) b.asks = old[i].asks;   // ready questions written into the clip itself
        if (old[i].audio) b.audio = old[i].audio;
        if (old[i].timing) b.timing = old[i].timing;
      }
    });
  });
}

const scenes = sceneBeats.map((list, k) => {
  const board = plan.boards?.[k] ?? { heading: plan.heading, intro: plan.intro };
  return {
    type: 'equation-steps',
    ...(board.heading ? { heading: board.heading } : {}),
    ...(board.intro ? { intro: board.intro } : {}),
    // A scrolling board (one long board that slides up) carries each step's title on its first line.
    // ONE scrolling board is the default for a clip (house rules §1); a plan opts out with "scroll": false.
    ...(board.scroll || (nBoards === 1 && plan.scroll !== false) ? { scroll: true } : {}),
    steps: plan.lines.filter(l => (l.board ?? 0) === k).map(l => ({ ...(l.heading ? { heading: l.heading } : {}), tokens: l.tokens.map(t => ({ ...t })), ...(l.note ? { note: l.note } : {}), ...(l.graph ? { graph: l.graph } : {}) })),
    beats: list,
  };
});
const lesson = {
  slug: plan.slug,
  title: plan.title,
  level: plan.level,
  topic: plan.topic,
  minutes: plan.minutes ?? 1,
  kind: 'clip',
  theme: 'chalk',
  ...(plan.question ? { question: plan.question } : {}),
  scenes,
};
fs.writeFileSync(outPath, formatJson(lesson) + '\n');
console.log(`data/lessons/${slug}.json ← plan + draft ${draftKey}${blind && !args.draft && blind.fixed_beats ? ` (+ ${Object.keys(blind.fixed_beats).length} fixed beat(s))` : ''} · ${beats.length} beats on ${nBoards} board(s)`);
