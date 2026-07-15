// GET /api/kiosk/notes?level=em  → printable notes for a level, for the kiosk.
// Same source as /admin/notes (shared lib), but gated by the kiosk device cookie
// (or admin). Students at the kiosk browse + print these; no worked solutions or
// bank metadata are involved — notes are Adrian's own PDFs.
import { NextRequest, NextResponse } from 'next/server';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { listNotesForLevel, NOTE_SLUG_TO_LEVELS } from '@/lib/notes-list';
import { studentFromRequest } from '@/lib/kiosk-student';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Master switch: closed → serve nothing (admin bypasses).
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const level = (new URL(req.url).searchParams.get('level') || '').toLowerCase();
  if (!NOTE_SLUG_TO_LEVELS[level]) {
    return NextResponse.json({ error: 'level must be s1, s2, em, am or jc' }, { status: 400 });
  }

  // Hard-lock: students only see their own level's notes (admin bypasses).
  if (!verifyAdminAuth(req)) {
    const student = studentFromRequest(req);
    if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
    if (!student.entitlements.notes.includes(level)) {
      return NextResponse.json({ error: 'Not your level', forbidden: true }, { status: 403 });
    }
  }

  const { notes } = await listNotesForLevel(level);
  // Kiosk only needs id/title/pdfUrl — drop timestamps/source.
  return NextResponse.json({ notes: notes.map(n => ({ id: n.id, title: n.title, pdfUrl: n.pdfUrl })) });
}
