#!/usr/bin/env node
// scripts/shorts/check.mjs — the checks a "common trap" Short must pass BEFORE any voice money
// is spent (SPEC-CLIP-PIPELINE.md §10). No model, seconds.
//
//   node scripts/shorts/check.mjs                 every data/shorts/*.json
//   node scripts/shorts/check.mjs trap-hcf-cubes  one
//
// 1 Shape   hook → pause → wrong → why → right… → end; every working line shown exactly once,
//           in order; exactly one answer line; figure only where the script has one.
// 2 Words   ≤ 150 spoken words; house voice rules (data/clip-bibles/_house.md §2–§5).
// 3 Red lines  no model names / "AI", no school or paper names, nothing about how we use
//           students' work (Adrian, 5 Nov 2026: competitors must not learn the business logic).
// 4 Maths   the script's own sympy block runs and every assert holds (/usr/bin/python3 + sympy).
// 5 Draws   every formula renders in KaTeX with throwOnError.
// Exit 1 on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import katex from 'katex';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data/shorts');
const MAX_WORDS = 150;
const PY = fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3';

const BANNED = [
  [/\b(AI|A\.I\.|Claude|Opus|Sonnet|Haiku|Fable|Gemini|MiniMax|GPT|chatbot)\b/i, 'names a model / AI'],
  [/\b(data|dataset|marking|marker|marked|tracked?|analytics|algorithm|question bank|our students|students' (work|papers|scripts))\b/i, 'talks about how we use students\' work (internal)'],
  [/\b(prelim|SEAB|GCE|O-?level paper|school|secondary school|junior college|institution)\b/i, 'names a paper or a school'],
  [/\b(RI|RJC|HCI|ACJC|ACSI?|NYJC|VJC|TJC|SAJC|CJC|DHS|MJC|EJC|NJC|JJC|PJC|YIJC|SRJC|IJC|ASRJC|CHIJ|SCGS|MGS|NYGH|RGS|SST|NUSH|RVHS|CCHMS|HCI|NJC|ACJC)\b/, 'names a school'],
  [/\b(kill|kills|fly|flies)\b/i, 'house rule: never "kill" / "fly" (say the maths)'],
  [/\b(Adrian)\b/, 'names Adrian (the brand site name is spoken as "adrian math tuition dot com" only)'],
];

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const slugs = files.length ? files : fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.replace(/\.json$/, ''));

/** Inline $…$ pieces of a question line. */
const inlineTex = (line) => line.split(/(?<!\\)\$/).filter((_, i) => i % 2 === 1);
const wordsOf = (t) => t.trim().split(/\s+/).filter(Boolean);

