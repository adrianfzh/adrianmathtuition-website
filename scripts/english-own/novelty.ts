#!/usr/bin/env node
// Is every word of our own English sets ours? (docs/CONTENT-POLICY.md: the language bank
// guides the shape; nothing is copied or lightly reworded.)
//
//   npx tsx scripts/english-own/novelty.ts [--sets na01,nn01]
//
// Reads the language bank (service key, this machine only) and, for each own set, counts
// the runs of words it shares with ANY banked passage, visual text or question:
//   • the set's own text (passage / visual text / editing lines): no run of 8 words shared,
//     and under 2 % of its 5-word runs shared;
//   • its questions: no run of 12 words shared (exam stock phrases are shorter than that).
// Exit 1 when a set fails — it is rewritten, never shipped. Prints nothing from the bank.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { isEditing, visualWords, type OwnSet } from '../../src/lib/english-own';
import { OWN_SETS } from '../../src/lib/english-own-data';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function env(name: string): string {
  if (process.env[name]) return process.env[name]!.trim();
  for (const dir of [path.join(process.env.HOME ?? '', 'dev/adrianmathtuition-website'), path.resolve(HERE, '../..')]) {   // the main checkout's file is the current one
    try {
      const line = fs.readFileSync(path.join(dir, '.env.local'), 'utf8').split('\n').find(l => l.startsWith(name + '='));
      const v = line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, '').replace(/\\n$/, '') : '';
      if (v) return v;
    } catch { /* next */ }
  }
  return '';
}
const toks = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const grams = (t: string[], n: number): string[] => { const out: string[] = []; for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n).join(' ')); return out; };

const ownText = (s: OwnSet): string => (isEditing(s) ? s.lines.map(l => l.text).join(' ') : s.kind === 'visual' ? visualWords(s.visual ?? []) : (s.paragraphs ?? []).join(' '));
const ownQuestions = (s: OwnSet): string => (isEditing(s) ? '' : s.questions.map(q => [q.stem, q.text, ...(q.options ?? []).map(o => o.text)].filter(Boolean).join(' ')).join(' . '));

async function main() {
  const i = process.argv.indexOf('--sets');
  const only = i >= 0 ? process.argv[i + 1].split(',') : null;
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const bank: string[] = [];
  for (const [table, cols] of [['language_texts', 'text,title'], ['language_items', 'question_text,parts,options']] as const) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) bank.push(JSON.stringify(Object.values(r)));
      if (!data || data.length < 1000) break;
    }
  }
  const g5 = new Set<string>(), g8 = new Set<string>(), g12 = new Set<string>();
  for (const b of bank) { const t = toks(b); grams(t, 5).forEach(g => g5.add(g)); grams(t, 8).forEach(g => g8.add(g)); grams(t, 12).forEach(g => g12.add(g)); }
  console.log(`bank: ${bank.length} rows read`);
  let bad = 0;
  for (const s of OWN_SETS.filter(x => !only || only.includes(x.id))) {
    const t = toks(ownText(s));
    const five = grams(t, 5);
    const share5 = five.length ? five.filter(g => g5.has(g)).length / five.length : 0;
    const run8 = grams(t, 8).filter(g => g8.has(g)).length;
    const run12 = grams(toks(ownQuestions(s)), 12).filter(g => g12.has(g)).length;
    const ok = run8 === 0 && share5 < 0.02 && run12 === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ours ' : 'FAIL '} ${s.id}  5-word runs shared ${(share5 * 100).toFixed(1)}% · 8-word runs shared ${run8} · question 12-word runs shared ${run12}`);
  }
  process.exit(bad ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
