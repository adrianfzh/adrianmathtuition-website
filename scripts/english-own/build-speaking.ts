#!/usr/bin/env node
// Our own listening and oral sets: check every file in data/english/listening/ and
// data/english/oral/ and merge them into data/english/speaking-sets.json, which the app reads
// (lib/english-speaking-data.ts). SPEC-ENGLISH-ORAL-LISTENING.md.
//
//   npx tsx scripts/english-own/build-speaking.ts            check + write
//   npx tsx scripts/english-own/build-speaking.ts --check    check only (exit 1 on any problem)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listeningProblems, type ListeningSet } from '../../src/lib/english-listening';
import { oralProblems, type OralSet } from '../../src/lib/english-oral';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'data/english/speaking-sets.json');

function readDir<T extends { id: string }>(dir: string, problemsOf: (s: T) => string[], problems: string[]): T[] {
  const full = path.join(ROOT, dir);
  const sets: T[] = [];
  for (const f of fs.readdirSync(full).filter(x => x.endsWith('.json')).sort()) {
    let s: T;
    try { s = JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')); } catch (e) { problems.push(`${f}: not JSON (${e instanceof Error ? e.message : e})`); continue; }
    if (s.id + '.json' !== f) problems.push(`${f}: the file is named after its id`);
    for (const p of problemsOf(s)) problems.push(`${f}: ${p}`);
    sets.push(s);
  }
  return sets;
}

export function readSpeaking(): { listening: ListeningSet[]; oral: OralSet[]; problems: string[] } {
  const problems: string[] = [];
  const listening = readDir<ListeningSet>('data/english/listening', listeningProblems, problems);
  const oral = readDir<OralSet>('data/english/oral', oralProblems, problems);
  return { listening, oral, problems };
}

export const mergedSpeaking = (listening: ListeningSet[], oral: OralSet[]): string => JSON.stringify({ listening, oral }, null, 1) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { listening, oral, problems } = readSpeaking();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`${listening.length} listening sets and ${oral.length} oral sets fit`);
  if (!process.argv.includes('--check')) { fs.writeFileSync(OUT, mergedSpeaking(listening, oral)); console.log('wrote data/english/speaking-sets.json'); }
}
