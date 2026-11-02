// GET /api/admin/annotate-side/paper?runId= — the run's question paper PDF, served from our
// own site for the ✏️ Annotate side panel. A paper picked from the paper library is stored
// on the run as a signed storage link, which expires (and is cross-site): the panel showed
// "Could not open the question paper: Load failed" (Adrian, 2 Nov 2026). Here the bucket
// path is read out of that link and a fresh link is minted with the server key. Admin only.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun } from '@/lib/annotate-side-store';
import { fileHref } from '@/lib/student-files';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

/** `…/storage/v1/object/(sign|public)/<bucket>/<path>?…` → bucket + path, else null. */
function storagePath(u: string): { bucket: string; path: string } | null {
  try {
    const m = new URL(u).pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
    return m ? { bucket: m[1], path: m[2].split('/').map(decodeURIComponent).join('/') } : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const run = await loadSideRun(runId);
  const url = ((run?.result_json?.source ?? {}) as { paper_pdf_url?: string | null }).paper_pdf_url;
  if (!url) return NextResponse.json({ error: 'no question paper' }, { status: 404 });

  // A redirect, never the bytes: a combined paper is ~5 MB, over Vercel's 4.5 MB response cap.
  // The panel fetches with credentials 'same-origin', so no cookie goes to the storage host
  // (a credentialed fetch against its wildcard CORS is refused — that was the "Load failed").
  const sp = storagePath(url);
  if (sp && sp.bucket === 'paper-library') {
    const { data, error } = await getSupabaseAdmin().storage.from(sp.bucket).createSignedUrl(sp.path, 3600);
    if (error || !data?.signedUrl) return NextResponse.json({ error: `paper not found (${error?.message || 'no link'})` }, { status: 404 });
    return NextResponse.redirect(data.signedUrl, { status: 307, headers: { 'cache-control': 'no-store' } });
  }
  const href = fileHref(url);
  if (!href.startsWith('/')) return NextResponse.json({ error: 'not our file' }, { status: 400 });
  return NextResponse.redirect(new URL(href, req.nextUrl.origin), { status: 307, headers: { 'cache-control': 'no-store' } });
}
