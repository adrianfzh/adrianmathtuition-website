// ▶ Watch it — check authored specs against their questions.
//
//   npx tsx scripts/watch-it/check.ts <out.json> [more.json …]
//
// Each file is { "<qid>": WatchSpec | { "skip": "<reason>" } }. Every spec goes
// through lib/watch-it checkWatchSpec against the bank row in work/source.json
// (written by candidates.ts): the answer letter, the option's value, every
// number on the board / in a spoken line / on the graph traced to the question,
// the solution or arithmetic re-done here, and the built script validated.
// Exit 1 when any spec fails — fix and re-run until clean.
import fs from 'node:fs';
import path from 'node:path';
import { checkWatchSpec, type WatchSpec } from '../../src/lib/watch-it';

const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'work', 'source.json'), 'utf8')) as Record<string, { question_text: string; solution: string | null; answer: string | null; image?: string | null }>;
let bad = 0, ok = 0, skip = 0;
for (const file of process.argv.slice(2)) {
  const specs = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, WatchSpec | { skip: string }>;
  for (const [qid, spec] of Object.entries(specs)) {
    if ('skip' in spec) { skip++; continue; }
    const src = source[qid];
    if (!src) { console.log(`✗ ${qid}: not in work/source.json`); bad++; continue; }
    if (spec.qid !== qid) { console.log(`✗ ${qid}: spec.qid is ${spec.qid}`); bad++; continue; }
    let errors: string[];
    try { errors = checkWatchSpec(spec, src); } catch (e) { errors = [`threw: ${(e as Error).message}`]; }
    if (errors.length) { bad++; console.log(`✗ ${qid}\n  - ${errors.join('\n  - ')}`); } else ok++;
  }
}
console.log(`\n${ok} pass · ${bad} fail · ${skip} skipped`);
process.exit(bad ? 1 : 0);
