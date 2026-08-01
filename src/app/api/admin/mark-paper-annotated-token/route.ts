// GET /api/admin/mark-paper-annotated-token?runId=<uuid>&filename=x.pdf[&type=page]
// Short-lived client token so the browser PUTs big annotate artefacts straight to
// Vercel Blob — never through a function body (4.5MB cap). Two flavours:
//   (default)    the Notability round trip's exported PDF (5–20MB), linked to the
//                run afterwards via phase 'link-pdf' / kind 'annotated'.
//   type=page    ONE flattened page JPEG from the ✏️ Annotate overlay (the page
//                image with Adrian's ink baked in) — the assemble route stitches
//                these into the annotated PDF server-side.
import { NextRequest, NextResponse } from 'next/server';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runId = req.nextUrl.searchParams.get('runId') || '';
  // paper_marking_runs ids are uuids; the pathname embeds it so the file is traceable
  // back to its run even if the DB link write fails.
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'bad runId' }, { status: 400 });

  const isPage = req.nextUrl.searchParams.get('type') === 'page';
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
