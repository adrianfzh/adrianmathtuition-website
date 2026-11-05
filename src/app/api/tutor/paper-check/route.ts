// POST /api/tutor/paper-check { paperName } — "do we hold this paper's questions?", the same
// read-only bot question /app/submit asks (lib/paper-check). Fails open, never blocks.
import { NextResponse } from 'next/server';
import { currentTutor } from '@/lib/tutor-auth';
import { QUIET, looksLikeNamedPaper, shapePaperCheck } from '@/lib/paper-check';
import { botCall } from '@/lib/tutor-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { paperName?: unknown };
  const paperName = typeof body.paperName === 'string' ? body.paperName.trim().slice(0, 80) : '';
  if (!looksLikeNamedPaper(paperName)) return NextResponse.json(QUIET);
  const r = await botCall({ phase: 'paper-available', paperName, studentName: '' }, 3000);
  return NextResponse.json(r ? shapePaperCheck(r) : QUIET);
}
