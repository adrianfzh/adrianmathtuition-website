// The extraction hand-off for hand-ins — the I/O half (lib/handin-extraction.ts
// decides; SPEC-PAPER-MATCH.md §⑤, docs/EXTRACTION-QUEUE.md §1d).
//
// For each marked run the pure half says "queue": the printed-only pages are
// read from the student-files bucket (or the attached question-paper PDF is
// copied whole), put into ONE PDF named by the paper key alone, uploaded to the
// private `paper-library` bucket and queued as a `paper_library` source row —
// the same shape the inbox watcher writes. A scheme the student attached rides
// beside it as its own `… MS.pdf` row, kept for pairing (status 'skipped').
// The run gets `result_json.extraction_handoff` so the sweep never looks twice.
//
// Called by the extraction-inbox cron tick (recent runs, a few a tick — after
// marking, so it never slows marking) and by scripts/handin-extraction-backfill.ts.
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { getSupabaseAdmin } from './supabase';
import { fetchOurFile, isOurFileUrl } from './student-files';
import { loadPaperIndex } from './paper-index-store';
import { parseSourceFilename, sourceKey, sourceStoragePath } from './extraction-inbox';
import {
  backfillOrder, decideHandoff, handoffNote, handoffSummary, identityKey, paperIdentity, photoUrls,
  type HandinRun, type HandoffDecision, type SchemeSource, type SkipReason,
} from './handin-extraction';

const BUCKET = 'paper-library';
export const HANDOFF_FOLDER = 'hand-in';
const RUN_COLS = 'id, created_at, paper_name, student_name, subject, paper_subject, queue_status, superseded_by, result_json';

type SB = ReturnType<typeof getSupabaseAdmin>;

