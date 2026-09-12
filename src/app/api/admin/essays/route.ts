// /api/admin/essays — Adrian's view of every essay, and the calibration
// harness's door (SPEC-ESSAY-MARKING.md, 12 Sep 2026).
//   GET            → { essays: [...] }  newest first, list columns only
//   GET ?id=<uuid> → { essay }          the whole row, reads included
//   POST { kind, question?, text, calibrationSet, teacherMark?, label? }
//                  → { id }             a calibration hand-in: marked exactly as a
//                                       student's would be, filed under the set,
//                                       never shown in any student's list
// Bearer ADMIN_PASSWORD or the admin session cookie (verifyAdminAuth); the
// health-check probes the 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadAllEssays, loadEssay } from '@/lib/essay-runs';
import { submitEssay } from '@/lib/essay-submit';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const essay = await loadEssay(id, null);
    if (!essay) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ essay });
  }
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100));
  return NextResponse.json({ essays: await loadAllEssays(limit) });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const set = String((body as { calibrationSet?: unknown }).calibrationSet ?? '').trim().slice(0, 80);
  if (!set) return NextResponse.json({ error: 'calibrationSet required' }, { status: 400 });
  const label = String((body as { label?: unknown }).label ?? '').trim().slice(0, 80) || null;
  const tm = (body as { teacherMark?: unknown }).teacherMark;
  const out = await submitEssay({
    identity: `calib:${set}`,
    studentName: label,
    level: String((body as { level?: unknown }).level ?? '') || null,
    kind: String((body as { kind?: unknown }).kind ?? ''),
    question: String((body as { question?: unknown }).question ?? ''),
    text: String((body as { text?: unknown }).text ?? ''),
    source: 'calibration',
    calibrationSet: set,
    teacherMark: tm && typeof tm === 'object' ? (tm as Record<string, unknown>) : null,
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ id: out.id, state: 'queued' });
}
