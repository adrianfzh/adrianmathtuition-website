// GET /api/portal/print-paper/pdf?id=<portal_generated_papers.id>
//
// Renders one generated paper as its printable PDF, on demand — nothing is
// stored (same reasoning as practice-pdf: a row is small, a render is ~2s, and
// an artifact in Blob would need keeping in sync). The stored question_ids ARE
// the paper: re-downloading always reprints exactly the sheet that was
// generated, figures included.
//
// All presets render through renderPrelimPDF, marks-scaled working space and
// the answer KEY on its own final page. A MOCK (and a SET paper — the same
// exam shape with a fixed question list, lib/print-sets) renders in exam format — page-1
// cover (centre name, subject code, duration, candidate boxes), questions from
// page 2, Page N of M footers, [Turn over, END OF PAPER — while topics/
// weak-spots sheets keep the worksheet-style header (a topic sheet is not an
// exam). Never worked solutions (kiosk invariant D7): those arrive via marking
// or /solutions.
import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { shapeFromTitle, toPaperShape, type PaperShape, type PrintQuestionRef } from '@/lib/print-paper';
import { paperFilename, renderRefPaperPdf } from '@/lib/render-ref-paper';

export const dynamic = 'force-dynamic';
// Puppeteer cold start + KaTeX fonts can push past the 10s default.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { account } = await currentStudent(); // no session → redirect to /login

  const id = (req.nextUrl.searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from('portal_generated_papers')
    .select('id, preset, level, paper, title, question_ids, total_marks, created_at')
    .eq('id', id)
    .eq('airtable_student_id', portalIdentity(account))
    .limit(1);
  const row = rows?.[0];
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const refs = (row.question_ids ?? []) as PrintQuestionRef[];
  if (!refs.length) return NextResponse.json({ error: 'empty paper' }, { status: 404 });

  const printed = new Date(row.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
  // Which SHAPE this paper was built to. The row has no column for it (no
  // request-details jsonb on portal_generated_papers), so the stored title is
  // the carrier — ?shape= is only an override for a caller that knows better.
  const shape: PaperShape = req.nextUrl.searchParams.has('shape')
    ? toPaperShape(req.nextUrl.searchParams.get('shape'))
    : shapeFromTitle(row.title);
  // The render itself lives in lib/render-ref-paper (shared with the Next lesson card, 5 Oct 2026).
  const out = await renderRefPaperPdf(sb, {
    preset: row.preset, level: row.level, paper: row.paper, title: row.title, refs,
    printedFor: account.display_name, printedOn: printed, shape,
  });
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
  const { pdf } = out;

  const filename = paperFilename(row.title);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
