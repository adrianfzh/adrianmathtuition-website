// GET /api/portal/submit-token?filename=x.jpg
// A signed upload URL so a student's phone PUTs paper photos straight into the
// private student-files bucket — the 4.5MB platform body cap never sees them.
// Portal-session only (no admin flavour: Adrian tests as his own student
// account), and the key is pinned under THIS student's prefix
// (handins/<identity>/…), which is what lets the submit route treat "URL under
// my prefix" as proof of ownership. Until 5 Sep 2026 this minted a Vercel Blob
// client token for mark-paper/portal/<identity>/…; those legacy URLs are still
// accepted by the submit route.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { portalIdentity } from '@/lib/portal-auth';
import { createUploadUrl, handinKey, safeExt } from '@/lib/student-files';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts').select('id, airtable_student_id').eq('id', user.id).single();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const filename = url.searchParams.get('filename') || '';
  // ?kind=scheme (10 Sep 2026): the Science tab's optional mark scheme may be a
  // PDF as well as photos. Same student prefix, same ownership proof — the
  // submit route accepts a scheme URL exactly as it accepts a page URL.
  const scheme = url.searchParams.get('kind') === 'scheme';
  const ext = safeExt(filename, scheme ? ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'] : ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], 'jpg');
  // portalIdentity, not the raw airtable id: a stranger's prefix is
  // `acct:<uuid>` — the submit route checks the SAME identity.
  try {
    const u = await createUploadUrl(handinKey(portalIdentity(account), ext));
    return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
  } catch (e) {
    console.error('[submit-token]', (e as Error).message);
    return NextResponse.json({ error: 'could not start the upload' }, { status: 503 });
  }
}
