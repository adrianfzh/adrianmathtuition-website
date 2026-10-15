// GET /api/admin/school-exams/upload-token?studentId=rec…&filename=page1.jpg
// A signed upload URL so the Exams box PUTs one page of a school exam scan straight into
// the private student-files bucket (the 4.5 MB body cap never applies). uploads/ is
// Adrian-only (SPEC-EXAM-TRACKER.md).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createUploadUrl, uploadKey, safeExt } from '@/lib/student-files';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = (req.nextUrl.searchParams.get('studentId') || '').trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(studentId)) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  const ext = safeExt(req.nextUrl.searchParams.get('filename'), ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'], 'jpg');
  try {
    const u = await createUploadUrl(uploadKey(`school-exam-${studentId}-${Date.now()}.${ext}`));
    return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
  } catch (e) {
    console.error('[school-exams/upload-token]', (e as Error).message);
    return NextResponse.json({ error: 'could not start the upload' }, { status: 503 });
  }
}
