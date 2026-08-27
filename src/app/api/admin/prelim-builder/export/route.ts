// GET /api/admin/prelim-builder/export?id=<draftId>[&space=0] — render a saved
// draft as the mock-exam PDF (questions + marks-scaled working space + answer
// key page). Deterministic: draft slots → full QB rows → render-prelim.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { renderPrelimPDF, type PrelimQuestion } from '@/lib/render-prelim';
import { answerMarkdown, paperCodeFull, questionMarkdown, storageUrl, subjectName, type QbPrintRow } from '@/lib/print-paper';

export const runtime = 'nodejs';
export const maxDuration = 60;

// storageUrl / questionMarkdown / answerMarkdown moved to lib/print-paper.ts
// (2026-08-26) — shared with the student print-paper routes so admin exports
// and student sheets flatten questions identically.
type QbFull = QbPrintRow;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const workingSpace = req.nextUrl.searchParams.get('space') !== '0';

  try {
    const supabase = createServiceClient();
    const { data: draft, error: dErr } = await supabase
      .from('paper_drafts')
      .select('*')
      .eq('id', id)
      .single();
    if (dErr || !draft) return NextResponse.json({ error: dErr?.message || 'Draft not found' }, { status: 404 });

    const slots = (draft.slots ?? []) as {
      pos: number;
      pick: { id: string } | null;
    }[];
    const ids = slots.filter((s) => s.pick).map((s) => s.pick!.id);
    if (ids.length === 0) return NextResponse.json({ error: 'Draft has no picked questions' }, { status: 400 });

    const { data: rows, error: qErr } = await supabase
      .from('questions')
      .select('id, question_text, total_marks, parts, answer, has_image, image_url')
      .in('id', ids);
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    const byId = new Map((rows as QbFull[]).map((r) => [r.id, r]));

    const questions: PrelimQuestion[] = [];
    for (const s of slots) {
      if (!s.pick) continue;
      const q = byId.get(s.pick.id);
      if (!q) continue;
      questions.push({
        pos: s.pos,
        marks: q.total_marks,
        text: questionMarkdown(q),
        imageUrl: q.has_image ? storageUrl(q.image_url) : null,
        answer: answerMarkdown(q),
      });
    }

    // Subject name/code derivation shared with the student mock cover
    // (lib/print-paper.ts) — same strings as the old inline ternaries.
    const pdf = await renderPrelimPDF({
      title: `${subjectName(draft.level)} ${paperCodeFull(draft.level, draft.paper)}`,
      subtitle: `${draft.title || 'Prelim practice paper'} · ${draft.preset}${draft.difficulty === 'hard' ? ' · hard' : ''}`,
      questions,
      workingSpace,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="prelim-${draft.level}-${draft.paper}-${String(id).slice(0, 8)}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'export failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
