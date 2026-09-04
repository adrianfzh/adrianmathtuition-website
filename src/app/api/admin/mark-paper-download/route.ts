import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { getSupabaseAdmin } from '@/lib/supabase';

// Hand the marked PDF to the Mac with a real filename. Blob URLs serve inline under a
// timestamp name; Adrian's send channel is dragging the file from Downloads into his
// PERSONAL WhatsApp on the Mac (bot-sent WhatsApp is out — the business number's 24h
// window), so "one click → nicely-named file in Downloads" IS the WhatsApp feature.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.searchParams.get('url') || '';
  if (!isOurFileUrl(url)) return NextResponse.json({ error: 'Bad URL' }, { status: 400 });

  const name = (req.nextUrl.searchParams.get('name') || 'marked-paper.pdf')
    .replace(/[^\w.\- ()]/g, '').slice(0, 120) || 'marked-paper.pdf';
  // inline = view in the tab but CARRY the clean filename — Notability (and any other
  // share-sheet import) titles the note from it, so opening PDFs through this route is
  // what turns "2026-07-31T16-17-30-359Z" into "Alexis Wong — Xinmin EM P2 — 1 Aug".
  const disposition = req.nextUrl.searchParams.get('disposition') === 'inline' ? 'inline' : 'attachment';

  // ⬇ Download for WhatsApp is the hand-to-parent step, so it marks the run checked
  // (Adrian, 19 Aug 2026). Only the send row passes ?run= — the history/library links
  // are for LOOKING at a copy and stay silent. Awaited: a fire-and-forget write can
  // be killed when the serverless response starts streaming.
  const run = req.nextUrl.searchParams.get('run') || '';
  if (/^[0-9a-f-]{36}$/i.test(run)) {
    try { await getSupabaseAdmin().from('paper_marking_runs').update({ checked_at: new Date().toISOString() }).eq('id', run); }
    catch (e) { console.warn('[mark-paper-download] checked_at failed', (e as Error).message); }
  }

  const r = await fetchOurFile(url);
  if (!r.ok) return NextResponse.json({ error: `fetch failed (${r.status})` }, { status: 502 });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': r.headers.get('content-type') || 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
