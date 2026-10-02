// GET /api/portal/marked-papers-zip — "Download all my marked papers" (2 Oct 2026).
//
// One zip of every marked paper released to the signed-in student: the copy
// they see in the app (Adrian's pen > the red-pen pages > the full report — the
// same precedence as /api/portal/marking-pdf), named the same way. A re-marked
// paper's older copy (superseded_by) is left out.
//
// Reachable AFTER an account is deactivated, on purpose: only a session is
// checked, never a pass — a student who has left can still take their papers
// (the door is on /app/pass, lib/portal-passes offboarding). Identity + released
// filter mirror /api/portal/export exactly.
//
// The zip is streamed one paper at a time (lib/zip-store.ts), so memory holds a
// single PDF however many papers there are. A paper whose file cannot be read is
// skipped and listed in "papers not included.txt" rather than failing the lot.

import { NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isOurFileUrl, fetchOurFile } from '@/lib/student-files';
import { markedPdfFilename, contentDisposition } from '@/lib/marked-pdf-filename';
import { displayPaperName } from '@/lib/paper-display-name';
import { ZipStoreWriter, uniqueZipName } from '@/lib/zip-store';
import { sgtTodayISO } from '@/lib/sgt';
import { sendTelegram } from '@/lib/telegram';
import { leaverNotice } from '@/lib/leaver-notice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

type Row = {
  id: string; created_at: string; paper_name: string | null;
  annotated_pdf_url: string | null; photos_pdf_url: string | null; pdf_url: string | null;
};

export async function GET() {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const identity = portalIdentity(account);

  const { data, error } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .select('id, created_at, paper_name, annotated_pdf_url, photos_pdf_url, pdf_url')
    .eq('student_id', identity)
    .not('released_at', 'is', null)
    .is('superseded_by', null)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) return NextResponse.json({ error: 'could not read your papers' }, { status: 500 });
  const rows = (data ?? []) as Row[];

  const name = account.display_name ?? null;

  // Tell Adrian (2 Oct 2026: "send me telegram notifications if students download
  // their papers or delete their accounts"). Never blocks the download.
  try {
    await sendTelegram(leaverNotice('download', { name, email: account.email, papers: rows.length, left: Boolean(account.deactivated_at) }));
  } catch (e) { console.error('[marked-papers-zip] notice failed:', (e as Error).message); }
  const writer = new ZipStoreWriter();
  const used = new Set<string>();
  const missed: string[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const row of rows) {
          const paper = displayPaperName(row.paper_name, name).replace(/\s*·\s*/g, ' ');
          const filename = markedPdfFilename({ studentName: name, paperName: paper, dateISO: row.created_at, kind: 'marked' })
            .replace(/\s*[—–]\s*/g, ' - ');   // plain hyphens inside the zip: the Mac's command-line unzip refuses an em dash in a name
          const url = row.annotated_pdf_url || row.photos_pdf_url || row.pdf_url;
          let bytes: Uint8Array | null = null;
          if (url && isOurFileUrl(url)) {
            try {
              const r = await fetchOurFile(url);
              if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
            } catch { /* listed below */ }
          }
          if (!bytes || !bytes.length || !writer.fits(bytes.length)) { missed.push(filename.replace(/\.pdf$/i, '')); continue; }
          controller.enqueue(writer.entry(uniqueZipName(filename, used), bytes, new Date(row.created_at)));
        }
        if (missed.length || !rows.length) {
          const text = rows.length
            ? `These papers could not be added to the zip. Open them in the app, or ask Adrian.\n\n${missed.join('\n')}\n`
            : 'No marked papers have been released to this account yet.\n';
          controller.enqueue(writer.entry(rows.length ? 'papers not included.txt' : 'no papers yet.txt', new TextEncoder().encode(text)));
        }
        controller.enqueue(writer.finish());
        controller.close();
      } catch (e) {
        console.error('[marked-papers-zip]', (e as Error).message);
        controller.error(e);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(`AdrianMath marked papers ${sgtTodayISO()}.zip`, 'attachment'),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
