#!/usr/bin/env node
// Clip pipeline — the no-model checks for an assembled clip, and the per-clip record
// (SPEC-CLIP-PIPELINE.md §2 steps 3, 4 and 6).
//
//   node scripts/clips/gate.mjs <slug…> [--voice]
//
//   · rules  — scripts/lessons/verify-lesson.mjs (structure, KaTeX, word limits, motion,
//              narration rules). Any error or warning fails the clip.
//   · maths  — scripts/clips/chain-check.py on the board plan (every line follows from
//              the one before; the last line is the answer).
//   · board  — the lesson's lines are EXACTLY the plan's lines (the board on screen is
//              the board that was checked).
//   · read   — the blind reader's verdict (data/clip-runs/<slug>/blind-read.json) is pass.
//   · voice  — with --voice: every beat has its clip + timing sidecar, and the speech
//              round trip (generate-narration --verify) heard ≥ 85 % of the words.
//   · look   — data/clip-runs/<slug>/look.json (scripts/clips/look.mjs) passed.
//
// Writes data/clip-runs/<slug>/gate.json; prints one line per check. Exit 1 if any fails.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, parseArgs } from '../lessons/shared.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args._.length) { console.error('usage: node scripts/clips/gate.mjs <slug…> [--voice]'); process.exit(2); }
const rd = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return null; } };
let failed = false;

for (const slug of args._) {
  const out = { slug, at: new Date().toISOString(), checks: {} };
  const put = (k, ok, detail) => { out.checks[k] = { ok, detail }; };

  // rules
  const v = spawnSync('node', ['scripts/lessons/verify-lesson.mjs', slug, '--json'], { cwd: ROOT, encoding: 'utf8' });
  try {
    const j = JSON.parse(v.stdout);
    const issues = (j.issues ?? []).filter(i => i.severity !== 'info');
    const errs = j.errors ?? issues.filter(i => i.severity === 'error').length;
    put('rules', v.status === 0 && issues.length === 0, issues.length ? issues.map(i => `${i.severity} ${i.where}: ${i.message}`).join(' | ') : 'PASS — 0 errors, 0 warnings');
    void errs;
  } catch {
    put('rules', false, (v.stdout + v.stderr).trim().split('\n').slice(-5).join(' | '));
  }

  // maths
  const m = spawnSync('/usr/bin/python3', ['scripts/clips/chain-check.py', slug, '--json'], { cwd: ROOT, encoding: 'utf8' });
  try {
    const j = JSON.parse(m.stdout);
    const bad = j.checks.filter(c => !c.ok);
    put('maths', j.pass, bad.length ? bad.map(c => c.detail).join(' | ') : `${j.checks.length}/${j.checks.length} line checks`);
  } catch { put('maths', false, (m.stdout + m.stderr).trim().slice(-300)); }

  // board
  const plan = rd(`data/clip-plans/${slug}.json`);
  const lesson = rd(`data/lessons/${slug}.json`);
  const sameBoard = plan && lesson && JSON.stringify(lesson.scenes.flatMap(sc => sc.steps.map(s => s.tokens))) === JSON.stringify(plan.lines.map(l => l.tokens));
  put('board', !!sameBoard, sameBoard ? `${plan.lines.length} lines = the checked plan` : 'the lesson\'s lines differ from the checked plan — re-run assemble.mjs');

  // read
  const br = rd(`data/clip-runs/${slug}/blind-read.json`);
  if (br) {
    const low = Math.min(...Object.values(br.scores ?? {}));
    put('read', br.verdict === 'pass' && low >= 4, `pick ${br.pick} · lowest score ${low} · ${br.verdict}`);
  } else put('read', false, 'no blind read yet');

  // voice
  if (args.voice) {
    const beats = (lesson?.scenes ?? []).flatMap(sc => sc.beats ?? []);
    const missing = beats.filter(b => !b.audio || !b.timing || !fs.existsSync(path.join(ROOT, 'public', b.audio)) || !fs.existsSync(path.join(ROOT, 'public', b.timing)));
    const asr = rd(`data/clip-runs/${slug}/asr.json`);
    const worst = asr?.worst ?? null;
    put('voice', missing.length === 0 && worst !== null && worst >= 0.85,
      `${beats.length - missing.length}/${beats.length} beats voiced + timed · speech round trip worst ${worst === null ? 'not run' : Math.round(worst * 100) + ' %'}`);
  }

  // look (+ cues measured in the browser)
  const lk = rd(`data/clip-runs/${slug}/look.json`);
  if (lk) put('look', lk.pass, `${lk.actions.fired}/${lk.actions.expected} actions on the voice · cues worst ${lk.cue.worst.toFixed(2)} s (gate ${lk.cue.gateS} s) · look problems ${lk.look.problems}`);
  else put('look', false, 'not looked at yet (scripts/clips/look.mjs)');

  out.pass = Object.values(out.checks).every(c => c.ok);
  failed ||= !out.pass;
  fs.mkdirSync(path.join(ROOT, 'data/clip-runs', slug), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data/clip-runs', slug, 'gate.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`${out.pass ? '✓' : '✗'} ${slug}`);
  for (const [k, c] of Object.entries(out.checks)) console.log(`    ${c.ok ? '✓' : '✗'} ${k.padEnd(5)} ${c.detail}`);
}
void execFileSync;
process.exit(failed ? 1 : 0);
