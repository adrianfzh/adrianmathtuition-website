// The paper bank's iCloud folder → the private 'paper-library' bucket, before the
// folder is retired (Adrian, 5 Oct 2026: "retire adrianmath > yes").
//
// Every exam source the Mac fleet ever processed sits in ~/Desktop/AdrianMath/papers
// (processed/, the flagged files at the root, needs_review/, the science staging
// folders). The bucket is the source of truth since 8 Sep 2026 (docs/EXTRACTION-QUEUE.md),
// so before the folder goes cold every file whose BYTES the library does not already
// hold (any paper_library row, any kind, by sha256) is uploaded and indexed as a
// `kind='source'`, `status='library'` row — in the library, never queued, never claimed.
// Same name with different bytes is kept as a new version (`-<sha8>`), never an overwrite.
//
//   npx tsx scripts/paper-library/archive-bank-folder.ts            # dry run: counts + the missing list
//   npx tsx scripts/paper-library/archive-bank-folder.ts --apply    # upload + insert the missing ones
//   … --dir <path>    the papers folder (default ~/Desktop/AdrianMath/papers)
//   … --json <file>   write the per-file result
//
// It never walks the whole iCloud folder (a recursive find there stalls): only the
// source folders below, three levels deep at most, and never an extract_* work folder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseSourceFilename, sourceKey, sourceStoragePath } from '../../src/lib/extraction-inbox';

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.env.local')));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const APPLY = process.argv.includes('--apply');
const DIR = arg('dir') || path.join(process.env.HOME || '', 'Desktop/AdrianMath/papers');
const JSON_OUT = arg('json');
const sb = createClient(String(env.SUPABASE_URL).trim(), String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY).trim(), { auth: { persistSession: false } });
const BUCKET = 'paper-library';
const TODAY = '5 Oct 2026';

// the folders that hold sources (root = the flagged / in-flight files)
const SOURCE_DIRS = ['', 'processed', 'needs_review', 'prefilter_duplicates', 'quarantine', '_bm_solutions', '_grail_solutions',
  'biology', 'chemistry', 'combined-science', 's1_science', 's2_science'];
const SKIP_DIR = /^(extract_|_tools$|pending_image_uploads$|_.*payloads$|_.*_work$|media$|\.)/;

type Found = { abs: string; rel: string; name: string; suffix: string };
function walk(rel: string, depth: number, out: Found[]) {
  const abs = path.join(DIR, rel);
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) {
      if (rel === '') continue;               // the root's folders are listed in SOURCE_DIRS
      if (depth < 3 && !SKIP_DIR.test(e.name)) walk(r, depth + 1, out);
      continue;
    }
    const m = e.name.match(/^(.+?\.(?:pdf|docx))((?:\.[A-Za-z_-]+)*)$/i);
    if (!m) continue;
    out.push({ abs: path.join(abs, e.name), rel: r, name: m[1], suffix: m[2] || '' });
  }
}

async function main() {
  const files: Found[] = [];
  for (const d of SOURCE_DIRS) walk(d, d ? 1 : 0, files);
  // what the library already holds
  const known = new Map<string, { key: string; status: string; kind: string }>();
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('paper_library').select('key,kind,status,sha256').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) { if (r.sha256) known.set(r.sha256, r); if (r.kind === 'source') keys.add(r.key); }
    if (!data || data.length < 1000) break;
  }

  const res: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let inLib = 0, dupLocal = 0, evicted = 0, unreadable = 0, uploaded = 0, failed = 0, wouldUpload = 0;
  for (const f of files) {
    if (/icloud_evicted|icloud-dup/i.test(f.suffix)) { evicted++; res.push({ file: f.rel, result: 'evicted' }); continue; }
    let buf: Buffer;
    try { buf = fs.readFileSync(f.abs); } catch (e) { unreadable++; res.push({ file: f.rel, result: 'unreadable', why: String((e as Error).message).slice(0, 80) }); continue; }
    if (!buf.length) { unreadable++; res.push({ file: f.rel, result: 'empty' }); continue; }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (known.has(sha)) { inLib++; res.push({ file: f.rel, result: 'in-library', key: known.get(sha)!.key }); continue; }
    if (seen.has(sha)) { dupLocal++; res.push({ file: f.rel, result: 'same-bytes-as-another-file-here' }); continue; }
    seen.add(sha);
    const parsed = parseSourceFilename(f.name);
    const sha8 = sha.slice(0, 8);
    let key = sourceKey(f.name);
    if (keys.has(key)) key = sourceKey(f.name, sha8);
    let storagePath = sourceStoragePath(parsed, f.name);
    if (key.endsWith(sha8)) storagePath = storagePath.replace(/(\.(pdf|docx))$/i, `-${sha8}$1`);
    if (!APPLY) { wouldUpload++; res.push({ file: f.rel, result: 'missing', key, storagePath, bytes: buf.length }); continue; }
    try {
      const ext = /\.pdf$/i.test(f.name) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      let up = await sb.storage.from(BUCKET).upload(storagePath, buf, { contentType: ext, upsert: false });
      if (up.error && /exists|duplicate/i.test(up.error.message)) {
        storagePath = storagePath.replace(/(\.(pdf|docx))$/i, `-${sha8}$1`);
        up = await sb.storage.from(BUCKET).upload(storagePath, buf, { contentType: ext, upsert: false });
      }
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
      const p = parsed.ok ? parsed : null;
      const row = {
        key, kind: 'source', status: 'library', storage_path: storagePath, source_file: f.name,
        source_folder: `AdrianMath/papers/${path.dirname(f.rel) === '.' ? '' : path.dirname(f.rel)}`.replace(/\/$/, ''),
        level: p?.level ?? null, year: p?.year ?? null, paper: p?.paper ?? null, school: p?.school ?? null,
        exam_type: p?.examType ?? null, subject: p?.subject ?? 'math', size_bytes: buf.length, sha256: sha,
        notes: `ARCHIVED ${TODAY} from ~/Desktop/AdrianMath/papers/${f.rel} when the folder was retired — the Mac fleet's copy` +
          `${f.suffix ? ` (suffix ${f.suffix})` : ''}; not queued${p ? '' : ` (name not fileable: ${(parsed as { reason: string }).reason})`}.`,
      };
      const { error } = await sb.from('paper_library').insert(row);
      if (error) throw new Error(error.message);
      keys.add(key); known.set(sha, { key, status: 'library', kind: 'source' });
      uploaded++; res.push({ file: f.rel, result: 'uploaded', key, storagePath });
      if (uploaded % 25 === 0) console.log(`  … ${uploaded} uploaded`);
    } catch (e) { failed++; res.push({ file: f.rel, result: 'failed', why: String((e as Error).message).slice(0, 160) }); console.error('FAILED', f.rel, (e as Error).message); }
  }
  console.log(`source files found: ${files.length} (pdf ${files.filter(f => /pdf$/i.test(f.name)).length}, docx ${files.filter(f => /docx$/i.test(f.name)).length})`);
  console.log(`already in the library (same bytes): ${inLib} · same bytes as another file here: ${dupLocal} · iCloud-evicted / dup markers: ${evicted} · unreadable/empty: ${unreadable}`);
  console.log(APPLY ? `uploaded: ${uploaded} · failed: ${failed}` : `missing from the library (would upload): ${wouldUpload} — dry run, add --apply`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(res, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
