#!/usr/bin/env node
// Clip pipeline — a writer checks its OWN draft against the lesson verifier before handing it in
// (SPEC-CLIP-PIPELINE.md §9). Puts the checked board and draft <X> together exactly as assemble.mjs
// does, into data/clip-runs/<slug>/check-<X>.json (the clip itself is not touched), and runs the
// verifier on it. Prints every error and warning; exit 0 = 0 errors, 0 warnings.
//
//   node scripts/clips/draft-check.mjs <slug> <A|B|C|…>
//   node scripts/clips/draft-check.mjs <slug> read     (the blind reader's pick WITH its fixed_beats)
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lessons/shared.mjs';

const [slug, key] = process.argv.slice(2);
if (!slug || !key) { console.error('usage: node scripts/clips/draft-check.mjs <slug> <draft key>'); process.exit(2); }
const out = `data/clip-runs/${slug}/check-${key}.json`;
const a = spawnSync('node', ['scripts/clips/assemble.mjs', slug, ...(key === 'read' ? [] : ['--draft', key]), '--out', out], { cwd: ROOT, encoding: 'utf8' });
if (a.status !== 0) { console.log(`✗ cannot assemble draft ${key}: ${(a.stdout + a.stderr).trim()}`); process.exit(1); }
const v = spawnSync('node', ['scripts/lessons/verify-lesson.mjs', out, '--json', '--offline'], { cwd: ROOT, encoding: 'utf8' });
let j; try { j = JSON.parse(v.stdout); } catch { console.log(`✗ verifier: ${(v.stdout + v.stderr).trim().slice(-500)}`); process.exit(1); }
const issues = (j.issues ?? []).filter(i => i.severity !== 'info' && !/must match the file name|file name/.test(i.message));
for (const i of issues) console.log(`✗ ${i.severity} ${i.where}: ${i.message}`);
console.log(issues.length ? `FIX ${issues.length} — then run this again` : `PASS — draft ${key}: 0 errors, 0 warnings`);
process.exit(issues.length ? 1 : 0);
