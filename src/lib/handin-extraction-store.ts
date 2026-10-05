// The extraction hand-off for hand-ins — the I/O half (lib/handin-extraction.ts
// decides; SPEC-PAPER-MATCH.md §⑤, docs/EXTRACTION-QUEUE.md §1d).
//
// For each marked run the pure half says "queue": the pages are read from the
// student-files bucket (or the attached question-paper PDF is copied whole), put
// into ONE PDF named by the paper key alone, uploaded to the private
// `paper-library` bucket and queued as a `paper_library` source row — the same
// shape the inbox watcher writes. Printed pages WITH the student's working go as a
// private source flagged `contains_student_work`; once the paper is finished the
// tick deletes that source (`deleteFinishedStudentWorkSources`). A scheme the
// student attached rides beside it as its own `… MS.pdf` row, kept for pairing.
// When the typed name cannot name the paper, one model read of the printed pages
// (cover, headers, footers) is asked first. The run gets
// `result_json.extraction_handoff` so the sweep never looks twice.
//
// Called by the extraction-inbox cron tick (recent runs, a few a tick — after
// marking, so it never slows marking) and by scripts/handin-extraction-backfill.ts.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { getSupabaseAdmin } from './supabase';
import { fetchOurFile, isOurFileUrl } from './student-files';
import { loadPaperIndex } from './paper-index-store';
import { parseSourceFilename, sourceKey, sourceStoragePath } from './extraction-inbox';
import { sendTelegram } from './telegram';
import {
  backfillOrder, decideHandoff, handoffNote, handoffSummary, identityKey, paperIdentity, photoUrls, readingPages,
  unknownSchoolsLine, setLearnedFamilies, namesInAliasRow, lacksPageClassification, STUDENT_WORK_TAG,
  type HandinRun, type HandoffDecision, type PaperReading, type SchemeSource, type SchoolList,
} from './handin-extraction';

const BUCKET = 'paper-library';
export const HANDOFF_FOLDER = 'hand-in';
const RUN_COLS = 'id, created_at, paper_name, student_name, subject, paper_subject, queue_status, superseded_by, result_json';
export const READER_MODEL = process.env.HANDIN_READER_MODEL || 'claude-sonnet-5';

type SB = ReturnType<typeof getSupabaseAdmin>;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

