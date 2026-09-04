// GET /api/files/<key> — the ONLY door to a student's files (lib/student-files.ts).
//
// The `student-files` bucket is private; bytes leave it through this route and
// nowhere else. Who may read what:
//   • Adrian — admin session cookie or the ADMIN_PASSWORD bearer (the bot sends
//     that same bearer, so the marking pipeline's fetches of originals, annotated
//     pages and PDFs come through here too).
//   • A signed-in student — only files they OWN:
//       runs/<runId>/…        the run is tagged to them AND released (the same
//                             gate as /app/marking and marking-pdf; nothing
//                             pre-release ever reaches a student, however they
//                             got the URL)
//       handins|clippings|assignments/<identity>/…   identity matches the session
//     Everything else (uploads/, inbox/) is Adrian-only.
//   • Nobody else: 401, never a redirect (this serves <img src> and PDF viewers).
//
// Streams the object with its content type, `inline` under its own filename,
// private no-store caching. Legacy Vercel Blob URLs are NOT served here — they
// stay direct until the backfill moves them.

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidKey, ownerOf, downloadStudentFile, contentTypeFor } from '@/lib/student-files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function deny(status = 401) {
  return NextResponse.json({ error: status === 404 ? 'not found' : 'unauthorized' }, { status });
}

async function studentMayRead(key: string): Promise<boolean> {
  const account = await sessionAccount();
  if (!account) return false;
  const identity = portalIdentity(account);
  const owner = ownerOf(key);
  if (owner.kind === 'student') return owner.identity === identity;
  const sb = getSupabaseAdmin();
  if (owner.kind === 'run') {
    const { data } = await sb
      .from('paper_marking_runs')
      .select('student_id, released_at')
      .eq('id', owner.runId)
      .maybeSingle<{ student_id: string | null; released_at: string | null }>();
    return !!data && data.student_id === identity && data.released_at !== null;
  }
  // uploads/<uuid>/… — a file that existed before its run did (Adrian's own
  // ▶ Mark path uploads originals first; the bot's annotated pages of such a run
  // land there too). A student may read it only if one of THEIR OWN released
  // runs references it — the scan is over that student's released rows only,
  // so it stays cheap and can never reach across students.
  if (key.startsWith('uploads/')) {
    const { data: rows } = await sb
      .from('paper_marking_runs')
      .select('id, result_json, pdf_url, photos_pdf_url, annotated_pdf_url')
      .eq('student_id', identity)
      .not('released_at', 'is', null)
      .limit(200);
    const needle = `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
    return (rows ?? []).some(r => JSON.stringify(r).includes(needle));
  }
  return false;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  let key: string;
  try { key = (parts || []).map(decodeURIComponent).join('/'); } catch { return deny(404); }
  if (!isValidKey(key)) return deny(404);

  const allowed = verifyAdminAuth(req) || await studentMayRead(key);
  if (!allowed) return deny(401);

  let blob: Blob;
  try { blob = await downloadStudentFile(key); }
  catch (e) {
    console.warn('[files] download failed', key, (e as Error).message);
    return deny(404);
  }
  const name = key.split('/').pop() || 'file';
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new NextResponse(blob.stream(), {
    status: 200,
    headers: {
      'Content-Type': blob.type || contentTypeFor(key),
      'Content-Length': String(blob.size),
      'Content-Disposition': `inline; filename="${ascii}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
