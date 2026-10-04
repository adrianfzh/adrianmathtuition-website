// /api/admin/humanities — Adrian's view of every humanities answer, and the
// bench's door (SPEC-HUMANITIES.md §4, 2 Oct 2026).
//   GET                 → { runs: [...] }  newest first, list columns only (?set= one bench run)
//   GET ?id=<uuid>      → { run }          the whole row, reads included
//   POST { questionId, answer, calibrationSet, label?, truthLevel? }
//                       → { id }           a bench hand-in: read exactly as a student's
//                                          would be, filed under the set, in no student's list
// Bearer ADMIN_PASSWORD or the admin session cookie; the health-check probes the 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadAllHumanities, loadHumanitiesRun } from '@/lib/humanities-runs';
import { submitHumanities } from '@/lib/humanities-submit';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const run = await loadHumanitiesRun(id, { admin: true });
    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ run });
  }
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100));
  const set = req.nextUrl.searchParams.get('set');
  return NextResponse.json({ runs: await loadAllHumanities(limit, set) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const set = String((body as { calibrationSet?: unknown }).calibrationSet ?? '').trim().slice(0, 80);
  if (!set) return NextResponse.json({ error: 'calibrationSet required' }, { status: 400 });
  const label = String((body as { label?: unknown }).label ?? '').trim().slice(0, 80) || null;
  const truth = Number((body as { truthLevel?: unknown }).truthLevel);
  const out = await submitHumanities({
    identity: `calib:${set}`,
    studentName: label,
    questionId: String((body as { questionId?: unknown }).questionId ?? ''),
    answer: String((body as { answer?: unknown }).answer ?? ''),
    source: 'calibration',
    calibrationSet: set,
    truthLevel: Number.isInteger(truth) && truth > 0 ? truth : null,
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ id: out.id, state: 'queued' });
}
