// GET /api/cron/dropbox-tray — the Dropbox tray's one-month life (daily).
//
// Adrian, 6 Sep 2026: the Students folder in his personal Dropbox is a TRAY he
// works from (Notability, Word), not the source. A paper's folder is deleted
// one month after the paper was released — the private store keeps the marked
// copies, and release-with-sheet archived the sheet PDF + DOCX there first.
// Rules, all fail-closed:
//   - only folders under /Students/<name>/ built from the run's own fields;
//   - only runs released ≥ TRAY_DAYS ago, tagged to a student;
//   - a run with a finished sheet is deleted only if the archive exists;
//   - each folder once (result_json.tray_deleted_at); ≤ 25 per run.
// ?dry=1 lists what would go. Stamps job_runs 'dropbox-tray'.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { getSupabaseAdmin } from '@/lib/supabase';
import { deletePath, dropboxConfigured, listFolder } from '@/lib/dropbox';
import { paperFolder, STUDENTS_ROOT, UNTAGGED_FOLDER } from '@/lib/paper-folder';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const TRAY_DAYS = 30;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  if (req.headers.get('x-vercel-cron')) return true;
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  return !!((cron && safeEqual(auth, `Bearer ${cron}`)) || (admin && safeEqual(auth, `Bearer ${admin}`)));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  if (!dropboxConfigured()) return NextResponse.json({ ok: false, error: 'Dropbox not configured' }, { status: 503 });
  const sb = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - TRAY_DAYS * 86400_000).toISOString();
  const { data: runs, error } = await sb.from('paper_marking_runs')
    .select('id, student_id, student_name, paper_name, created_at, released_at, archive:result_json->practice_again_archive, tray_deleted_at:result_json->>tray_deleted_at')
    .not('released_at', 'is', null).lte('released_at', cutoff).not('student_id', 'is', null)
    .is('result_json->>tray_deleted_at', null)
    .order('released_at', { ascending: true }).limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const out: Array<{ run: string; folder: string; action: string }> = [];
  for (const run of runs ?? []) {
    const folder = paperFolder(run);
    if (!folder.startsWith(`${STUDENTS_ROOT}/`) || folder.includes(`/${UNTAGGED_FOLDER}/`)) { out.push({ run: run.id, folder, action: 'skip: not a student folder' }); continue; }
    const { data: sheet } = await sb.from('sheet_jobs').select('id, status').eq('run_id', run.id).eq('status', 'done').limit(1).maybeSingle();
    if (sheet && !run.archive) { out.push({ run: run.id, folder, action: 'skip: sheet not archived yet — release it through the desk once' }); continue; }
    let exists = true;
    try { await listFolder(folder); } catch (e) { if (/not_found/.test((e as Error).message)) exists = false; else { out.push({ run: run.id, folder, action: `skip: ${(e as Error).message.slice(0, 80)}` }); continue; } }
    if (!exists) {
      if (!dry) await stamp(sb, run.id, 'absent');
      out.push({ run: run.id, folder, action: 'already gone' }); continue;
    }
    if (dry) { out.push({ run: run.id, folder, action: 'would delete' }); continue; }
    try {
      await deletePath(folder);
      await stamp(sb, run.id, 'deleted');
      out.push({ run: run.id, folder, action: 'deleted' });
    } catch (e) { out.push({ run: run.id, folder, action: `failed: ${(e as Error).message.slice(0, 80)}` }); }
  }
  const deleted = out.filter(o => o.action === 'deleted').length;
  if (!dry) {
    await logJobRun('dropbox-tray', true, `${deleted} folder(s) deleted, ${out.length - deleted} other`).catch(() => {});
    if (deleted) await sendTelegram(`🗑 Dropbox tray: ${deleted} paper folder${deleted === 1 ? '' : 's'} removed — released more than ${TRAY_DAYS} days ago; the app keeps every copy.`).catch(() => {});
  }
  return NextResponse.json({ ok: true, dry, cutoff, results: out });
}

async function stamp(sb: ReturnType<typeof getSupabaseAdmin>, runId: string, how: string) {
  const { data: row } = await sb.from('paper_marking_runs').select('result_json').eq('id', runId).maybeSingle();
  const rj = (row?.result_json && typeof row.result_json === 'object') ? row.result_json as Record<string, unknown> : {};
  await sb.from('paper_marking_runs').update({ result_json: { ...rj, tray_deleted_at: new Date().toISOString(), tray_deleted_how: how } }).eq('id', runId);
}
