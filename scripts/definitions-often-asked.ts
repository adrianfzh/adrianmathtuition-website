// ⭐ "Often asked" — count how many science-bank questions ask for each term on
// the definitions lists (14 Oct 2026, Adrian: "#1 > do it"). One-off: it PRINTS
// the counts and the terms that earn a star; the stars are then committed as
// `often: true` in the data files (lib/science-definitions.ts,
// lib/biology-definitions.ts, lib/chemistry-definitions.ts). No live query on
// the page.
//
//   npx tsx scripts/definitions-often-asked.ts            # counts + starred ids
//   npx tsx scripts/definitions-often-asked.ts --json     # { subject: { id: n } }
//
// Rule: a term earns ⭐ when at least MIN_ASKS questions ask for it, keeping
// at most TOP_N per subject (the most asked). A question counts once per term.
// Reads SUPABASE_URL_SCIENCE + SUPABASE_SERVICE_KEY_SCIENCE from .env.local.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { DEFINITIONS, type Definition } from '../src/lib/science-definitions';
import { BIOLOGY_DEFINITIONS } from '../src/lib/biology-definitions';
import { CHEMISTRY_DEFINITIONS } from '../src/lib/chemistry-definitions';
import { askedTerms } from '../src/lib/definition-asks';

export const MIN_ASKS = 3;
export const TOP_N = 20;

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

function env(name: string): string {
  if (process.env[name]) return process.env[name]!.trim();
  for (const path of ['.env.local', `${process.env.HOME}/dev/adrianmathtuition-website/.env.local`]) {
    try {
      const line = readFileSync(path, 'utf8').split('\n').find(l => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim().replace(/^"|"$/g, '').replace(/\\n$/, '').trim();
    } catch { /* next */ }
  }
  throw new Error(`${name} missing`);
}

const LISTS: Record<string, readonly Definition[]> = { physics: DEFINITIONS, biology: BIOLOGY_DEFINITIONS, chemistry: CHEMISTRY_DEFINITIONS };
const LEAD_RE = /meant by|define|meaning of|definition of|understand by/i;

type Part = { text?: unknown; subparts?: unknown };
function partTexts(parts: unknown): string[] {
  if (!Array.isArray(parts)) return [];
  return (parts as Part[]).flatMap(p => [String(p?.text ?? ''), ...partTexts(p?.subparts)]);
}

async function main() {
  const sb = createClient(env('SUPABASE_URL_SCIENCE'), env('SUPABASE_SERVICE_KEY_SCIENCE'), { auth: { persistSession: false } });
  const result: Record<string, Record<string, number>> = {};
  for (const [subject, list] of Object.entries(LISTS)) {
    // The question's own words: the stem plus every part and sub-part's text
    // (never the scheme). Most structured questions keep their parts in `parts`.
    const rows = new Map<string, string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('questions').select('id, question_text, parts')
        .eq('subject', subject).or('quarantined.is.null,quarantined.eq.false')
        .order('id').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const text = [String(r.question_text ?? ''), ...partTexts(r.parts)].join('\n');
        if (LEAD_RE.test(text)) rows.set(String(r.id), text);
      }
      if (!data || data.length < 1000) break;
    }
    const counts: Record<string, number> = {};
    for (const text of rows.values()) for (const d of askedTerms(text, list)) counts[d.id] = (counts[d.id] ?? 0) + 1;
    result[subject] = counts;
    if (!process.argv.includes('--json')) {
      const ranked = list.map(d => ({ d, n: counts[d.id] ?? 0 })).sort((a, b) => b.n - a.n);
      const starred = ranked.filter(x => x.n >= MIN_ASKS).slice(0, TOP_N);
      console.log(`\n${subject}: ${rows.size} questions with a define-type lead; ${starred.length} of ${list.length} terms starred (≥ ${MIN_ASKS}, top ${TOP_N})`);
      for (const x of ranked) if (x.n) console.log(`  ${x.n >= MIN_ASKS && starred.includes(x) ? '⭐' : '  '} ${String(x.n).padStart(3)}  ${x.d.term}  [${x.d.id}]`);
    }
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
