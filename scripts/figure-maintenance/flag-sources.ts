// For every OPEN figure flag: is the original crop still on disk?
//
// The 2026-08-31 Q3 fix came from extract_gce_em_2022_p2/crops/q3.png — an
// extraction folder still holding the crop that was ingested. That is the
// cheapest possible repair: no vision, no re-cropping, just the file that was
// there all along. This measures how far that route reaches. Read-only.
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';

const ROOT = '/Users/adrianfong/Desktop/AdrianMath';
const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

/** "EM S4 PRELIM (NA) 2021 Fuhua.pdf" → tokens to match a folder name on. */
const tokens = (s: string) =>
  s.toLowerCase().replace(/\.(pdf|docx)$/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(t => t.length > 2);

(async () => {
  const dirs = execSync(`ls -d ${ROOT}/extract_* 2>/dev/null || true`, { encoding: 'utf8' })
    .split('\n').map(s => s.trim()).filter(Boolean)
    .map(d => ({ dir: d, name: d.slice(d.lastIndexOf('/') + 1).toLowerCase(), crops: existsSync(`${d}/crops`) ? readdirSync(`${d}/crops`) : [] }))
    .filter(d => d.crops.length);
  console.log(`extraction folders still holding crops: ${dirs.length}`);

  const { data: flags } = await supa.from('figure_flags').select('path, question_id').eq('status', 'open').eq('kind', 'question');
  const ids = [...new Set((flags ?? []).map(f => f.question_id as string))];
  const qs = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supa.from('questions')
      .select('id, source_file, school, year, level, paper, question_number')
      .in('id', ids.slice(i, i + 200));
    for (const q of data ?? []) qs.set(q.id as string, q);
  }

  let withFolder = 0, withCrop = 0, none = 0;
  const hits: string[] = [];
  const byPaper = new Map<string, number>();
  for (const f of flags ?? []) {
    const q = qs.get(f.question_id as string);
    if (!q) { none++; continue; }
    const sf = (q.source_file as string) ?? '';
    const tk = tokens(sf);
    // a folder matching most of the source-file tokens
    const folder = dirs.find(d => tk.length > 2 && tk.filter(t => d.name.includes(t)).length >= Math.max(2, tk.length - 2));
    if (!folder) { none++; continue; }
    withFolder++;
    const qn = String(q.question_number ?? '').toLowerCase();
    const crop = folder.crops.find(c => new RegExp(`^q${qn}([a-z]|main|\\.)`, 'i').test(c));
    if (crop) {
      withCrop++;
      if (hits.length < 12) hits.push(`${q.school} ${q.year} ${q.level} Q${qn} -> ${folder.name}/crops/${crop}`);
      byPaper.set(folder.name, (byPaper.get(folder.name) ?? 0) + 1);
    }
  }
  console.log(`\nopen flags: ${flags?.length ?? 0}`);
  console.log(`  paper has an extraction folder with crops : ${withFolder}`);
  console.log(`  and a crop file matching the question num : ${withCrop}`);
  console.log(`  no folder / no match                      : ${none}`);
  if (hits.length) console.log('\nexamples:\n  ' + hits.join('\n  '));
  const top = [...byPaper.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) console.log('\nbest papers to work first:\n  ' + top.map(([k, v]) => `${v}  ${k}`).join('\n  '));
})();
