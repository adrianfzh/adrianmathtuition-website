// GET /api/cron/extraction-inbox — the extraction inbox watcher (every 10 min).
//
// Adrian, 8 Sep 2026: "go ahead, build the watcher and queue". The fleet used to
// read source papers from the iCloud folder and claim one by renaming it; the
// folder now becomes a DOOR and the queue becomes a table. A .docx/.pdf dropped
// into /Extraction Inbox (app-folder root, beside /Scans) is, once it has sat
// unchanged for 90 s:
//   1. downloaded and hashed;
//   2. if these bytes are already known (a queued/claimed/done source, OR a PDF
//      already in the marker's exam library — which means it was extracted long
//      ago) → moved to /Extraction Inbox/rejected/ with a note on the existing
//      row, nothing enqueued twice;
//   3. else uploaded to the private `paper-library` bucket under
//      sources/<level>/<year>/<school>/<original name>, inserted into
//      paper_library as kind='source' status='queued' (or 'flagged' with the
//      reason when the name cannot be filed — it still uploads, under
//      sources/_unfiled/, so nothing is lost), and moved to /Extraction Inbox/queued/.
// Every step is idempotent: a crash between upload, insert and move is repaired
// by the next tick (lib/extraction-inbox.ts decideInboxFile), never repeated.
// ≤ 5 files per tick; ?dry=1 lists the plan. Stamps job_runs 'extraction-inbox'.
//
// Workers claim from the queue through /api/admin/extraction-queue (or the
// claim_extraction_paper RPC directly) — docs/EXTRACTION-QUEUE.md.
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { dropboxConfigured, ensureFolder, listFolder, downloadFile, movePath } from '@/lib/dropbox';
import { decideInboxFile, inboxSummary, isSourceFile, type InboxEntry, type KnownSource } from '@/lib/extraction-inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const INBOX_FOLDER = process.env.EXTRACTION_INBOX_FOLDER || '/Extraction Inbox';
const BUCKET = 'paper-library';
const PER_TICK = 5;
const MAX_BYTES = 60 * 1024 * 1024;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

