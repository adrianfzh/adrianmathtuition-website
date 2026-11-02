// POST /api/admin/annotate-side/extras { runId, q } — question q for the ✏️ Annotate side
// panel with its maths typeset and the scheme marks (M1, A1, B1) on the worked-solution
// lines that earn them (Adrian, 2 Nov 2026). Made once by a model and kept with the run
// (lib/annotate/side-extras.ts refuses any copy that changed the working).
// → { itemHtml, questionHtml } — the solutions page swaps the question's block for itemHtml;
// the panel shows questionHtml. Admin only. SPEC-ANNOTATE §21.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun, makeSideExtras, sideItemFor } from '@/lib/annotate-side-store';
import { applyExtras } from '@/lib/annotate/side-extras';
import { itemHtml } from '@/lib/render-solutions-pdf';
import { mathHtml } from '@/lib/math-inline';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { runId?: string; q?: string };
  const runId = String(body.runId || '');
  const q = String(body.q || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !q || q.length > 12) return NextResponse.json({ error: 'runId and q required' }, { status: 400 });
  const run = await loadSideRun(runId);
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  const ex = await makeSideExtras(run, q);
  const item = await sideItemFor(run, q);
  return NextResponse.json({
    itemHtml: item && ex ? itemHtml(applyExtras(item, ex), 0, true) : null,
    questionHtml: ex?.questionLatex ? mathHtml(ex.questionLatex) : null,
  });
}
