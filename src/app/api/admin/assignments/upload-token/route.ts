// GET /api/admin/assignments/upload-token?studentId=rec…&filename=worksheet.pdf
// A signed upload URL so the Send-work card PUTs a worksheet PDF straight into
// the private student-files bucket (platform 4.5MB body cap never applies). The
// key sits under assignments/<studentId>/ so the student it is for — and only
// them — can open it through /api/files; the URL that comes back is what gets
// stored as portal_assignments.pdf_url.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createUploadUrl, assignmentKey } from '@/lib/student-files';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = (req.nextUrl.searchParams.get('studentId') || '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  try {
    const u = await createUploadUrl(assignmentKey(studentId));
    return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
  } catch (e) {
    console.error('[assignments/upload-token]', (e as Error).message);
    return NextResponse.json({ error: 'could not start the upload' }, { status: 503 });
  }
}
