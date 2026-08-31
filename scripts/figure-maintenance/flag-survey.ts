// Survey the open figure_flags queue: what is wrong, and is the source paper
// still on disk to re-extract from? Read-only.
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const ROOTS = [
  '/Users/adrianfong/Desktop/AdrianMath/papers/processed',
  '/Users/adrianfong/Desktop/AdrianMath',
  '/Users/adrianfong/Desktop/AM Prelim 2022',
  '/Users/adrianfong/Desktop/AM Prelim 2023',
  "/Users/adrianfong/Desktop/Desktop - Adrian’s MacBook Pro",
  '/Users/adrianfong/Desktop/S1 Exam Papers',
  '/Users/adrianfong/Desktop/S2 Exam Papers',
];

(async () => {
  // one pass over disk, then match by basename
  const onDisk = new Map<string, string>();
  for (const root of ROOTS) {
    try {
      const out = execSync(
        `find ${JSON.stringify(root)} -maxdepth 4 \\( -name '*.pdf' -o -name '*.docx' \\) 2>/dev/null`,
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      for (const line of out.split('\n')) {
        const p = line.trim(); if (!p) continue;
        const base = p.slice(p.lastIndexOf('/') + 1);
        if (!onDisk.has(base)) onDisk.set(base, p);
      }
    } catch { /* root missing */ }
  }
  console.log(`indexed ${onDisk.size} source papers on disk\n`);

  const { data } = await supa.from('figure_flags').select('path, question_id').eq('status', 'open');
  const flags = data ?? [];
  const ids = [...new Set(flags.map(f => f.question_id as string))];
  const qs = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: qd } = await supa.from('questions')
      .select('id, source_file, school, year, level, paper, question_number')
      .in('id', ids.slice(i, i + 200));
    for (const q of qd ?? []) qs.set(q.id as string, q);
  }

  let haveSource = 0, noSource = 0, noRow = 0;
  const missing = new Map<string, number>();
  const extractDirs = new Set(execSync(
    `ls -d /Users/adrianfong/Desktop/AdrianMath/extract_* 2>/dev/null || true`, { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean));
  let haveCrops = 0;

  for (const f of flags) {
    const q = qs.get(f.question_id as string);
    if (!q) { noRow++; continue; }
    const sf = q.source_file as string | null;
    if (sf && onDisk.has(sf)) haveSource++;
    else { noSource++; if (sf) missing.set(sf, (missing.get(sf) ?? 0) + 1); }
  }
  // how many extraction folders still hold their crops
  for (const d of extractDirs) {
    try { if (execSync(`ls ${JSON.stringify(d)}/crops 2>/dev/null | head -1`, { encoding: 'utf8' }).trim()) haveCrops++; } catch {}
  }

  console.log(`open flags: ${flags.length}`);
  console.log(`  source paper still on disk : ${haveSource}  (${(100*haveSource/flags.length).toFixed(0)}%)`);
  console.log(`  source missing / unknown   : ${noSource}`);
  console.log(`  flag with no question row  : ${noRow}`);
  console.log(`\nextraction folders with crops still present: ${haveCrops} of ${extractDirs.size}`);
  const worst = [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (worst.length) { console.log('\nmost-flagged papers whose source is NOT on disk:');
    for (const [k, v] of worst) console.log(`  ${v}  ${k}`); }
})();
