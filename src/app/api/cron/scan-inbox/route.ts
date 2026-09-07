// GET /api/cron/scan-inbox — the ScanSnap watcher (every 5 min).
//
// Adrian, 7 Sep 2026: "I'm scanning the papers and they appear in the ScanSnap
// folder in Dropbox. Automate: once scanned, put into the marking queue and the
// process follows from there. Give a suitable name for the PDF by reading the
// cover page; for exam papers follow the naming convention and tag the student.
// Non-exam papers: leave alone."
//
// The scanner saves into /Scans (app-folder root — ScanSnap Home's destination
// must point at Dropbox/Apps/AdrianMathNotes/Scans; the website's Dropbox token
// cannot see the top-level /ScanSnap). Each PDF, once it has sat unchanged for
// 90 s, is handled ONCE (scan_inbox ledger, unique on path+size+modified):
//   1. named by hand already ("joey am tys 2021 p2.pdf")? → that name, no read;
//      else render pages 1–2 and read the cover (lib/scan-reader.ts);
//   2. not a student's answered script → status 'other', file untouched, silent;
//   3. exam script → every page rendered to JPEG and put in the private store
//      (inbox/scan-…), a run saved through the bot (save-paper), the student
//      tagged when the roster has exactly one match (set-student — which also
//      auto-queues the sheet), the run enqueued (🌙 queue, opus/teacher), the PDF
//      renamed in /Scans to the convention name, one Telegram line.
// The FIRST run baselines whatever is already in the folder without touching it
// (those scans were marked by hand). ≤ 2 scans per tick; ?dry=1 lists the plan.
// Stamps job_runs 'scan-inbox' every tick (JOB_RHYTHMS alarms by absence).
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { dropboxConfigured, ensureFolder, listFolder, downloadFile, movePath } from '@/lib/dropbox';
import { putStudentFile } from '@/lib/student-files';
import { pdfPageToImage } from '@/lib/batch-marking';
import { readScanCover } from '@/lib/scan-reader';
import { airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import {
  buildScanPaperName, isPdf, isSettled, matchStudent, parseScanFilename, scanLine,
  type CoverReading, type RosterStudent, type ScanEntry,
} from '@/lib/scan-inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const SCAN_FOLDER = process.env.SCAN_INBOX_FOLDER || '/Scans';
const PER_TICK = 2;
const MAX_PDF_BYTES = 80 * 1024 * 1024;
const MAX_PAGES = 40;
const PAGE_SCALE = 1.7;           // ~1450px wide at A4 — what the marker reads at

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

async function bot(phase: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = process.env.BOT_BASE_URL, secret = process.env.BOT_INTERNAL_SECRET;
  if (!base || !secret) throw new Error('bot not configured');
  const r = await fetch(`${base}/api/mark-paper`, {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase, ...body }), signal: AbortSignal.timeout(60_000),
  });
  const d = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok || d.error) throw new Error(`${phase}: ${String(d.error || r.status)}`);
  return d;
}

async function roster(): Promise<RosterStudent[]> {
  const { records } = await airtableRequestAll('Students', `?filterByFormula=${encodeURIComponent("OR({Status}='Active',{Status}='Trial')")}&fields%5B%5D=Student%20Name&fields%5B%5D=Level`);
  return records.map((r: { id: string; fields: Record<string, unknown> }) => ({ id: r.id, name: String(r.fields['Student Name'] || ''), level: (r.fields['Level'] as string) || null }))
    .filter(s => s.name);
}

