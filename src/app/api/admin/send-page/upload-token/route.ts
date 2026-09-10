// GET /api/admin/send-page/upload-token?filename=formula-sheet.pdf
// A signed upload URL for ONE page file that every chosen student will read:
// the key sits under pages/<uuid>.<ext> in the private student-files bucket
// (lib/student-files pageKey), which the /api/files gate opens to any logged-in
// student — it is Adrian's material, not a student's data. The URL that comes
// back is what /api/admin/send-page stores as portal_assignments.pdf_url.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createUploadUrl, pageKey } from '@/lib/student-files';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const filename = (req.nextUrl.searchParams.get('filename') || '').trim();
  try {
    const u = await createUploadUrl(pageKey(filename));
    return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
  } catch (e) {
    console.error('[send-page/upload-token]', (e as Error).message);
    return NextResponse.json({ error: 'could not start the upload' }, { status: 503 });
  }
}
