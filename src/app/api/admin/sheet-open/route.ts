import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getTemporaryLink, dropboxConfigured } from '@/lib/dropbox';

export const runtime = 'nodejs';

// GET /api/admin/sheet-open?runId=<uuid>&kind=docx|pdf
//
// Opens the self-study sheet a paper produced. The sheet lands in Dropbox and
// the row said "📘 sheet ready", which left Adrian to go and find the file —
// the one step between finishing a sheet and reading it was a manual hunt
// through /Self-Study/<Student>/ (31 Aug 2026).
//
// The path is read from the JOB, never from the query string: a route that
// redirects to whatever path it is handed is a way to read any file in the
// Dropbox app folder, and this one is reachable with a session cookie.
//
// Auth is the admin session cookie, because this is opened by clicking a link
// in a new tab — no Bearer header travels with that.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!dropboxConfigured()) return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });

  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }
  const kind = req.nextUrl.searchParams.get('kind') === 'pdf' ? 'pdf_path' : 'docx_path';

  const { data: job, error } = await getSupabaseAdmin()
    .from('sheet_jobs')
    .select('result, status')
    .eq('run_id', runId)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: 'no finished sheet for this paper' }, { status: 404 });

  const path = (job.result as Record<string, unknown> | null)?.[kind];
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return NextResponse.json({ error: 'the sheet job recorded no file path' }, { status: 404 });
  }

  try {
    return NextResponse.redirect(await getTemporaryLink(path));
  } catch (err) {
    // A sheet Adrian has since renamed or moved in Dropbox: say which file,
    // because the fix is to look for it, not to re-run the sheet.
    return NextResponse.json(
      { error: `could not open ${path}: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
