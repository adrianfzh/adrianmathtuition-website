// GET /api/admin/mark-paper-annotated-token?runId=<uuid>&filename=x.pdf[&type=page|original|paper]
// A signed upload URL so the browser PUTs big marking artefacts straight into the
// private student-files bucket — never through a function body (4.5MB cap). Four
// flavours (the answer is always {uploadUrl, key, url}; the client PUTs to
// uploadUrl and hands `url` on — lib/student-files-client.ts):
//   (default)      the Notability round trip's exported PDF (5–20MB), linked to the
//                  run afterwards via phase 'link-pdf' / kind 'annotated'.
//   type=page      ONE flattened page JPEG from the ✏️ Annotate overlay (the page
//                  image with Adrian's ink baked in) — the assemble route stitches
//                  these into the annotated PDF server-side.
//   type=original  ONE full-resolution working photo (~2600px), uploaded BEFORE the
//                  run exists (the run id is minted by the marking call itself), so
//                  this flavour takes no runId and lands under uploads/<uuid>/. Its
//                  URL rides the 'direct' phase body as `originalUrl` and the bot
//                  composites the red pen onto it instead of the ~1280px marking
//                  copy (blur fix, 2 Aug 2026).
//   type=paper     the question-paper PDF, stored so a run can be RE-MARKED later
//                  without the browser re-attaching it. Pre-run like originals.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createUploadUrl, runKey, uploadKey, safeExt } from '@/lib/student-files';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const kind = req.nextUrl.searchParams.get('type') || '';
  const filename = req.nextUrl.searchParams.get('filename') || '';
  let key: string;

  if (kind === 'paper') {
    key = uploadKey('paper.pdf');
  } else if (kind === 'original') {
    const ext = safeExt(filename, ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'], 'jpg');
    key = uploadKey(`original.${ext}`);
  } else {
    const runId = req.nextUrl.searchParams.get('runId') || '';
    // paper_marking_runs ids are uuids; the key embeds it so the file is traceable
    // back to its run even if the DB link write fails — and so the run's student can
    // read it once the run is released.
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'bad runId' }, { status: 400 });
    key = kind === 'page'
      ? runKey(runId, `annotate-pages/${crypto.randomUUID()}.jpg`)
      : runKey(runId, `annotated-${crypto.randomUUID()}.pdf`);
  }

  try {
    const u = await createUploadUrl(key);
    return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
  } catch (e) {
    console.error('[mark-paper-annotated-token]', (e as Error).message);
    return NextResponse.json({ error: 'could not start the upload' }, { status: 503 });
  }
}
