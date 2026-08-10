// GET /api/admin/prelim-builder/export?id=<draftId>[&space=0] — render a saved
// draft as the mock-exam PDF (questions + marks-scaled working space + answer
// key page). Deterministic: draft slots → full QB rows → render-prelim.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { createServiceClient } from '@/lib/supabase-server';
import { renderPrelimPDF, type PrelimQuestion } from '@/lib/render-prelim';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface PartRow {
  label?: string;
  text?: string;
  marks?: number;
  answer?: string;
  subparts?: PartRow[];
}

interface QbFull {
  id: string;
  question_text: string | null;
  total_marks: number;
  parts: PartRow[] | null;
  answer: string | null;
  has_image: boolean | null;
  image_url: string | null;
}

function storageUrl(raw: string | null): string | null {
  if (!raw) return null;
  let path = raw;
  if (path.startsWith('[')) {
    try {
      const arr = JSON.parse(path);
      if (!Array.isArray(arr) || arr.length === 0) return null;
      path = String(arr[0]);
    } catch {
      return null;
    }
  }
  path = path.replace(/^question_images\//, '');
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/question_images/${path}`;
}

// Flatten stem + parts (+subparts) into the markdown the renderer expects.
function questionMarkdown(q: QbFull): string {
  const chunks: string[] = [];
  if (q.question_text?.trim()) chunks.push(q.question_text.trim());
  for (const p of q.parts ?? []) {
    const label = p.label ? `(${p.label}) ` : '';
    if (p.subparts?.length) {
      if (p.text?.trim() || label) chunks.push(`${label}${(p.text ?? '').trim()}`.trim());
      for (const s of p.subparts) {
        const sm = s.marks ? `  [${s.marks}]` : '';
        chunks.push(`(${p.label ?? ''})(${s.label ?? ''}) ${(s.text ?? '').trim()}${sm}`);
      }
    } else {
      const marks = p.marks ? `  [${p.marks}]` : '';
      chunks.push(`${label}${(p.text ?? '').trim()}${marks}`.trim());
    }
  }
  return chunks.filter(Boolean).join('\n\n');
}

function answerMarkdown(q: QbFull): string {
  if (q.answer?.trim()) return q.answer.trim();
  const bits: string[] = [];
  for (const p of q.parts ?? []) {
    if (p.answer?.trim()) bits.push(`(${p.label ?? '?'}) ${p.answer.trim()}`);
    for (const s of p.subparts ?? []) {
      if (s.answer?.trim()) bits.push(`(${p.label ?? '?'})(${s.label ?? '?'}) ${s.answer.trim()}`);
    }
  }
  return bits.join('  ');
}

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

    const paperCode = draft.level === 'AM' ? '4049' : '4052';
    const pdf = await renderPrelimPDF({
      title: `${draft.level === 'AM' ? 'ADDITIONAL ' : ''}MATHEMATICS ${paperCode}/${draft.paper === 'P1' ? '01' : '02'}`,
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
