import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurBlobUrl } from '@/lib/blob-url';

// Hand the marked PDF to the Mac with a real filename. Blob URLs serve inline under a
// timestamp name; Adrian's send channel is dragging the file from Downloads into his
// PERSONAL WhatsApp on the Mac (bot-sent WhatsApp is out — the business number's 24h
// window), so "one click → nicely-named file in Downloads" IS the WhatsApp feature.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.searchParams.get('url') || '';
  if (!isOurBlobUrl(url)) return NextResponse.json({ error: 'Bad URL' }, { status: 400 });

  const name = (req.nextUrl.searchParams.get('name') || 'marked-paper.pdf')
    .replace(/[^\w.\- ()]/g, '').slice(0, 120) || 'marked-paper.pdf';
  // inline = view in the tab but CARRY the clean filename — Notability (and any other
  // share-sheet import) titles the note from it, so opening PDFs through this route is
  // what turns "2026-07-31T16-17-30-359Z" into "Alexis Wong — Xinmin EM P2 — 1 Aug".
  const disposition = req.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

  const r = await fetch(url);
  if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': r.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