async function bytesOf(url: string): Promise<Buffer> {
  const r = await fetchOurFile(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`could not read a stored file (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

async function jpeg(raw: Buffer, max: number): Promise<Buffer> {
  return sharp(raw).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/** Photos → one PDF, one page per photo, upright, at most 2400 px on the long side. */
export async function imagesToPdf(urls: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const u of urls) {
    const img = await doc.embedJpg(await jpeg(await bytesOf(u), 2400));
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return Buffer.from(await doc.save());
}

// ── reading the printed pages ───────────────────────────────────────────────

const READ_PROMPT = `These are photos of a Singapore exam paper a student handed in (the cover if there is one, then the first printed pages; the student may have written on them — ignore all handwriting). Read ONLY what is PRINTED — the cover, page headers and footers (e.g. "4048/01/O/N/22", "Queenstown Secondary School", "Preliminary Examination 2026", "6092/02") — and say which paper this is.

Answer with ONE JSON object and nothing else:
{
  "subject": "A Math" | "E Math" | "H2 Math" | "H1 Math" | "Physics" | "Chemistry" | "Biology" | "Combined Science" | "Other" | null,
  "syllabus_code": "the code as printed, e.g. 4049/01 or 6092/02, or null",
  "exam": "GCE" | "Prelim" | "SA1" | "SA2" | "MYE" | "Promo" | "WA" | "Specimen" | "Other" | null,   // GCE = a SEAB O/A-Level paper (Cambridge/SEAB header); EOY / End-of-Year = SA2
  "school": "the school name exactly as PRINTED, or null for a SEAB paper or when no school is printed",
  "year": 2025 | null,     // the exam's year as printed, never today's date
  "paper": 1 | 2 | 3 | 4 | null,
  "confidence": 0.0-1.0
}
Never guess: a field that is not printed on these pages is null.`;

const PAGES_PROMPT = `

These are ALL the photos of the hand-in, each labelled "Photo N" before it. Also add to the JSON:
  "pages": [{"photo": N, "kind": "cover" | "question_paper" | "mixed" | "working" | "other"}, …]   // one entry per photo: cover = front page / instructions; question_paper = printed questions with no handwriting; mixed = printed questions with the student's writing on them; working = the student's own paper with handwriting only; other = anything else`;

/**
 * One model read of a run's cover + first printed pages. A run marked before the page
 * pre-pass existed has no record of which photo is what, so ALL its photos are read
 * (smaller) and the answer lists each photo's kind too. Never throws; null = could not read.
 */
export async function readPrintedPages(run: HandinRun, client = new Anthropic()): Promise<PaperReading | null> {
  try {
    const urls = photoUrls(run.result_json);
    const all = lacksPageClassification(run.result_json);
    const idx = all ? [...urls.keys()].sort((a, b) => a - b).slice(0, 30) : readingPages(run.result_json);
    if (!idx.length) return null;
    const content: Anthropic.MessageParam['content'] = [];
    for (const i of idx) {
      if (all) content.push({ type: 'text', text: `Photo ${i}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await jpeg(await bytesOf(urls.get(i)!), all ? 1100 : 1600)).toString('base64') } });
    }
    content.push({ type: 'text', text: READ_PROMPT + (all ? PAGES_PROMPT : '') });
    const res = await client.messages.create({ model: READER_MODEL, max_tokens: all ? 1500 : 300, messages: [{ role: 'user', content }] });
    return parsePaperReading(res.content.map(c => (c.type === 'text' ? c.text : '')).join(''));
  } catch (e) {
    console.warn(`[handin-extraction] could not read run ${run.id}: ${((e as Error).message || String(e)).slice(0, 200)}`);
    return null;
  }
}

/** The reader's JSON, tolerant of a code fence. Pure. */
export function parsePaperReading(raw: string): PaperReading | null {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
    const pages = Array.isArray(j.pages)
      ? (j.pages as Array<Record<string, unknown>>).map(p => ({ photo: Number(p.photo), kind: String(p.kind || '') })).filter(p => Number.isInteger(p.photo) && p.kind)
      : null;
    return { subject: str(j.subject), syllabus_code: str(j.syllabus_code), exam: str(j.exam), school: str(j.school), year: num(j.year), paper: num(j.paper), confidence: num(j.confidence), ...(pages ? { pages } : {}) };
  } catch { return null; }
}

// ── filing ─────────────────────────────────────────────────────────────────

/** Upload + queue row. Returns the row id, or what already holds that name / those bytes. */
async function fileSource(
  sb: SB, name: string, bytes: Buffer,
  row: { status: 'queued' | 'skipped'; notes: string; studentWork: boolean },
): Promise<{ id: string } | { known: string }> {
  const parsed = parseSourceFilename(name);
  if (!parsed.ok) throw new Error(`name not fileable: ${parsed.reason}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const key = sourceKey(name);
  const { data: same } = await sb.from('paper_library').select('id, status, source_file')
    .or(`key.eq.${JSON.stringify(key)},sha256.eq.${sha256}`).limit(1);
  if (same && same.length) return { known: `${same[0].source_file} (${same[0].status})` };
  const storagePath = sourceStoragePath(parsed, name);
  const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { data, error } = await sb.from('paper_library').insert({
    key, kind: 'source', storage_path: storagePath, source_file: name, source_folder: HANDOFF_FOLDER,
    level: parsed.level, year: parsed.year, paper: parsed.paper, school: parsed.school, exam_type: parsed.examType,
    subject: parsed.subject, size_bytes: bytes.length, sha256, indexed_at: new Date().toISOString(),
    inbox_path: null, status: row.status, notes: row.notes, contains_student_work: row.studentWork,
  }).select('id').single();
  if (error) {
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`row: ${error.message}`);
  }
  return { id: String(data.id) };
}

/** Write the run's stamp, re-reading the row first so a fresher result_json is not overwritten. */
async function stampRun(sb: SB, runId: string, stamp: Record<string, unknown>): Promise<void> {
  const { data } = await sb.from('paper_marking_runs').select('result_json, queue_status').eq('id', runId).single();
  if (!data || data.queue_status === 'queued' || data.queue_status === 'claimed') return;
  const rj = obj(data.result_json);
  const prev = obj(rj.extraction_handoff);
  // A reading costs a model call, and an ask to Adrian is history — both survive every later stamp.
  const keep: Record<string, unknown> = prev.reading && !stamp.reading ? { reading: prev.reading } : {};
  for (const k of ['asked_school', 'asked_at', 'answered_school', 'answered_at']) if (prev[k] !== undefined && stamp[k] === undefined) keep[k] = prev[k];
  await sb.from('paper_marking_runs').update({ result_json: { ...rj, extraction_handoff: { ...keep, ...stamp } } }).eq('id', runId);
}

export type HandoffItem = {
  runId: string; paper: string | null; created: string | null; level: string | null;
  action: string; detail: string; file?: string; libraryId?: string; schemeId?: string;
  studentWork?: boolean; from?: 'name' | 'print'; short?: string;
};

/** Carry out one "queue" decision. Never throws — a failure comes back as an item. */
async function carryOut(sb: SB, run: HandinRun, d: HandoffDecision & { action: 'queue' }, dry: boolean, reading: PaperReading | null): Promise<HandoffItem> {
  const studentWork = d.source.kind === 'pages' && d.source.studentWork;
  const base = { runId: run.id, paper: run.paper_name, created: run.created_at ?? null, level: d.id.level, file: d.file, studentWork, from: d.from };
  const today = new Date().toISOString().slice(0, 10);
  const pagesNote = d.source.kind === 'pages'
    ? `${d.source.pages.length} printed page${d.source.pages.length === 1 ? '' : 's'}${studentWork ? ' with the student\'s working (private, deleted after extraction)' : ', clean'}`
    : 'attached question paper PDF';
  if (dry) return { ...base, action: 'queued', detail: `would queue — ${pagesNote}${d.scheme ? ' + scheme' : ''}${d.from === 'print' ? ' · named from the printed pages' : ''}` };
  try {
    let bytes: Buffer;
    if (d.source.kind === 'attached-pdf') bytes = await bytesOf(d.source.url);
    else {
      const urls = photoUrls(run.result_json);
      bytes = await imagesToPdf(d.source.pages.map(i => urls.get(i)!));
    }
    const note = handoffNote(run.id, d.source, today);
    const filed = await fileSource(sb, d.file, bytes, { status: 'queued', notes: note, studentWork });
    if ('known' in filed) {
      await stampRun(sb, run.id, { at: new Date().toISOString(), status: 'skipped', reason: 'already-queued', detail: filed.known, file: d.file, ...(reading ? { reading } : {}) });
      return { ...base, action: 'already-queued', detail: filed.known };
    }
    let schemeId: string | undefined;
    if (d.scheme) {
      try {
        const sBytes = d.scheme.kind === 'pdf' ? await bytesOf(d.scheme.url) : await imagesToPdf(d.scheme.urls);
        const s = await fileSource(sb, d.file.replace(/\.pdf$/i, ' MS.pdf'), sBytes, {
          status: 'skipped', studentWork: false,
          notes: `a mark scheme, not a paper to extract — kept for pairing (attached to a student hand-in, run ${run.id}, ${today}). Nothing claims it.`,
        });
        if ('id' in s) schemeId = s.id;
      } catch { /* the paper is queued either way; a scheme that would not copy is only a note */ }
    }
    await stampRun(sb, run.id, {
      at: new Date().toISOString(), status: 'queued', file: d.file, library_id: filed.id, contains_student_work: studentWork,
      ...(schemeId ? { scheme_id: schemeId } : {}), ...(reading ? { reading } : {}),
      source: d.source.kind, ...(d.source.kind === 'pages' ? { pages: d.source.pages } : {}),
    });
    return { ...base, action: 'queued', detail: `${pagesNote}${schemeId ? ' + scheme' : ''}`, libraryId: filed.id, schemeId };
  } catch (e) {
    const msg = ((e as Error).message || String(e)).slice(0, 160);
    await stampRun(sb, run.id, { at: new Date().toISOString(), status: 'failed', detail: msg, file: d.file }).catch(() => {});
    return { ...base, action: 'failed', detail: msg };
  }
}

/** Earlier stamps: papers already sent (identity keys) and short forms already asked about. */
async function earlierStamps(sb: SB): Promise<{ seen: Set<string>; asked: Set<string> }> {
  const { data } = await sb.from('paper_marking_runs').select('extraction_handoff:result_json->extraction_handoff')
    .not('result_json->extraction_handoff', 'is', null).limit(1000);
  const seen = new Set<string>(), asked = new Set<string>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const s = obj(r.extraction_handoff);
    if (s.asked_school) asked.add(String(s.asked_school).toUpperCase());
    if (s.status === 'queued' && s.file) {
      const p = parseSourceFilename(String(s.file));
      if (p.ok) seen.add(identityKey({ level: p.level, year: p.year, school: p.school, paper: Number(String(p.paper).replace(/\D/g, '')) }));
    }
  }
  return { seen, asked };
}

export type SweepOptions = {
  /** only runs created in the last n days (the cron); omit for every run (the backfill) */
  sinceDays?: number;
  /** at most this many papers queued in one sweep */
  maxQueue?: number;
  /** at most this many model reads of printed pages in one sweep */
  maxReads?: number;
  dry?: boolean;
  /** look again at runs already stamped */
  restamp?: boolean;
  /** stamp runs skipped for a lasting reason, so the cron never looks again */
  stampSkips?: boolean;
  /** readings from an earlier dry run (the backfill script keeps them in a file), keyed by run id */
  readingCache?: Map<string, PaperReading | null>;
  /** send Adrian the one batched line about short forms nobody could place */
  askAdrian?: boolean;
};

export type SweepResult = { checked: number; items: HandoffItem[]; counts: Record<string, number>; summary: string; reads: number; asked: string[] };

/** The sweep the cron tick and the backfill share. */
export async function sweepHandoffs(opts: SweepOptions = {}): Promise<SweepResult> {
  const sb = getSupabaseAdmin();
  const runs: HandinRun[] = [];
  for (let from = 0; ; from += 500) {
    let q = sb.from('paper_marking_runs').select(RUN_COLS).order('created_at', { ascending: false }).range(from, from + 499);
    if (opts.sinceDays) q = q.gte('created_at', new Date(Date.now() - opts.sinceDays * 86400_000).toISOString());
    const { data, error } = await q;
    if (error) throw new Error(`runs: ${error.message}`);
    runs.push(...((data ?? []) as HandinRun[]));
    if (!data || data.length < 500) break;
  }
  // Spellings taught since the code was written (Adrian's answers, the learner's families).
  const { data: aliasRows } = await sb.from('extraction_rules').select('law_text').eq('type', 'alias').eq('status', 'active').limit(1000);
  setLearnedFamilies((aliasRows ?? []).map(r => namesInAliasRow(r.law_text)).filter(f => f.length >= 2));
  // A run whose school short form Adrian has since answered is looked at again, however old.
  const { data: askedRuns } = await sb.from('paper_marking_runs').select(RUN_COLS)
    .not('result_json->extraction_handoff->answered_school', 'is', null).limit(200);
  for (const r of (askedRuns ?? []) as HandinRun[]) if (!runs.some(x => x.id === r.id)) runs.push(r);
  const reopened = (r: HandinRun) => {
    const h = obj(obj(r.result_json).extraction_handoff);
    return !!h.answered_school && h.status !== 'queued';
  };
  const fresh = opts.restamp ? runs : runs.filter(r => !obj(obj(r.result_json).extraction_handoff).status || reopened(r));
  if (!fresh.length) return { checked: 0, items: [], counts: {}, summary: handoffSummary({}), reads: 0, asked: [] };
  // The backfill reads the index fresh; the cron tick takes the 5-minute cache.
  const index = await loadPaperIndex(!opts.sinceDays);
  const byFamily = { maths: new Set<string>(), science: new Set<string>() };
  for (const l of index.lines) if (l.family === 'maths' || l.family === 'science') byFamily[l.family].add(l.school);
  const schools: SchoolList = fam => [...byFamily[fam], ...byFamily[fam === 'maths' ? 'science' : 'maths']];
  const { seen, asked } = await earlierStamps(sb);
  const isOurs = (u: string) => isOurFileUrl(u);

  const levelOf = (r: HandinRun) => { const w = paperIdentity(r, { schools }); return w.ok ? w.id.level : null; };
  const counted = new Map<string, number>();
  for (const r of runs) { const l = levelOf(r); if (l) counted.set(l, (counted.get(l) ?? 0) + 1); }
  const ordered = backfillOrder(fresh.map(run => ({ run, level: levelOf(run) })), counted);

  const items: HandoffItem[] = [];
  const shorts: Array<{ short: string; paper: string | null; runId: string }> = [];
  let queued = 0, reads = 0;
  for (const { run, level } of ordered) {
    const stamped = obj(obj(obj(run.result_json).extraction_handoff).reading);
    let reading: PaperReading | null = Object.keys(stamped).length ? (stamped as PaperReading) : (opts.readingCache?.get(run.id) ?? null);
    let d = decideHandoff(run, { lines: index.lines, seen, isOurs, schools, reading });
    // The typed name could not name it: read the printed pages before giving up.
    if (d.action === 'skip' && d.readable && !reading && !opts.readingCache?.has(run.id) && (opts.maxReads === undefined || reads < opts.maxReads)) {
      reading = await readPrintedPages(run);
      reads++;
      opts.readingCache?.set(run.id, reading);
      if (reading) d = decideHandoff(run, { lines: index.lines, seen, isOurs, schools, reading });
    }
    // A run marked before the page pre-pass: read ALL its photos once (which are printed
    // question pages, and the paper's name off any page) — an older reading of three photos
    // could do neither.
    const needsAll = lacksPageClassification(run.result_json) && !(reading?.pages?.length);
    if (d.action === 'skip' && needsAll && (d.reason === 'no-printed-pages' || d.reason === 'unknown-paper')
      && !['own-sheet'].includes(d.reason) && (opts.maxReads === undefined || reads < opts.maxReads)) {
      const full = await readPrintedPages(run);
      reads++;
      if (full) { reading = full; opts.readingCache?.set(run.id, full); d = decideHandoff(run, { lines: index.lines, seen, isOurs, schools, reading }); }
    }
    // About to send a paper named from the typed name alone: read the print once to
    // check it (a student who typed "E Math" on a 4049 A Math paper).
    if (d.action === 'queue' && !reading && !opts.readingCache?.has(run.id) && (opts.maxReads === undefined || reads < opts.maxReads)) {
      reading = await readPrintedPages(run);
      reads++;
      opts.readingCache?.set(run.id, reading);
      if (reading) d = decideHandoff(run, { lines: index.lines, seen, isOurs, schools, reading });
    }
    if (d.action === 'skip') {
      items.push({ runId: run.id, paper: run.paper_name, created: run.created_at ?? null, level: d.id?.level ?? level, action: d.reason, detail: d.detail, file: d.file, short: d.short });
      if (d.short && !asked.has(d.short.toUpperCase())) shorts.push({ short: d.short, paper: run.paper_name, runId: run.id });
      const lasting = d.reason !== 'not-marked' && d.reason !== 'superseded';
      if (!opts.dry && opts.stampSkips && lasting) {
        await stampRun(sb, run.id, {
          at: new Date().toISOString(), status: 'skipped', reason: d.reason, detail: d.detail,
          ...(d.file ? { file: d.file } : {}), ...(reading ? { reading } : {}),
        }).catch(() => {});
      } else if (!opts.dry && reading) {
        await stampRun(sb, run.id, { reading }).catch(() => {});
      }
      continue;
    }
    if (opts.maxQueue !== undefined && queued >= opts.maxQueue) {
      items.push({ runId: run.id, paper: run.paper_name, created: run.created_at ?? null, level, action: 'not-marked', detail: 'left for the next tick (cap)', file: d.file });
      continue;
    }
    seen.add(d.key);
    const item = await carryOut(sb, run, d, !!opts.dry, reading);
    if (item.action === 'queued') queued++;
    items.push(item);
  }

  // Adrian's one line about short forms nobody could place — once per short form.
  const askedNow: string[] = [];
  if (opts.askAdrian && !opts.dry && shorts.length) {
    const line = unknownSchoolsLine(shorts);
    const sent = line ? await sendTelegram(line, 'ops').catch((e: Error) => { console.warn('[handin-extraction] ask failed:', e?.message); return false; }) : false;
    if (!sent) console.warn(`[handin-extraction] could not ask Adrian about ${shorts.map(s => s.short).join(', ')}`);
    if (sent) {
      for (const s of shorts) {
        if (askedNow.includes(s.short.toUpperCase())) continue;
        askedNow.push(s.short.toUpperCase());
        await stampRun(sb, s.runId, { at: new Date().toISOString(), status: 'skipped', reason: 'unknown-paper', detail: `asked Adrian which school "${s.short}" is`, asked_school: s.short.toUpperCase(), asked_at: new Date().toISOString() }).catch(() => {});
      }
    }
  }
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.action] = (counts[it.action] ?? 0) + 1;
  return { checked: fresh.length, items, counts, summary: handoffSummary(counts), reads, asked: askedNow };
}

/**
 * The law's last step, done here so it never depends on a worker remembering it:
 * a source that contained a student's working is DELETED from the bucket once its
 * paper is finished (done / skipped / flagged), its storage_path blanked and the
 * row noted. Returns how many were deleted. Never throws.
 */
export async function deleteFinishedStudentWorkSources(dry = false): Promise<{ deleted: number; errors: string[] }> {
  const sb = getSupabaseAdmin();
  const out = { deleted: 0, errors: [] as string[] };
  const { data, error } = await sb.from('paper_library').select('id, storage_path, notes, status')
    .eq('contains_student_work', true).in('status', ['done', 'skipped', 'flagged']).neq('storage_path', '').limit(50);
  if (error) { out.errors.push(error.message); return out; }
  for (const r of data ?? []) {
    if (dry) { out.deleted++; continue; }
    const { error: rmErr } = await sb.storage.from(BUCKET).remove([String(r.storage_path)]);
    if (rmErr) { out.errors.push(`${r.id}: ${rmErr.message}`); continue; }
    const today = new Date().toISOString().slice(0, 10);
    await sb.from('paper_library').update({
      storage_path: '', notes: `${r.notes ? `${r.notes}\n` : ''}source deleted (contained student work) ${today}`,
    }).eq('id', r.id);
    out.deleted++;
  }
  return out;
}

export { STUDENT_WORK_TAG };
