// The extracted-papers index, for sessions and agents (5 Oct 2026). Before
// extracting, staging or hunting for a paper, ask this what the banks already
// have — it is the same list /admin/library shows (lib/paper-index.ts).
//
//   npx tsx scripts/library-index.ts --summary
//   npx tsx scripts/library-index.ts --subject "E Math" --from 2023 --to 2025
//   npx tsx scripts/library-index.ts --status decision --notes
//   npx tsx scripts/library-index.ts --q "bedok south 2024"
//   npx tsx scripts/library-index.ts --subject Physics --status banked-any --json
//
// Flags: --subject <E Math|A Math|H2 Math|H1 Math|Lower Sec Math|Physics|Chemistry|Biology|…>
//        --level <"Sec 4 Express"|"Combined Science"|…>  --from <year> --to <year>
//        --status <banked|older|banked-any|queue|working|decision|hold|skipped>
//        --q <words>   --summary (counts only)   --notes (the workers' notes under each paper)
//        --json (the lines as JSON)   --limit <n> (default 400 lines of text)
// Reads .env.local (SUPABASE_URL / SUPABASE_SECRET_KEY, and the science pair).
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.local')));
for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL_SCIENCE', 'SUPABASE_SERVICE_KEY_SCIENCE']) {
  if (env[k] && !process.env[k]) process.env[k] = String(env[k]).trim();
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? '');
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const { loadPaperIndex, loadPaperNotes } = await import('../src/lib/paper-index-store');
  const { filterLines, groupLines, summarise, summaryLine, statusText, bankText, noteLines } = await import('../src/lib/paper-index');
  const idx = await loadPaperIndex(true);
  for (const w of idx.warnings) console.error(`! ${w}`);
  const lines = filterLines(idx.lines, {
    subject: arg('subject') || undefined,
    level: arg('level') || undefined,
    yearFrom: arg('from') ? Number(arg('from')) : null,
    yearTo: arg('to') ? Number(arg('to')) : null,
    status: (arg('status') || '') as never,
    q: arg('q') || '',
  });
  if (flag('json')) { console.log(JSON.stringify(lines, null, 1)); return; }
  for (const s of summarise(lines)) console.log(summaryLine(s) + ` (${s.questions} questions)`);
  if (flag('summary')) return;
  const limit = Number(arg('limit') || 400);
  let shown = 0;
  for (const g of groupLines(lines)) {
    console.log(`\n# ${g.subject} (${g.count})`);
    for (const lv of g.levels) {
      console.log(`\n## ${lv.level} (${lv.count})`);
      for (const y of lv.years) {
        console.log(`  ${y.year ?? 'no year'}`);
        for (const l of y.lines) {
          if (shown++ >= limit) { console.log(`\n… ${lines.length - limit} more — narrow with --subject / --from / --q, or raise --limit`); return; }
          const files = [l.file ? 'file kept' : '', l.scheme ? 'scheme kept' : ''].filter(Boolean).join(', ');
          const bt = bankText(l);
          console.log(`    ${l.name} — ${statusText(l)}${bt ? ` · ${bt}` : ''}${files ? ` · ${files}` : ''}`);
          if (flag('notes') && l.sourceIds.length) {
            for (const n of await loadPaperNotes(l.sourceIds)) {
              for (const t of noteLines(n.notes)) console.log(`        · ${t}`);
            }
          }
        }
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
