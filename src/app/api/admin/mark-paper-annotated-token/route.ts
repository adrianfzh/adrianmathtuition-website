// GET /api/admin/mark-paper-annotated-token?runId=<uuid>&filename=x.pdf[&type=page|original]
// Short-lived client token so the browser PUTs big annotate artefacts straight to
// Vercel Blob — never through a function body (4.5MB cap). Three flavours:
//   (default)      the Notability round trip's exported PDF (5–20MB), linked to the
//                  run afterwards via phase 'link-pdf' / kind 'annotated'.
//   type=page      ONE flattened page JPEG from the ✏️ Annotate overlay (the page
//                  image with Adrian's ink baked in) — the assemble route stitches
//                  these into the annotated PDF server-side.
//   type=original  ONE full-resolution working photo (~2600px), uploaded BEFORE the
//                  run exists (the run id is minted by the marking call itself), so
//                  this flavour alone takes no runId. Its URL rides the 'direct'
//                  phase body as `originalUrl` and the bot composites the red pen
//                  onto it instead of the ~1280px marking copy (blur fix, 2 Aug 2026).
import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const kind = req.nextUrl.searchParams.get('type') || '';

  // The question-paper PDF, stored so a run can be RE-MARKED later without the
  // browser re-attaching it (phase:'remark'). Like originals: pre-run, no runId.
  if (kind === 'paper') {
    const pathname = `mark-paper/papers/${crypto.randomUUID()}.pdf`;
    const token = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      onUploadCompleted: { callbackUrl: '' },
      allowedContentTypes: ['application/pdf', 'application/octet-stream'],
      maximumSizeInBytes: 60 * 1024 * 1024,
      validUntil: Date.now() + 10 * 60 * 1000,
    });
    return NextResponse.json({ token, pathname });
  }

  if (kind === 'original') {
    const filename = req.nextUrl.searchParams.get('filename') || '';
    const rawExt = (filename.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg').toLowerCase();
    const ext = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(rawExt) ? rawExt : 'jpg';
    const pathname = `mark-paper/originals/${crypto.randomUUID()}.${ext}`;
    const token = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      onUploadCompleted: { callbackUrl: '' },   // the URL rides the marking request body
      allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/octet-stream'],
      maximumSizeInBytes: 40 * 1024 * 1024,
      validUntil: Date.now() + 10 * 60 * 1000,
    });
    return NextResponse.json({ token, pathname });
  }

  const runId = req.nextUrl.searchParams.get('runId') || '';
  // paper_marking_runs ids are uuids; the pathname embeds it so the file is traceable
  // back to its run even if the DB link write fails.
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'bad runId' }, { status: 400 });

  const isPage = kind === 'page';
  const pathname = isPage
    ? `mark-paper/annotate-pages/${runId}-${crypto.randomUUID()}.jpg`
    : `mark-paper/annotated-final/${runId}-${crypto.randomUUID()}.pdf`;
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    pathname,
    onUploadCompleted: { callbackUrl: '' },   // the page/assemble route does the linking itself
    allowedContentTypes: isPage
      ? ['image/jpeg', 'image/png']
      : ['application/pdf', 'application/octet-stream'],
    maximumSizeInBytes: (isPage ? 30 : 100) * 1024 * 1024,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  return NextResponse.json({ token, pathname });
}
