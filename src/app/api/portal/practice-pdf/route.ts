// GET /api/portal/practice-pdf?run=<paper_marking_runs.id>
//
// Renders the logged-in student's follow-up practice for ONE released run as a
// PDF worksheet — the download behind "⬇ Download as a worksheet" on
// /app/marking. On-demand (nothing stored): a run's practice list is small and
// a student downloads it once or twice, so a ~2s Puppeteer render beats keeping
// a second artifact in Blob in sync with triage edits.
//
// Access control mirrors /app/marking exactly: service-key read scoped to the
// session student's Airtable id, released runs only — and buildStudentMarking
// re-enforces the release gate on top (its invariant #1).

import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildStudentMarking, type MarkingRunRow } from '@/lib/portal-marking';
import { buildPracticePdfHtml, practicePdfFilename } from '@/lib/practice-pdf';
import { getBrowser } from '@/lib/generate-pdf';

export const dynamic = 'force-dynamic';
// Puppeteer cold start + KaTeX font fetch can push past the 10s default.
export const maxDuration = 60;

// Same single-literal rule as /app/marking: supabase-js types the row off this
// string, and concatenation widens it to `string`.
const COLUMNS =
  'id, created_at, paper_name, total_awarded, total_max, annotated_pdf_url, pdf_url, released_at, result_json';

export async function GET(req: NextRequest) {
  const { account } = await currentStudent(); // no session → redirect to /login

  const runId = (req.nextUrl.searchParams.get('run') || '').trim();
  if (!runId) return NextResponse.json({ error: 'run is required' }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('paper_marking_runs')
    .select(COLUMNS)
    .eq('id', runId)
    .eq('student_id', portalIdentity(account))
    .not('released_at', 'is', null)
    .is('superseded_by', null)   // a superseded run is off the student's list; its practice link 404s
    .limit(1);

  const paper = buildStudentMarking((data ?? []) as MarkingRunRow[]).papers[0];
  if (!paper) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (paper.practice.length === 0) {
    return NextResponse.json({ error: 'no practice for this paper' }, { status: 404 });
  }

  // Bank-pick items (a `questions.id` uuid) print their marks, exam-style;
  // generated items (id null) never do. One query for the whole paper — and
  // fail-soft, since a lookup hiccup should never block the download itself.
  const bankIds = [...new Set(paper.practice.map(it => it.id).filter((id): id is string => !!id))];
  let marksById: Record<string, number> | undefined;
  if (bankIds.length > 0) {
    try {
      const { data: qRows, error } = await sb.from('questions').select('id, total_marks').in('id', bankIds);
      if (!error && qRows) {
        marksById = {};
        for (const q of qRows as { id: string; total_marks: number | null }[]) {
          if (typeof q.total_marks === 'number' && q.total_marks > 0) marksById[q.id] = q.total_marks;
        }
      }
    } catch {
      // no marks map — the PDF still renders, just without the [n] brackets
    }
  }

  const html = buildPracticePdfHtml(paper, account.display_name, marksById);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // networkidle0 covers the KaTeX stylesheet; fonts.ready covers its webfonts
    // (same belt-and-braces as the invoice renderer).
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.evaluate(() => document.fonts?.ready);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '15mm', right: '15mm' },
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${practicePdfFilename(paper.name)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } finally {
    await page.close().catch(() => {});
  }
}
