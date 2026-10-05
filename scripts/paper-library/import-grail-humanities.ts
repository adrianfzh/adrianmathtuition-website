// The Grail secondary humanities + languages files → the private 'paper-library' bucket
// (6 Oct 2026, Adrian: "copy the secondary humanities and languages and yes queue humanities
// and languages — priority social studies and english"). A one-off, like archive-bank-folder.ts.
//
// Input: a plan JSON (one entry per file in ~/Desktop/AdrianMath/grail-harvest — O-Level Social
// Studies / History / Geography / Literature / English / Chinese / Higher Chinese / Chinese
// Literature / Malay / Tamil, N-Level Social Studies / English, IP English / Geography / History,
// Sec 1–2 English Literature / Geography / History), built from manifest.jsonl + each file's
// cover text: `kind` exam|notes, and for an exam file its subject, level, school, year, exam,
// paper and what the file is (`action`):
//   queue   — the paper to extract; uploaded under its fleet name, `status='library'` until
//             --queue (below). A separate Insert is MERGED into it (the worker reads one file);
//             "(with scheme)" in the name = its mark scheme is inside the same file.
//   scheme  — its mark scheme: `status='skipped'`, "a mark scheme, not a paper to extract —
//             kept for pairing" (the worker finds it by subject, level, year, school, paper).
//   insert  — the Insert on its own (kept; the queued copy already carries it).
//   hold    — a paper with no scheme anywhere: in the library, not queued, the reason in notes.
//   library — notes, compilations, other copies of a paper already kept: in the library only.
//   skip-dup — the same bytes as another file in this copy: not uploaded.
// The originals are never touched. Every file whose bytes the library already holds (any row,
// by sha256) is skipped. A file over 45 MB is cut by page range with qpdf into parts.
//
//   npx tsx scripts/paper-library/import-grail-humanities.ts --plan <plan.json>            # dry run
//   npx tsx scripts/paper-library/import-grail-humanities.ts --plan <plan.json> --apply    # upload + insert
//   npx tsx scripts/paper-library/import-grail-humanities.ts --plan <plan.json> --queue    # queue the
//     `queue` rows in Adrian's order (Social Studies O then N, English, History, Geography), oldest
//     indexed_at first, so the claim RPC hands them out in that order (English only with --english)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.env.local')));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const APPLY = process.argv.includes('--apply');
const QUEUE = process.argv.includes('--queue');
const ENGLISH = process.argv.includes('--english');
const PLAN = arg('plan');
if (!PLAN) { console.error('--plan <file> is required'); process.exit(1); }
const sb = createClient(String(env.SUPABASE_URL).trim(), String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY).trim(), { auth: { persistSession: false } });
const BUCKET = 'paper-library';
const TODAY = '6 Oct 2026';
const MAX = 45 * 1024 * 1024;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'grail-'));

