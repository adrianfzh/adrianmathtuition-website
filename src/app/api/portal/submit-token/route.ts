// GET /api/portal/submit-token?filename=x.jpg
// Short-lived client token so a student's phone PUTs paper photos straight to
// Vercel Blob — the 4.5MB platform body cap never sees them. Portal-session
// only (no admin flavour: Adrian tests as his own student account), and the
// pathname is pinned under THIS student's prefix, which is what lets the
// submit route treat "URL under my prefix" as proof of ownership.
import { NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { createSupabaseServer } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts').select('id, airtable_student_id').eq('id', user.id).single();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const filename = new URL(req.url).searchParams.get('filename') || '';
  const rawExt = (filename.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg').toLowerCase();
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(rawExt) ? rawExt : 'jpg';
  // portalIdentity, not the raw airtable id: a stranger's prefix is
  // `acct:<uuid>` — the submit route checks the SAME identity, so ownership
  // proof-by-prefix keeps working for both kinds of account.
  const pathname = `mark-paper/portal/${portalIdentity(account)}/${crypto.randomUUID()}.${ext}`;
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    pathname,
    onUploadCompleted: { callbackUrl: '' },   // the submit route records the URLs itself
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/octet-stream'],
    maximumSizeInBytes: 25 * 1024 * 1024,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  return NextResponse.json({ token, pathname });
}
