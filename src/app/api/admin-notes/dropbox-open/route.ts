import { NextRequest, NextResponse } from 'next/server';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { getTemporaryLink, dropboxConfigured } from '@/lib/dropbox';

export const runtime = 'nodejs';

// GET /api/admin-notes/dropbox-open?path=/em/foo.pdf
// Mints a fresh Dropbox temporary link (~4h) for the file and 302-redirects to it,
// so links opened from /admin/notes are never stale. Admin-auth via session cookie
// (the tab is opened same-origin from the notes page).
export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!dropboxConfigured()) {
    return NextResponse.json({ error: 'Dropbox not configured' }, { status: 503 });
  }
  const path = req.nextUrl.searchParams.get('path');
  if (!path || !path.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  try {
    const link = await getTemporaryLink(path);
    return NextResponse.redirect(link);
  } catch (err) {
    return NextResponse.json({ error: `Dropbox link failed: ${(err as Error).message}` }, { status: 502 });
  }
}