type P = {
  i: number; name: string; folder: string; sha256: string; pages: number | null; size: number; path: string; grail_id: number;
  kind: 'exam' | 'notes'; subject: string; level: string | null; school?: string; year?: number; exam_type?: string; paper?: string; grade?: string;
  role?: string; action: string; why?: string | null; file_name?: string; scheme_inside?: boolean; scheme_i?: number | null; insert_i?: number | null;
  exam_assumed?: boolean;
};
const plan: P[] = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
const byI = new Map(plan.map(p => [p.i, p]));
const safe = (s: string) => String(s).replace(/[^\w.() '\-]+/g, '_').replace(/\s+/g, ' ').trim();
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const keyOf = (name: string) => `src ${name.replace(/\.pdf$/i, '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
const ORDER: Record<string, number> = { SS: 1, SS_NA: 2, EL: 3, EL_NA: 3, S3_EL_NA: 3, HIST: 4, HIST_E: 5, GEOG: 6, GEOG_E: 7 };

async function known() {
  const bySha = new Map<string, string>(); const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('paper_library').select('key,kind,sha256').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) { if (r.sha256) bySha.set(r.sha256, r.key); keys.add(`${r.kind}|${r.key}`); }
    if (!data || data.length < 1000) break;
  }
  return { bySha, keys };
}

function storagePath(p: P, file: string) {
  if (p.kind === 'notes' || !p.level || !p.school) return `sources/_grail/${safe(p.subject)}/${safe(file)}`;
  return `sources/${safe(p.level)}/${p.year}/${safe(p.school).replace(/ /g, '_')}/${safe(file)}`;
}

async function put(p: P, buf: Buffer, file: string, row: Record<string, unknown>, k: Awaited<ReturnType<typeof known>>) {
  const h = sha(buf);
  if (k.bySha.has(h)) return { result: 'in-library', key: k.bySha.get(h) };
  let key = keyOf(file); if (k.keys.has(`source|${key}`)) key = `${key} ${h.slice(0, 8)}`;
  let sp = storagePath(p, file);
  if (!APPLY) return { result: 'would-upload', key, sp };
  let up = await sb.storage.from(BUCKET).upload(sp, buf, { contentType: 'application/pdf', upsert: false });
  if (up.error && /exists|duplicate/i.test(up.error.message)) {
    sp = sp.replace(/\.pdf$/i, `-${h.slice(0, 8)}.pdf`);
    up = await sb.storage.from(BUCKET).upload(sp, buf, { contentType: 'application/pdf', upsert: false });
  }
  if (up.error) throw new Error(up.error.message);
  const full = { key, kind: 'source', storage_path: sp, source_file: file, size_bytes: buf.length, sha256: h, ...row };
  const { error } = await sb.from('paper_library').insert(full);
  if (error) throw new Error(error.message);
  k.bySha.set(h, key); k.keys.add(`source|${key}`);
  return { result: 'uploaded', key, sp };
}

const prov = (p: P) => `COPIED ${TODAY} from ~/Desktop/AdrianMath/grail-harvest/${p.folder}/ (Grail #${p.grail_id} "${p.name}")`;

function fields(p: P) {
  if (p.kind !== 'exam') return { subject: p.subject, level: null, year: p.year ?? null, school: null, exam_type: 'Notes', paper: null };
  return { subject: p.subject, level: p.level, year: p.year, school: p.school, exam_type: p.exam_type, paper: p.paper === 'all' ? 'all' : `p${p.paper}` };
}

async function importAll() {
  const k = await known();
  const out: Array<Record<string, unknown>> = [];
  const count: Record<string, number> = {};
  const bump = (s: string) => { count[s] = (count[s] || 0) + 1; };
  for (const p of plan) {
    if (p.action === 'skip-dup') { bump('skip-dup'); out.push({ i: p.i, result: 'skip-dup' }); continue; }
    const buf = fs.readFileSync(p.path);
    if (sha(buf) !== p.sha256) throw new Error(`bytes changed under ${p.path}`);
    const f = fields(p);
    try {
      if (buf.length > MAX) {
        // cut by pages into parts under the limit (the 5 Oct 2026 precedent)
        const n = Math.ceil(buf.length / MAX) + 1; const pages = p.pages || 1; const per = Math.ceil(pages / n);
        for (let a = 1, part = 1; a <= pages; a += per, part++) {
          const b = Math.min(pages, a + per - 1); const o = path.join(TMP, `${p.i}-${part}.pdf`);
          execFileSync('qpdf', [p.path, '--pages', '.', `${a}-${b}`, '--', o]);
          const file = `${(p.file_name || `${p.grail_id} - ${p.name}`).replace(/\.pdf$/i, '')} (part ${part} of ${n}, pages ${a}-${b}).pdf`;
          const r = await put(p, fs.readFileSync(o), file, { ...f, status: 'library', source_folder: `grail-harvest/${p.folder} (split ${TODAY})`,
            notes: `${prov(p)} — over the upload limit, cut by page range; not queued (${p.why || 'not one exam paper'}).` }, k);
          bump(r.result); out.push({ i: p.i, part, ...r });
        }
        continue;
      }
      const file = p.file_name || `${p.grail_id} - ${safe(p.name)}.pdf`;
      if (p.action === 'queue') {
        const ins = p.insert_i != null ? byI.get(p.insert_i)! : null;
        const sch = p.scheme_i != null ? byI.get(p.scheme_i)! : null;
        let qbuf = buf; let mergedNote = '';
        if (ins) {
          const o = path.join(TMP, `${p.i}-merged.pdf`);
          execFileSync('pdfunite', [p.path, ins.path, o]);
          qbuf = fs.readFileSync(o);
          mergedNote = ` Its Insert ("${ins.name}", Grail #${ins.grail_id}) is merged in after the question pages.`;
          // the original question paper's bytes are kept too, so a later drop of it is known
          const r0 = await put(p, buf, file.replace(/\.pdf$/i, ' (question paper only).pdf'), { ...f, status: 'library', source_folder: `grail-harvest/${p.folder}`,
            notes: `${prov(p)} — the question paper alone; the copy to extract is "${file}" (merged with its Insert).` }, k);
          bump(r0.result); out.push({ i: p.i, original: true, ...r0 });
        }
        const schemeNote = p.scheme_inside ? ' The mark scheme is INSIDE this file (after the questions).'
          : sch ? ` Its mark scheme is the separate file "${sch.file_name}".` : ' No mark scheme with this paper.';
        const r = await put(p, qbuf, file, { ...f, status: 'library', source_folder: `grail-harvest/${p.folder}`,
          notes: `${prov(p)} — a school paper (not national).${mergedNote}${schemeNote}${p.exam_assumed ? ' Exam type not printed on the name: assumed Prelim.' : ''}${p.grade === 'Sec3' ? ' A Sec 3 paper.' : ''} TO QUEUE (${TODAY}).` }, k);
        bump(r.result); out.push({ i: p.i, ...r });
      } else if (p.action === 'scheme') {
        const r = await put(p, buf, file, { ...f, status: 'skipped', source_folder: `grail-harvest/${p.folder}`,
          notes: `a mark scheme, not a paper to extract — kept for pairing: the worker finds it by subject, level, year, school and paper. ${prov(p)}.` }, k);
        bump(r.result); out.push({ i: p.i, ...r });
      } else {
        const why = p.action === 'insert' ? 'the Insert on its own — the queued copy of its paper carries it'
          : p.action === 'hold' ? `not queued: ${p.why}` : `not queued: ${p.why || 'not one exam paper'}`;
        const r = await put(p, buf, file, { ...f, status: 'library', source_folder: `grail-harvest/${p.folder}`, notes: `${prov(p)} — ${why}.` }, k);
        bump(r.result); out.push({ i: p.i, ...r });
      }
    } catch (e) { bump('failed'); out.push({ i: p.i, result: 'failed', why: String((e as Error).message).slice(0, 200) }); console.error('FAILED', p.i, p.name, (e as Error).message); }
    if ((count.uploaded || 0) % 50 === 0 && count.uploaded) process.stdout.write(`  … ${count.uploaded} uploaded\r`);
  }
  console.log(JSON.stringify(count));
  fs.writeFileSync(PLAN!.replace(/\.json$/, '.result.json'), JSON.stringify(out, null, 1));
}

async function queueAll() {
  // The rows this import made that are marked TO QUEUE, in Adrian's order (the claim hands out
  // the oldest indexed_at first, so indexed_at is rewritten to carry the order).
  const rows: Array<{ id: string; level: string; year: number; source_file: string; notes: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('paper_library').select('id,level,year,source_file,notes,status')
      .eq('kind', 'source').eq('status', 'library').like('notes', `%TO QUEUE (${TODAY})%`).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []) as typeof rows);
    if (!data || data.length < 1000) break;
  }
  const pick = rows.filter(r => ENGLISH ? /^(EL|EL_NA|S3_EL_NA)$/.test(r.level) : !/^(EL|EL_NA|S3_EL_NA)$/.test(r.level));
  const sec3 = (r: typeof rows[0]) => / A Sec 3 paper\./.test(r.notes) ? 1 : 0;
  pick.sort((a, b) => (ORDER[a.level] ?? 9) - (ORDER[b.level] ?? 9) || sec3(a) - sec3(b) || b.year - a.year || a.source_file.localeCompare(b.source_file));
  // One block per subject on a fixed base, so the English rows queued later still land
  // between Social Studies and History: indexed_at = BASE + order × 1,000 s + rank ms.
  const BASE = Date.parse('2026-10-06T00:00:00Z');
  let n = 0;
  for (const r of pick) {
    const at = new Date(BASE + (ORDER[r.level] ?? 9) * 1_000_000 + n).toISOString();
    const { error } = await sb.from('paper_library').update({ status: 'queued', indexed_at: at,
      notes: r.notes.replace(`TO QUEUE (${TODAY}).`, `QUEUED ${TODAY} (order ${n + 1} of ${pick.length}${ENGLISH ? ', English' : ''}).`) }).eq('id', r.id).eq('status', 'library');
    if (error) throw new Error(error.message);
    n++;
  }
  console.log(`queued ${n}`);
}

(QUEUE ? queueAll() : importAll()).catch(e => { console.error(e); process.exit(1); });
