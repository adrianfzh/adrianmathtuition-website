// scripts/notebook-mistakes-backfill.ts — seed notebook_mistakes (SPEC-PORTAL-V2
// §6) from the papers released in the last N days, in release order, through the
// same entriesFromRun / foldObservations the release hook uses.
//
//   npx tsx scripts/notebook-mistakes-backfill.ts                 # DRY RUN — prints what it would write
//   npx tsx scripts/notebook-mistakes-backfill.ts --apply         # writes
//   npx tsx scripts/notebook-mistakes-backfill.ts --days 90       # window (default 60)
//   npx tsx scripts/notebook-mistakes-backfill.ts --student rec…  # one student only
//
// Safe to re-run: every observation carries the run id as its evidence ref and
// an entry that already holds it ignores it, so a second pass changes nothing.
// Reads .env.local for SUPABASE_URL + SUPABASE_SECRET_KEY (never the anon key —
// the table has RLS with no policies).
//
// Expect a thin seed on the first run: the marker only started stamping
// parts[].error_kind on 3 Sep 2026 and no released run carries a sheet
// diagnosis yet (the six that do are unreleased) — older papers yield only
// clean-topic results, which never create an entry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { entriesFromRun, foldObservations, type MistakeEntry } from '../src/lib/notebook-mistakes';
import { applyObservations, fetchMistakeRows, type MistakeRow } from '../src/lib/notebook-mistakes-store';
import { paperSubjectFromName } from '../src/lib/portal-subjects';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '..', '.env.local');
const env: Record<string, string> = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SECRET_KEY missing from .env.local'); process.exit(1); }

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (name: string) => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };
const DAYS = Math.max(1, Number(arg('--days') ?? 60) || 60);
const ONLY = arg('--student') ?? null;

const sb = createClient(url, key, { auth: { persistSession: false } });

type RunRow = { id: string; student_id: string; paper_name: string | null; paper_subject: string | null; released_at: string; result_json: unknown };

async function releasedRuns(): Promise<RunRow[]> {
  const cutoff = new Date(Date.now() - DAYS * 86400e3).toISOString();
  const rows: RunRow[] = [];
  for (let from = 0; ; from += 200) {
    let q = sb.from('paper_marking_runs')
      .select('id, student_id, paper_name, paper_subject, released_at, result_json')
      .not('released_at', 'is', null)
      .not('student_id', 'is', null)
      .gte('released_at', cutoff)
      .order('released_at', { ascending: true })
      .range(from, from + 199);
    if (ONLY) q = q.eq('student_id', ONLY);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as RunRow[]));
    if (!data || data.length < 200) break;
  }
  return rows;
}

function summarise(entries: MistakeEntry[]): string {
  return entries.map(e => `      ${e.state.padEnd(13)} seen ${e.seen_count} clean ${e.clean_count}${e.came_back ? ' came-back' : ''}  ${e.title}`).join('\n');
}

async function main() {
  const runs = await releasedRuns();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${runs.length} released run(s) in the last ${DAYS} day(s)${ONLY ? ` for ${ONLY}` : ''}\n`);

  const byStudent = new Map<string, RunRow[]>();
  for (const r of runs) {
    const list = byStudent.get(r.student_id) ?? [];
    list.push(r);
    byStudent.set(r.student_id, list);
  }

  let totalCreated = 0, totalUpdated = 0;
  for (const [sid, list] of byStudent) {
    console.log(`── ${sid} — ${list.length} paper(s)`);
    if (APPLY) {
      for (const run of list) {
        const subject = run.paper_subject?.trim() || paperSubjectFromName(run.paper_name) || null;
        const obs = entriesFromRun(run.result_json, run.id, run.released_at, { paperName: run.paper_name, subject });
        const r = await applyObservations(sb, sid, obs, new Date());
        totalCreated += r.created; totalUpdated += r.updated;
        console.log(`   ${run.released_at.slice(0, 10)}  ${(run.paper_name ?? 'Marked paper').slice(0, 48).padEnd(48)}  ${obs.length} obs → +${r.created} created, ${r.updated} updated`);
      }
      const after = await fetchMistakeRows(sb, sid);
      console.log(summarise(after));
    } else {
      // Fold in memory over what is stored today — the exact writes --apply would make.
      let rows: (MistakeRow | MistakeEntry)[] = await fetchMistakeRows(sb, sid);
      let created = 0, updated = 0;
      for (const run of list) {
        const subject = run.paper_subject?.trim() || paperSubjectFromName(run.paper_name) || null;
        const obs = entriesFromRun(run.result_json, run.id, run.released_at, { paperName: run.paper_name, subject });
        const fold = foldObservations(rows as MistakeRow[], obs, new Date(), sid);
        created += fold.created.length; updated += fold.updated.length;
        rows = fold.all;
        const mistakes = obs.filter(o => o.kind === 'mistake').length;
        console.log(`   ${run.released_at.slice(0, 10)}  ${(run.paper_name ?? 'Marked paper').slice(0, 48).padEnd(48)}  ${mistakes} mistake obs, ${obs.length - mistakes} clean obs → +${fold.created.length} created, ${fold.updated.length} updated`);
      }
      totalCreated += created; totalUpdated += updated;
      if (rows.length) console.log(summarise(rows));
    }
    console.log('');
  }
  console.log(`${APPLY ? 'wrote' : 'would write'}: ${totalCreated} new entr${totalCreated === 1 ? 'y' : 'ies'}, ${totalUpdated} update(s) across ${byStudent.size} student(s)`);
  if (!APPLY) console.log('re-run with --apply to write');
}

main().catch(e => { console.error(e); process.exit(1); });
