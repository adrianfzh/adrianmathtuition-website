// GET /api/portal/print-paper/pdf?id=<portal_generated_papers.id>
//
// Renders one generated paper as its printable PDF, on demand — nothing is
// stored (same reasoning as practice-pdf: a row is small, a render is ~2s, and
// an artifact in Blob would need keeping in sync). The stored question_ids ARE
// the paper: re-downloading always reprints exactly the sheet that was
// generated, figures included.
//
// All presets render through renderPrelimPDF, marks-scaled working space and
// the answer KEY on its own final page. A MOCK renders in exam format — page-1
// cover (centre name, subject code, duration, candidate boxes), questions from
// page 2, Page N of M footers, [Turn over, END OF PAPER — while topics/
// weak-spots sheets keep the worksheet-style header (a topic sheet is not an
// exam). Never worked solutions (kiosk invariant D7): those arrive via marking
// or /solutions.
import { NextRequest, NextResponse } from 'next/server';
import { currentStudent, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderPrelimPDF, type PrelimQuestion } from '@/lib/render-prelim';
import {
  MOCK_COVER_INSTRUCTIONS,
  answerMarkdown,
  mockCover,
  questionMarkdown,
  storageUrl,
  type QbPrintRow,
  type PrintQuestionRef,
} from '@/lib/print-paper';

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

  const { data: qRows, error } = await sb
    .from('questions')
    .select('id, question_text, total_marks, parts, answer, has_image, image_url')
    .in('id', refs.map(r => r.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const byId = new Map((qRows as QbPrintRow[]).map(q => [q.id, q]));

  const questions: PrelimQuestion[] = [];
  for (const ref of refs) {
    const q = byId.get(ref.id);
    if (!q) continue; // a question deleted since generation — skip, keep order
    questions.push({
      pos: ref.pos,
      marks: q.total_marks,
      text: questionMarkdown(q),
      imageUrl: q.has_image ? storageUrl(q.image_url) : null,
      answer: answerMarkdown(q),
    });
  }
  if (!questions.length) return NextResponse.json({ error: 'no questions left on this paper' }, { status: 404 });

  const printed = new Date(row.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
  const isMock = row.preset === 'mock' && (row.paper === 'P1' || row.paper === 'P2');
  const pdf = await renderPrelimPDF({
    title: row.title.toUpperCase(),
    subtitle: `Printed for ${account.display_name || 'you'} · ${printed} · AdrianMath`,
    questions,
    workingSpace: true,
    ...(isMock
      ? {
          cover: mockCover(row.level, row.paper as string, {
            printedFor: account.display_name,
            printedOn: printed,
          }),
          instructions: MOCK_COVER_INSTRUCTIONS,
        }
      : {}),
  });

  const filename = `${row.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'paper'}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