async function moveTo(entry: InboxEntry, sub: 'queued' | 'rejected'): Promise<string | null> {
  try {
    await ensureFolder(`${INBOX_FOLDER}/${sub}`);
    return (await movePath(entry.path, `${INBOX_FOLDER}/${sub}/${entry.name}`, { autorename: true })).path;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  if (!dropboxConfigured()) return NextResponse.json({ ok: false, error: 'Dropbox not configured' }, { status: 503 });
  const sb = getSupabaseAdmin();
  const now = new Date();

  try { await ensureFolder(INBOX_FOLDER); } catch { /* listFolder below reports it */ }
  let entries: InboxEntry[] = [];
  try { entries = (await listFolder(INBOX_FOLDER)).filter(e => e.tag === 'file' && isSourceFile(e.name)); }
  catch (e) {
    await logJobRun('extraction-inbox', false, `cannot list ${INBOX_FOLDER}: ${(e as Error).message.slice(0, 120)}`).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  // What the ledger knows: every source row, plus any library row's sha (a PDF
  // the marker already grounds on was extracted long ago).
  const { data: knownRows, error: kErr } = await sb.from('paper_library')
    .select('id, key, sha256, status, inbox_path, source_file, kind');
  if (kErr) return NextResponse.json({ ok: false, error: kErr.message }, { status: 502 });
  const known: KnownSource[] = (knownRows ?? []).map(r => ({
    id: String(r.id), key: String(r.key), sha256: r.sha256 ? String(r.sha256) : null,
    status: String(r.status), inbox_path: r.inbox_path ? String(r.inbox_path) : null, source_file: String(r.source_file),
  }));

  const counts = { queued: 0, flagged: 0, duplicate: 0, moved: 0, waiting: 0, failed: 0 };
  const out: Array<Record<string, unknown>> = [];
  let handled = 0;
  for (const e of entries) {
    if (handled >= PER_TICK) { counts.waiting++; continue; }
    const item: Record<string, unknown> = { file: e.name, size: e.size ?? null };
    out.push(item);
    try {
      if ((e.size ?? 0) > MAX_BYTES) { item.action = `skip: too large (${Math.round((e.size ?? 0) / 1e6)} MB)`; counts.failed++; continue; }
      if (dry) {
        // No download in a dry run: settle check + name parse only.
        const d = decideInboxFile(e, `dry-${e.name}`, known, now);
        item.action = d.kind === 'wait' ? 'still settling' : `would ${d.kind}${'storagePath' in d ? ' → ' + d.storagePath : ''}`;
        continue;
      }
      // Settle check before paying for the download.
      const pre = decideInboxFile(e, 'unhashed', known.filter(k => k.sha256 !== 'unhashed'), now);
      if (pre.kind === 'wait') { counts.waiting++; item.action = 'still settling'; continue; }
      const bytes = await downloadFile(e.path);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const d = decideInboxFile(e, sha256, known, now);
      handled++;

      if (d.kind === 'ignore' || d.kind === 'wait') { item.action = d.kind; continue; }
      if (d.kind === 'move-only') {
        const to = await moveTo(e, d.to);
        item.action = `already queued as ${d.row.key} — moved to ${d.to}/`; counts.moved++;
        if (to) await sb.from('paper_library').update({ inbox_path: to }).eq('id', d.row.id);
        continue;
      }
      if (d.kind === 'duplicate') {
        const to = await moveTo(e, d.to);
        const note = `duplicate dropped in the inbox on ${now.toISOString().slice(0, 10)} as "${e.name}" (same sha256); moved to ${to ?? 'rejected/'}`;
        await sb.from('paper_library').update({ notes: `${d.of.status === 'library' ? 'ALREADY EXTRACTED — in the marker library. ' : ''}${note}` }).eq('id', d.of.id).then(() => {});
        item.action = `duplicate of ${d.of.source_file} (${d.of.status}) — moved to rejected/`; counts.duplicate++;
        continue;
      }
      // enqueue | flag — upload first, then the row, then the move: a crash at any
      // point leaves state the next tick repairs (upsert / move-only).
      const contentType = e.name.toLowerCase().endsWith('.pdf') ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const { error: upErr } = await sb.storage.from(BUCKET).upload(d.storagePath, bytes, { contentType, upsert: true });
      if (upErr) throw new Error(`upload: ${upErr.message}`);
      const parsed = d.parsed;
      const row = {
        key: d.key, kind: 'source', storage_path: d.storagePath, source_file: e.name, source_folder: INBOX_FOLDER,
        level: parsed.ok ? parsed.level : null, year: parsed.ok ? parsed.year : null,
        paper: parsed.ok ? parsed.paper : null, school: parsed.ok ? parsed.school : null,
        exam_type: parsed.ok ? parsed.examType : null,
        size_bytes: bytes.length, sha256, indexed_at: now.toISOString(), inbox_path: e.path,
        status: d.kind === 'enqueue' ? 'queued' : 'flagged',
        notes: d.kind === 'flag' ? `inbox could not file the name: ${parsed.ok ? '' : parsed.reason}. Rename it (fleet convention, e.g. "AM PRELIM 2025 Bedok South.pdf") and requeue.` : null,
      };
      const { data: ins, error: insErr } = await sb.from('paper_library').upsert(row, { onConflict: 'key,kind' }).select('id').single();
      if (insErr) throw new Error(`row: ${insErr.message}`);
      const to = await moveTo(e, d.to);
      if (to) await sb.from('paper_library').update({ inbox_path: to }).eq('id', ins.id);
      known.push({ id: String(ins.id), key: d.key, sha256, status: row.status, inbox_path: to ?? e.path, source_file: e.name });
      if (d.kind === 'enqueue') {
        counts.queued++;
        item.action = `queued: ${parsed.ok ? `${parsed.level} ${parsed.year} ${parsed.school}${parsed.examType ? ' ' + parsed.examType : ''} ${parsed.paper}` : ''} → ${d.storagePath}`;
      } else {
        counts.flagged++;
        item.action = `flagged (${parsed.ok ? '' : parsed.reason}) → ${d.storagePath}; moved to rejected/`;
      }
    } catch (err) {
      counts.failed++;
      item.action = `failed: ${((err as Error).message || String(err)).slice(0, 160)}`;
    }
  }

  const summary = inboxSummary(counts);
  if (!dry) await logJobRun('extraction-inbox', counts.failed === 0, summary).catch(() => {});
  return NextResponse.json({ ok: true, dry, folder: INBOX_FOLDER, summary, results: out });
}
