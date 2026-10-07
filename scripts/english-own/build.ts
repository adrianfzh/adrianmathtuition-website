#!/usr/bin/env node
// Our own English sets: check every file in data/english/sets/ and merge them into
// data/english/own-sets.json, which the app reads (lib/english-own-data.ts).
//
//   npx tsx scripts/english-own/build.ts            check + write
//   npx tsx scripts/english-own/build.ts --check    check only (exit 1 on any problem)
//
// A set with a problem stops the build — nothing half-right reaches the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownProblems, type OwnSet } from '../../src/lib/english-own';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data/english/sets');
const OUT = path.join(ROOT, 'data/english/own-sets.json');

export function readSets(): { sets: OwnSet[]; problems: string[] } {
  const problems: string[] = [];
  const sets: OwnSet[] = [];
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json')).sort()) {
    let s: OwnSet;
    try { s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { problems.push(`${f}: not JSON (${e instanceof Error ? e.message : e})`); continue; }
    if (s.id + '.json' !== f) problems.push(`${f}: the file is named after its id`);
    for (const p of ownProblems(s)) problems.push(`${f}: ${p}`);
    sets.push(s);
  }
  return { sets, problems };
}

export const merged = (sets: OwnSet[]): string => JSON.stringify({ sets }, null, 1) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = readSets();
  // --sets ed03,ed04 — a writer checks only its own files while others are still writing theirs
  const i = process.argv.indexOf('--sets');
  const only = i >= 0 ? process.argv[i + 1].split(',') : null;
  const sets = only ? all.sets.filter(s => only.includes(s.id)) : all.sets;
  const problems = only ? all.problems.filter(p => only.some(id => p.startsWith(id + '.json'))) : all.problems;
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const count = (k: string) => sets.filter(s => s.kind === k).length;
  console.log(`${sets.length} sets fit: editing ${count('editing')} · visual ${count('visual')} · narrative ${count('narrative')} · non-narrative ${count('non_narrative')}`);
  if (!process.argv.includes('--check') && !only) { fs.writeFileSync(OUT, merged(sets)); console.log('wrote data/english/own-sets.json'); }
}
