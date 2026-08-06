// Bust the /notes data cache from outside the app.
//
// The review UI's own writes invalidate the tag in-process; this endpoint is
// for the content-prep scripts, which write to Supabase directly and would
// otherwise wait out the cache TTL. Bearer ADMIN_PASSWORD, same as every
// admin API:
//
//   curl -X POST -H "Authorization: Bearer $ADMIN_PASSWORD" \
//        https://adrianmath-dev.vercel.app/api/notes-revalidate

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { NOTES_CACHE_TAG } from '@/lib/notes-data';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  revalidateTag(NOTES_CACHE_TAG, 'max');
  return NextResponse.json({ ok: true });
}
