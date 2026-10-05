// Backfill the extraction hand-off over every past hand-in (Adrian, 5 Oct 2026:
// "start to extract papers previously uploaded that we don't already have in the
// question bank too"). The same sweep the extraction-inbox cron runs on recent
// runs (lib/handin-extraction-store.ts), over ALL paper_marking_runs.
//
//   npx tsx scripts/handin-extraction-backfill.ts            # dry: what would happen
//   npx tsx scripts/handin-extraction-backfill.ts --go       # queue them (stamps the queued runs)
//   … --go --stamp                                          # also stamp every skipped run
// --go also sends Adrian ONE Telegram line about school short forms nobody could place.
//   … --json                                                  # the items as JSON
//
// Reads .env.local (SUPABASE_URL / SUPABASE_SECRET_KEY, the science pair for the index).
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.local')));
for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL_SCIENCE', 'SUPABASE_SERVICE_KEY_SCIENCE', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) {
  if (env[k] && !process.env[k]) process.env[k] = String(env[k]).trim();
}
const flag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const { sweepHandoffs } = await import('../src/lib/handin-extraction-store');
  const go = flag('go');
  // The printed-page readings cost a model call each: a dry run keeps them in a file
  // so the --go run that follows reads nothing twice.
  const os = await import('node:os');
  const cacheFile = path.join(os.tmpdir(), 'handin-extraction-readings.json');
  const cache = new Map<string, unknown>(fs.existsSync(cacheFile) ? Object.entries(JSON.parse(fs.readFileSync(cacheFile, 'utf8'))) : []);
  const res = await sweepHandoffs({
    dry: !go, stampSkips: go && flag('stamp'), restamp: flag('restamp'), askAdrian: go,
    readingCache: cache as Map<string, never>,
  });
  fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache), null, 1));
  console.log(`printed-page reads this run: ${res.reads} (cache ${cacheFile})${res.asked.length ? ` · asked Adrian about: ${res.asked.join(', ')}` : ''}`);
  if (flag('json')) { console.log(JSON.stringify(res, null, 2)); return; }
  console.log(`${go ? 'DONE' : 'DRY RUN'} — runs checked: ${res.checked}`);
  console.log(res.summary);
  const order = ['queued', 'failed', 'already-queued', 'duplicate-handin', 'in-bank', 'too-few-printed-pages', 'no-printed-pages', 'unknown-paper', 'own-sheet', 'not-marked', 'superseded'];
  for (const a of order) {
    const xs = res.items.filter(i => i.action === a);
    if (!xs.length) continue;
    console.log(`\n## ${a} (${xs.length})`);
    for (const i of xs) console.log(`  ${String(i.created || '').slice(0, 10)}  ${(i.paper || '').slice(0, 48).padEnd(48)}  ${i.file ? `→ ${i.file}  ` : ''}${i.detail}${i.from === 'print' ? ' [named from print]' : ''}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