type Row = { id: string; path: string; name: string; size: number | null; modified: string | null };

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  if (!dropboxConfigured()) return NextResponse.json({ ok: false, error: 'Dropbox not configured' }, { status: 503 });
  const sb = getSupabaseAdmin();
  const now = new Date();
  const out: Array<Record<string, unknown>> = [];

  try { await ensureFolder(SCAN_FOLDER); } catch { /* listFolder below reports it */ }
  let entries: ScanEntry[] = [];
  try { entries = (await listFolder(SCAN_FOLDER)).filter(e => e.tag === 'file' && isPdf(e.name)); }
  catch (e) {
    await logJobRun('scan-inbox', false, `cannot list ${SCAN_FOLDER}: ${(e as Error).message.slice(0, 120)}`).catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  // What the ledger already knows — by (path, size, modified).
  const { data: known } = await sb.from('scan_inbox').select('id, path, size, modified, status, renamed_to');
  const seen = new Set((known ?? []).map(k => `${k.path}|${k.size ?? ''}|${k.modified ? new Date(k.modified).toISOString() : ''}`));
  const renamedTo = new Set((known ?? []).map(k => String(k.renamed_to || '').toLowerCase()).filter(Boolean));
  const keyOf = (e: ScanEntry) => `${e.path}|${e.size ?? ''}|${e.modified ? new Date(e.modified).toISOString() : ''}`;
  const fresh = entries.filter(e => !seen.has(keyOf(e)) && !renamedTo.has(e.path.toLowerCase()));

  // First ever run: baseline the folder — those scans were handled by hand. A
  // sentinel row marks that the baseline happened even when the folder was
  // empty, so the first real scan is never mistaken for an old one.
  const { count: ledgerCount } = await sb.from('scan_inbox').select('id', { count: 'exact', head: true });
  if ((ledgerCount ?? 0) === 0) {
    if (!dry) {
      await sb.from('scan_inbox').insert([
        { path: SCAN_FOLDER.toLowerCase(), name: '(baseline)', status: 'baseline', processed_at: now.toISOString() },
        ...fresh.map(e => ({ path: e.path, name: e.name, size: e.size ?? null, modified: e.modified ?? null, status: 'baseline', processed_at: now.toISOString() })),
      ]);
    }
    await logJobRun('scan-inbox', true, `baseline: ${fresh.length} existing scan(s) recorded, none processed`).catch(() => {});
    return NextResponse.json({ ok: true, dry, baseline: fresh.length, folder: SCAN_FOLDER });
  }

  const todo = fresh.filter(e => isSettled(e, now)).slice(0, PER_TICK);
  const waiting = fresh.length - todo.length;
  let students: RosterStudent[] | null = null;

  for (const e of todo) {
    const item: Record<string, unknown> = { file: e.name, size: e.size };
    out.push(item);
    if (dry) { item.action = 'would process'; continue; }
    // Claim the row first: a second tick (or a retry after a crash) never handles it twice.
    const { data: row, error: insErr } = await sb.from('scan_inbox')
      .insert({ path: e.path, name: e.name, size: e.size ?? null, modified: e.modified ?? null, status: 'pending' })
      .select('id, path, name, size, modified').single<Row>();
    if (insErr || !row) { item.action = `skip: ${insErr?.message || 'no row'}`; continue; }
    const fail = async (msg: string) => {
      await sb.from('scan_inbox').update({ status: 'failed', error: msg.slice(0, 500), processed_at: new Date().toISOString() }).eq('id', row.id);
      item.action = `failed: ${msg.slice(0, 160)}`;
    };
    try {
      if ((e.size ?? 0) > MAX_PDF_BYTES) { await fail(`too large (${Math.round((e.size ?? 0) / 1e6)} MB)`); continue; }
      const pdf = await downloadFile(e.path);

      // Pages → JPEG. Page count first (cheap), then render.
      const first = await pdfPageToImage(pdf, 1, PAGE_SCALE);
      const pages: Buffer[] = [await sharp(first.buffer).jpeg({ quality: 82 }).toBuffer()];
      const named = parseScanFilename(e.name);
      let reading: CoverReading | null = null;
      let paperName: string | null = named?.paperName ?? null;
      let readName: string | null = null;
      let student: RosterStudent | null = null;
      students = students ?? await roster();

      if (!named) {
        let second: Buffer | null = null;
        try { second = await sharp((await pdfPageToImage(pdf, 2, PAGE_SCALE)).buffer).jpeg({ quality: 82 }).toBuffer(); } catch { /* one-page scan */ }
        const read = await readScanCover(second ? [{ jpeg: pages[0] }, { jpeg: second }] : [{ jpeg: pages[0] }]);
        reading = read.reading;
        if (!reading || !reading.is_exam_script || (reading.confidence != null && reading.confidence < 0.4)) {
          await sb.from('scan_inbox').update({ status: 'other', reading: reading ?? { raw: read.raw.slice(0, 500) }, processed_at: new Date().toISOString() }).eq('id', row.id);
          item.action = `not an exam script — left alone (${reading?.reason || 'unreadable cover'})`;
          continue;
        }
        readName = reading.student_name || reading.given_name || null;
        student = matchStudent(reading.student_name, students) || matchStudent(reading.given_name, students);
        paperName = buildScanPaperName(reading);
        if (second) pages.push(second);
      } else {
        student = matchStudent(named.firstName, students);
      }

      // The rest of the pages.
      let n = pages.length;
      for (; n < MAX_PAGES; n++) {
        try { pages.push(await sharp((await pdfPageToImage(pdf, n + 1, PAGE_SCALE)).buffer).jpeg({ quality: 82 }).toBuffer()); }
        catch { break; }
      }

      // Into the private store, then a run through the bot.
      const photos: Array<{ photo_index: number; original_url: string }> = [];
      for (let i = 0; i < pages.length; i++) {
        const key = `inbox/scan-${row.id}-p${String(i + 1).padStart(2, '0')}.jpg`;
        const put = await putStudentFile({ key, body: pages[i], contentType: 'image/jpeg' });
        photos.push({ photo_index: i, original_url: put.url });
      }
      const runName = paperName || e.name.replace(/\.pdf$/i, '');
      const saved = await bot('save-paper', { paperName: runName, source: { photos }, subject: 'math' });
      const runId = String(saved.run_id || '');
      if (!runId) throw new Error('save-paper returned no run id');
      // Provenance on the run: which scan, what the cover said.
      try {
        const { data: r0 } = await sb.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle();
        const rj = (r0?.result_json && typeof r0.result_json === 'object') ? r0.result_json as Record<string, unknown> : {};
        await sb.from('paper_marking_runs').update({ result_json: { ...rj, scan: { file: e.name, path: e.path, ledger_id: row.id, reading: reading ?? null } } }).eq('id', runId);
      } catch { /* provenance only */ }
      if (student) await bot('set-student', { id: runId, studentId: student.id, studentName: student.name });
      const q = await bot('enqueue', { id: runId, model: 'opus', style: 'teacher' });

      // Rename the scan in place to the convention name (autorename on a clash).
      let renamedPath: string | null = null;
      if (paperName && paperName !== e.name.replace(/\.pdf$/i, '').toLowerCase()) {
        try { renamedPath = (await movePath(e.path, `${SCAN_FOLDER}/${paperName}.pdf`, { autorename: true })).path; } catch { /* the name is on the run either way */ }
      }
      await sb.from('scan_inbox').update({
        status: 'exam', reading, paper_name: runName, student_id: student?.id ?? null, student_name: student?.name ?? null,
        run_id: runId, renamed_to: renamedPath, pages: pages.length, processed_at: new Date().toISOString(),
      }).eq('id', row.id);
      const line = scanLine({ paperName: runName, fileName: e.name, student, readName, pages: pages.length, queued: true, etaMinutes: typeof q.etaMinutes === 'number' ? q.etaMinutes : null });
      await sendTelegram(line, 'marking').catch(() => {});
      item.action = line;
    } catch (err) {
      await fail((err as Error).message || String(err));
    }
  }

  const processed = out.filter(o => typeof o.action === 'string' && String(o.action).startsWith('📠')).length;
  if (!dry) await logJobRun('scan-inbox', true, `${processed} queued, ${out.length - processed} other, ${waiting} waiting`).catch(() => {});
  return NextResponse.json({ ok: true, dry, folder: SCAN_FOLDER, results: out, waiting });
}
