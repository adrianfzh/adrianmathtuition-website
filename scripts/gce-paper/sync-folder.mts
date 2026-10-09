// scripts/gce-paper/sync-folder.mts — the bank's Set papers → Dropbox › Apps ›
// AdrianMathNotes › School Papers, under the names already there
// (AdrianMath-AM-Set1-Paper1.pdf …; H2 also -solutions.pdf). Rule: src/lib/sets-dropbox.ts.
//
//   npx tsx scripts/gce-paper/sync-folder.mts            only the papers that changed
//   npx tsx scripts/gce-paper/sync-folder.mts --force    every paper
//   npx tsx scripts/gce-paper/sync-folder.mts --dry      say what would be printed
//
// The PDF is printed by the live site's own Print route (the bank page's button), so
// the file is exactly what the bank holds now. publish.mjs runs this after a publish.
// On a machine without the Dropbox folder (the Fly worker, a cloud session) it says so
// and exits 0.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import { SETS_FOLDER, SETS_MANIFEST, SETS_SYNC_COLUMNS, groupSetRows, paperKey, setFileBase, syncSets, type SetSyncRow, type SetsManifest } from '../../src/lib/sets-dropbox';
import { SET_EXAM_TYPE_LIKE, SET_SCHOOL } from '../../src/lib/print-sets';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://www.adrianmathtuition.com';
const force = process.argv.includes('--force'), dry = process.argv.includes('--dry');
const folder = join(homedir(), 'Dropbox', SETS_FOLDER);
if (!existsSync(folder)) { console.log(`sync-folder: ${folder} is not on this machine — nothing to do`); process.exit(0); }

const env: Record<string, string | undefined> = { ...(existsSync(join(ROOT, '.env.local')) ? parse(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}), ...process.env };
const need = (k: string) => { const v = (env[k] ?? '').trim(); if (!v) { console.error(`sync-folder: ${k} missing`); process.exit(2); } return v; };
const sb = createClient(need('SUPABASE_URL'), (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim() || need('SUPABASE_SECRET_KEY'));
const admin = need('ADMIN_PASSWORD');
const manifestPath = join(folder, SETS_MANIFEST);

const loadRows = async () => {
  const { data, error } = await sb.from('questions').select(SETS_SYNC_COLUMNS).eq('school', SET_SCHOOL).like('exam_type', SET_EXAM_TYPE_LIKE).is('deleted_at', null).limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SetSyncRow[];
};
const readManifest = async () => (existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as SetsManifest : null);

if (dry) {
  const m = (await readManifest()) ?? {};
  for (const p of groupSetRows(await loadRows())) {
    const base = setFileBase(p.level, p.set, p.paper);
    console.log(`${force || m[base]?.key !== paperKey(p) ? 'PRINT    ' : 'unchanged'} ${base}.pdf  (${p.rows.length} questions)`);
  }
  process.exit(0);
}

const r = await syncSets({
  loadRows, readManifest, force,
  writeManifest: async (m) => { writeFileSync(manifestPath, JSON.stringify(m, null, 1) + '\n'); },
  print: async (p, o) => {
    const res = await fetch(`${SITE}/api/admin/questions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` },
      body: JSON.stringify({ action: 'paper-pdf', school: SET_SCHOOL, year: p.year, level: p.level, paper: p.paper, examType: `Set ${p.set}`, title: o.title, solutions: o.solutions }),
    });
    const j = await res.json().catch(() => ({})) as { url?: string; error?: string; count?: number };
    if (!res.ok || !j.url) throw new Error(j.error || `print ${res.status}`);
    if (j.count !== p.rows.length) throw new Error(`the site printed ${j.count} questions, the bank has ${p.rows.length}`);
    const f = await fetch(j.url);
    if (!f.ok) throw new Error(`download ${f.status}`);
    return Buffer.from(await f.arrayBuffer());
  },
  pageCount: async (pdf) => (await PDFDocument.load(pdf)).getPageCount(),
  pagesAfter: async (pdf, n) => {
    const src = await PDFDocument.load(pdf), out = await PDFDocument.create();
    const idx = src.getPageIndices().filter((i) => i >= n);
    if (!idx.length) throw new Error('no solutions pages came back');
    (await out.copyPages(src, idx)).forEach((pg) => out.addPage(pg));
    out.setTitle(`${src.getTitle() ?? ''} — worked solutions`.trim());
    return Buffer.from(await out.save());
  },
  save: async (name, pdf) => { writeFileSync(join(folder, name), pdf); console.log(`  wrote ${name} (${Math.round(pdf.length / 1024)} KB)`); },
});
console.log(`sync-folder: ${r.papers} papers in the bank · ${r.written.length} files written · ${r.unchanged} unchanged${r.failed.length ? ` · FAILED ${r.failed.map((f) => `${f.name}: ${f.error}`).join('; ')}` : ''}`);
process.exit(r.failed.length ? 1 : 0);
