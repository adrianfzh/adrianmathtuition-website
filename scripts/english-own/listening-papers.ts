#!/usr/bin/env node
// Make listening papers from a session (the same checks as the worker's door,
// /api/agent/listening-papers). SPEC-ENGLISH-ORAL-LISTENING.md §More papers.
//
//   npx tsx scripts/english-own/listening-papers.ts brief <level> > brief.txt     the writer's brief
//   npx tsx scripts/english-own/listening-papers.ts prompts <draft.json>          mechanical problems + writes
//                                                    <draft>.blind.txt / .review.txt / .guess.txt
//   npx tsx scripts/english-own/listening-papers.ts save <draft.json> <blind.json> <review.json> <guess.json>
//                                                    every check (+ the copy check against the language bank) → the table
//   npx tsx scripts/english-own/listening-papers.ts voice <lp001> --yes           record it (MiniMax money) → ready
//   npx tsx scripts/english-own/listening-papers.ts list | stock | retire
// Reads .env.local of the main checkout (~/dev/adrianmathtuition-website), then this folder's.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const dir of [path.join(process.env.HOME ?? '', 'dev/adrianmathtuition-website'), path.resolve(HERE, '../..')]) {
  try { const env = dotenv.parse(fs.readFileSync(path.join(dir, '.env.local'))); for (const [k, v] of Object.entries(env)) process.env[k] ??= v.trim(); } catch { /* next */ }
}

import type { ListeningPaper } from '../../src/lib/english-listening-papers';

async function main() {
  const P = await import('../../src/lib/english-listening-papers');
  const S = await import('../../src/lib/english-listening-store');
  const { LISTENING_SETS } = await import('../../src/lib/english-speaking-data');
  const dict = fs.existsSync('/usr/share/dict/words') ? P.wordList(fs.readFileSync('/usr/share/dict/words', 'utf8')) : undefined;
  const readJson = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^```(?:json)?\s*|\s*```\s*$/g, ''));
  const asDraft = (f: string): ListeningPaper => {
    const j = readJson(f);
    return { id: 'lp000', level: j.level, parts: (j.parts ?? []).map((s: object, i: number) => ({ ...s, id: `lp000-${i + 1}`, kind: 'listening' })) };
  };

  async function bankTexts(): Promise<string[]> {
    const { getSupabaseAdmin } = await import('../../src/lib/supabase');
    const out: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getSupabaseAdmin().from('language_texts').select('text').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) if (r.text) out.push(String(r.text));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
  if (cmd === 'brief') {
    if (!P.isListeningLevel(a1)) throw new Error('level: easier | standard | harder');
    const used = [...LISTENING_SETS.map(s => s.title)];
    for (const r of await S.paperList()) if (r.status !== 'rejected') { const row = await S.loadPaperRow(r.id); for (const s of row?.paper.parts ?? []) used.push(s.title); }
    console.log(P.writerPrompt(a1, LISTENING_SETS.find(s => s.id === 'ls02')!, used));
  } else if (cmd === 'prompts') {
    const d = asDraft(a1);
    const problems = P.paperProblems(d, { dict });
    console.log(problems.length ? problems.join('\n') : 'no problems');
    const base = a1.replace(/\.json$/, '');
    fs.writeFileSync(`${base}.blind.txt`, P.blindPrompt(d));
    fs.writeFileSync(`${base}.review.txt`, P.reviewPrompt(d));
    fs.writeFileSync(`${base}.guess.txt`, P.guessPrompt(d));
    process.exit(problems.length ? 1 : 0);
  } else if (cmd === 'save') {
    const d = asDraft(a1);
    const guess = readJson(a4);
    const r = await S.savePaper(d, readJson(a2), readJson(a3), { by: 'session', madeBy: 'session', dict, bank: await bankTexts(), guessed: P.guessScore(d, guess) });
    console.log(JSON.stringify(r, null, 1));
  } else if (cmd === 'voice') {
    if (!process.argv.includes('--yes')) throw new Error('voice costs MiniMax money: add --yes once Adrian has agreed');
    const row = await S.loadPaperRow(a1);
    if (!row || row.status !== 'checked') throw new Error(`${a1} is ${row?.status ?? 'missing'}, not checked`);
    const { voicePart } = await import('../../src/lib/english-listening-voice');
    const audio: Record<string, { key: string; seconds: number; chars: number }> = {};
    for (const s of row.paper.parts) { audio[s.id] = await voicePart(s, row.level); console.log(s.id, audio[s.id]); }
    await S.setPaperStatus(a1, 'ready', { audio, ready_at: new Date().toISOString() });
    console.log(`${a1} ready`);
  } else if (cmd === 'list') {
    for (const r of await S.paperList()) console.log(r.id, r.level, r.status, r.made_by, (r.checks?.problems ?? []).slice(0, 3).join(' | '));
  } else if (cmd === 'stock') {
    console.log(JSON.stringify(await S.listeningStock(), null, 1));
  } else if (cmd === 'retire') {
    console.log(JSON.stringify(await S.retireWeakPapers(), null, 1));
  } else {
    console.error('brief | prompts | save | voice | list | stock | retire');
    process.exit(2);
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
