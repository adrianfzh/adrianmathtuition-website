// GET /api/admin/student-materials/pdf?id=<student_materials.id> — the PDF of
// one item on the Next lesson card (5 Oct 2026). Admin only.
//   - a stored sheet (bank worksheet, a Practice Again PDF) → served from where it lives
//   - a Set paper → rendered now from its question refs by lib/render-ref-paper,
//     the same renderer the students' Print-a-paper uses (exam cover, answer key last)
// `inline` so the phone / iPad opens it in its viewer and prints from there.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchOurFile, isOurFileUrl } from '@/lib/student-files';
import { paperFilename, renderRefPaperPdf } from '@/lib/render-ref-paper';
import { loadStudent } from '@/lib/next-lesson-store';
import type { PrintQuestionRef } from '@/lib/print-paper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: m } = await sb.from('student_materials').select('*').eq('id', id).maybeSingle();
  if (!m) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const headers = (name: string) => ({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${name}"`,
    'Cache-Control': 'private, no-store',
  });

  if (m.kind === 'set') {
    const meta = (m.meta ?? {}) as { refs?: PrintQuestionRef[]; paper?: string; setLevel?: string };
    const student = await loadStudent(m.airtable_student_id);
    const printedOn = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
    const out = await renderRefPaperPdf(sb, {
      preset: 'set', level: meta.setLevel ?? m.level ?? 'EM', paper: meta.paper ?? null, title: m.title,
      refs: meta.refs ?? [], printedFor: student?.name ?? null, printedOn, shape: 'gce',
    });
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return new NextResponse(new Uint8Array(out.pdf), { headers: headers(paperFilename(m.title)) });
  }

  if (!m.file_url) return NextResponse.json({ error: m.error || 'this item has no PDF' }, { status: 404 });
  if (isOurFileUrl(m.file_url)) {
    const r = await fetchOurFile(m.file_url);
    if (!r.ok) return NextResponse.json({ error: `file: HTTP ${r.status}` }, { status: 502 });
    return new NextResponse(new Uint8Array(await r.arrayBuffer()), { headers: headers(paperFilename(m.title)) });
  }
  return NextResponse.redirect(m.file_url, 302);
}
