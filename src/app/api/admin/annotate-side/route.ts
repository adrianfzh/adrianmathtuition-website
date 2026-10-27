// GET /api/admin/annotate-side?runId= — the ✏️ Annotate side panel's starting facts:
// the question paper (same-origin path, or null), each page's questions, the printed
// questions as the marker read them. Admin only. SPEC-ANNOTATE §21.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadSideRun, sideInfo } from '@/lib/annotate-side-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const runId = req.nextUrl.searchParams.get('runId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const run = await loadSideRun(runId);
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
  return NextResponse.json(sideInfo(run), { headers: { 'cache-control': 'no-store' } });
}