let failed = 0;
const report = [];
for (const slug of slugs) {
  const file = path.join(DIR, `${slug}.json`);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errs = [];
  const warn = [];

  // 1 Shape
  for (const k of ['slug', 'code', 'level', 'levelLabel', 'topic', 'hook', 'question', 'wrong', 'trap', 'steps', 'beats', 'verify', 'youtube']) if (s[k] === undefined) errs.push(`missing "${k}"`);
  if (s.slug !== slug) errs.push(`slug "${s.slug}" ≠ file name`);
  if (!/^[a-z0-9]{2,12}$/.test(s.code || '')) errs.push(`code "${s.code}" must be 2–12 lower-case letters/digits (it is the /s/<code> link)`);
  const parts = (s.beats || []).map(b => b.part);
  const order = parts.join(' ');
  if (!/^hook pause wrong why( right)+ end$/.test(order)) errs.push(`beats must run hook → pause → wrong → why → right… → end (got: ${order})`);
  const shown = (s.beats || []).flatMap(b => b.steps || []);
  const want = (s.steps || []).map((_, i) => i);
  if (JSON.stringify(shown) !== JSON.stringify(want)) errs.push(`every working line shown once, in order: shown ${JSON.stringify(shown)} vs ${JSON.stringify(want)}`);
  const answers = (s.steps || []).filter(x => x.answer).length;
  if (answers !== 1) errs.push(`exactly one answer line (got ${answers})`);
  const figBeats = (s.beats || []).filter(b => b.figure).length;
  if (s.figure && figBeats === 0) errs.push('figure never shown');
  if (!s.figure && figBeats > 0) errs.push('a beat shows a figure the script does not have');
  for (const [i, b] of (s.beats || []).entries()) {
    if (typeof b.say !== 'string' || !b.say.trim()) errs.push(`beat ${i + 1}: empty say`);
    for (const st of b.steps || []) {
      const on = s.steps[st]?.on;
      if (on && !b.say.toLowerCase().includes(on.toLowerCase())) errs.push(`beat ${i + 1}: line ${st + 1}'s cue word "${on}" is not in what the voice says`);
    }
  }
  if (!/^[a-z0-9]+$/.test(s.code || '') || !String(s.youtube?.link || '').endsWith(`/s/${s.code}`)) errs.push('youtube.link must end with /s/<code>');
  if (!s.youtube?.title || s.youtube.title.length > 100) errs.push('youtube.title missing or over 100 characters');
  if ((s.youtube?.hashtags || []).length < 3) errs.push('youtube.hashtags: at least 3');

  // 2 Words
  const spoken = (s.beats || []).map(b => b.say).join(' ');
  const nWords = wordsOf(spoken).length;
  if (nWords > MAX_WORDS) errs.push(`${nWords} spoken words (max ${MAX_WORDS} — a Short is under 60 s)`);
  if (!/^Most students get this wrong\./.test(s.beats?.[0]?.say || '')) errs.push('the first line is the hook: "Most students get this wrong."');
  if (!/adrian math tuition dot com/i.test(s.beats?.at(-1)?.say || '')) errs.push('the last line names the site');
  // Letters are capitals in the voice; "negative" for a negative number.
  if (/\bminus (one|two|three|four|five|six|seven|eight|nine|ten)\b(?! (C|X|K|A|B|fifteen|eight))/i.test(spoken.replace(/(\w+) minus/g, '$1 MINUSX'))) warn.push('"minus <number>" — the house voice says "negative" for a negative number');
  if (/\b(x|y|k|c|b|m)\b/.test(spoken)) warn.push('a lower-case single letter in the voice — letters are CAPITALS so the voice reads the letter');

  // 3 Red lines — voice, screen and the YouTube text.
  const screen = [s.hook, ...(s.question || []), s.wrong?.tex, s.wrong?.why, s.trap, ...(s.steps || []).map(x => x.tex), s.youtube?.title, s.youtube?.description].join(' \n ');
  const endSay = s.beats?.at(-1)?.say || '';
  for (const [re, why] of BANNED) {
    const hay = `${spoken.replace(endSay, '')}\n${screen}`;
    const m = hay.match(re);
    if (m) errs.push(`red line — ${why}: "${m[0]}"`);
  }

  // 4 Maths
  try {
    execFileSync(PY, ['-c', `from sympy import *\n${s.verify}\nprint("ok")`], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  } catch (e) {
    errs.push(`maths: the sympy block failed — ${String(e.stderr || e.message).trim().split('\n').slice(-2).join(' ')}`);
  }
  const asserts = (s.verify.match(/^\s*assert /gm) || []).length;
  if (asserts < 3) errs.push(`maths: only ${asserts} assert(s) — check the answer, the wrong answer and one more step`);

  // 5 Draws
  const texes = [...(s.question || []).flatMap(inlineTex), s.wrong?.tex, ...(s.steps || []).map(x => x.tex), ...(s.figure?.points || [])].filter(Boolean);
  for (const t of texes) {
    try { katex.renderToString(t, { throwOnError: true, strict: 'ignore' }); } catch (e) { errs.push(`KaTeX: ${e.message.split('\n')[0]} in ${t}`); }
  }

  const ok = errs.length === 0;
  if (!ok) failed++;
  report.push({ slug, ok, words: nWords, beats: parts.length, asserts, errs, warn });
  console.log(`${ok ? '✓' : '✗'} ${slug}  ·  ${nWords} words · ${parts.length} beats · ${asserts} maths asserts${warn.length ? ` · ⚠ ${warn.length}` : ''}`);
  for (const e of errs) console.log(`    ✗ ${e}`);
  for (const w of warn) console.log(`    ⚠ ${w}`);
}
const outDir = path.join(ROOT, 'out/shorts');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'check.json'), JSON.stringify(report, null, 2));
console.log(`\n${slugs.length - failed}/${slugs.length} passed.`);
process.exit(failed ? 1 : 0);
