// POST /api/admin/annotate-side/diagram { runId, q, make? } — a diagram for question q's
// worked solution in the ✏️ Annotate side panel, drawn by the figure library (verify fails
// closed) and kept with the run, so it is made once. { status: 'ok', url } | { status: 'none', why }.
// Admin only. SPEC-ANNOTATE §21.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun, sideDiagram } from '@/lib/annotate-side-store';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { runId?: string; q?: string; make?: boolean };
  const runId = String(body.runId || '');
  const q = String(body.q || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !q || q.length > 12) return NextResponse.json({ error: 'runId and q required' }, { status: 400 });
  const run = await loadSideRun(runId);
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  return NextResponse.json(await sideDiagram(run, q, { make: body.make !== false }));
}