async function bytesOf(url: string): Promise<Buffer> {
  const r = await fetchOurFile(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`could not read a stored file (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/** Photos → one PDF, one page per photo, upright, at most 2400 px on the long side. */
export async function imagesToPdf(urls: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const u of urls) {
    const raw = await bytesOf(u);
    const jpg = await sharp(raw).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    const img = await doc.embedJpg(jpg);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return Buffer.from(await doc.save());
}

async function schemeBytes(s: SchemeSource): Promise<Buffer> {
  return s.kind === 'pdf' ? bytesOf(s.url) : imagesToPdf(s.urls);
}

/** Upload + queue row. Returns the row id, or null when the name or the bytes are already known. */
async function fileSource(
  sb: SB, name: string, bytes: Buffer, row: { status: 'queued' | 'skipped'; subject: string; notes: string },
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
    inbox_path: null, status: row.status, notes: row.notes,
  }).select('id').single();
  if (error) throw new Error(`row: ${error.message}`);
  return { id: String(data.id) };
}

/** Write the run's stamp, re-reading the row first so a fresher result_json is not overwritten. */
async function stampRun(sb: SB, runId: string, stamp: Record<string, unknown>): Promise<void> {
  const { data } = await sb.from('paper_marking_runs').select('result_json, queue_status').eq('id', runId).single();
  if (!data || data.queue_status === 'queued' || data.queue_status === 'claimed') return;
  const rj = (data.result_json && typeof data.result_json === 'object' ? data.result_json : {}) as Record<string, unknown>;
  await sb.from('paper_marking_runs').update({ result_json: { ...rj, extraction_handoff: stamp } }).eq('id', runId);
}

export type HandoffItem = {
  runId: string; paper: string | null; created: string | null; level: string | null;
  action: 'queued' | SkipReason | 'failed'; detail: string; file?: string; libraryId?: string; schemeId?: string;
};

/** Carry out one "queue" decision. Never throws — a failure comes back as an item. */
async function carryOut(sb: SB, run: HandinRun, d: HandoffDecision & { action: 'queue' }, dry: boolean): Promise<HandoffItem> {
  const base = { runId: run.id, paper: run.paper_name, created: run.created_at ?? null, level: d.id.level, file: d.file };
  const today = new Date().toISOString().slice(0, 10);
  const pagesNote = d.source.kind === 'pages' ? `photos ${d.source.pages.map(i => i + 1).join(', ')}${d.source.partial ? ` (${d.source.pages.length} of ${d.source.printed} printed)` : ''}` : 'attached question paper PDF';
  if (dry) return { ...base, action: 'queued', detail: `would queue — ${pagesNote}${d.scheme ? ' + scheme' : ''}` };
  try {
    let bytes: Buffer;
    if (d.source.kind === 'attached-pdf') bytes = await bytesOf(d.source.url);
    else {
      const urls = photoUrls(run.result_json);
      bytes = await imagesToPdf(d.source.pages.map(i => urls.get(i)!));
    }
    const note = handoffNote(run.id, d.source, today);
    const filed = await fileSource(sb, d.file, bytes, { status: 'queued', subject: d.id.subject, notes: note });
    if ('known' in filed) {
      await stampRun(sb, run.id, { at: new Date().toISOString(), status: 'skipped', reason: 'already-queued', detail: filed.known, file: d.file });
      return { ...base, action: 'already-queued', detail: filed.known };
    }
    let schemeId: string | undefined;
    if (d.scheme) {
      try {
        const sBytes = await schemeBytes(d.scheme);
        const s = await fileSource(sb, d.file.replace(/\.pdf$/i, ' MS.pdf'), sBytes, {
          status: 'skipped', subject: d.id.subject,
          notes: `a mark scheme, not a paper to extract — kept for pairing (attached to a student hand-in, run ${run.id}, ${today}). Nothing claims it.`,
        });
        if ('id' in s) schemeId = s.id;
      } catch { /* the paper is queued either way; a scheme that would not copy is only a note */ }
    }
    await stampRun(sb, run.id, {
      at: new Date().toISOString(), status: 'queued', file: d.file, library_id: filed.id,
      ...(schemeId ? { scheme_id: schemeId } : {}),
      source: d.source.kind, ...(d.source.kind === 'pages' ? { pages: d.source.pages, partial: d.source.partial } : {}),
    });
    return { ...base, action: 'queued', detail: `${pagesNote}${schemeId ? ' + scheme' : ''}`, libraryId: filed.id, schemeId };
  } catch (e) {
    const msg = ((e as Error).message || String(e)).slice(0, 160);
    await stampRun(sb, run.id, { at: new Date().toISOString(), status: 'failed', detail: msg, file: d.file }).catch(() => {});
    return { ...base, action: 'failed', detail: msg };
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Identity keys already sent by an earlier run's stamp (so two hand-ins of one paper never both go). */
async function alreadySent(sb: SB): Promise<Set<string>> {
  const { data } = await sb.from('paper_marking_runs').select('result_json->extraction_handoff')
    .not('result_json->extraction_handoff', 'is', null).limit(1000);
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const s = obj(r.extraction_handoff);
    if (s.status === 'queued' && s.file) {
      const p = parseSourceFilename(String(s.file));
      if (p.ok) out.add(identityKey({ subject: 'math', level: p.level, year: p.year, school: p.school, examType: String(p.examType || ''), paper: Number(String(p.paper).replace(/\D/g, '')) }));
    }
  }
  return out;
}

export type SweepOptions = {
  /** only runs created in the last n days (the cron); omit for every run (the backfill) */
  sinceDays?: number;
  /** at most this many papers queued in one sweep */
  maxQueue?: number;
  dry?: boolean;
  /** look again at runs already stamped */
  restamp?: boolean;
  /** stamp runs skipped for a lasting reason, so the cron never looks again */
  stampSkips?: boolean;
};

export type SweepResult = { checked: number; items: HandoffItem[]; counts: Record<string, number>; summary: string };

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
  const fresh = opts.restamp ? runs : runs.filter(r => !obj(obj(r.result_json).extraction_handoff).status);
  if (!fresh.length) return { checked: 0, items: [], counts: {}, summary: handoffSummary({}) };
  // The backfill reads the index fresh; the cron tick takes the 5-minute cache.
  const index = await loadPaperIndex(!opts.sinceDays);
  const seen = await alreadySent(sb);
  const isOurs = (u: string) => isOurFileUrl(u);

  // The backfill's order: science Sec 4 first, then the levels handed in most, newest first.
  const levelOf = (r: HandinRun) => { const w = paperIdentity(r); return w.ok ? w.id.level : null; };
  const counted = new Map<string, number>();
  for (const r of runs) { const l = levelOf(r); if (l) counted.set(l, (counted.get(l) ?? 0) + 1); }
  const ordered = backfillOrder(fresh.map(run => ({ run, level: levelOf(run) })), counted);

  const items: HandoffItem[] = [];
  let queued = 0;
  for (const { run, level } of ordered) {
    const d = decideHandoff(run, { lines: index.lines, seen, isOurs });
    if (d.action === 'skip') {
      items.push({ runId: run.id, paper: run.paper_name, created: run.created_at ?? null, level, action: d.reason, detail: d.detail, file: d.file });
      const lasting = d.reason !== 'not-marked' && d.reason !== 'superseded';
      if (!opts.dry && opts.stampSkips && lasting) {
        await stampRun(sb, run.id, { at: new Date().toISOString(), status: 'skipped', reason: d.reason, detail: d.detail, ...(d.file ? { file: d.file } : {}) }).catch(() => {});
      }
      continue;
    }
    if (opts.maxQueue !== undefined && queued >= opts.maxQueue) {
      items.push({ runId: run.id, paper: run.paper_name, created: run.created_at ?? null, level, action: 'not-marked', detail: 'left for the next tick (cap)', file: d.file });
      continue;
    }
    seen.add(d.key);
    const item = await carryOut(sb, run, d, !!opts.dry);
    if (item.action === 'queued') queued++;
    items.push(item);
  }
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.action] = (counts[it.action] ?? 0) + 1;
  return { checked: fresh.length, items, counts, summary: handoffSummary(counts as Partial<Record<SkipReason | 'queued', number>>) };
}
