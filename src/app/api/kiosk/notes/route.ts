// GET /api/kiosk/notes?level=em[&kind=notes|revision|practice]
//   → printable PDFs for a level, for the kiosk.
//
// Backs all three buttons on the kiosk home screen:
//   Learn    → kind=notes     → Dropbox /Notes/<LEVEL>
//   Revise   → kind=revision  → Dropbox /Revision/<LEVEL>  (worked examples)
//   Practice → kind=practice  → Dropbox /Practice/<LEVEL>  (summary + questions)
//
// Same source as /admin/notes (shared lib), gated by the kiosk device cookie
// (or admin) AND the signed student token. `prelim` is deliberately NOT
// serveable here — those sets are Adrian's own segment (isKioskKind refuses it,
// so a hand-typed ?kind=prelim 400s rather than leaking).
//
// No worked solutions or bank metadata are involved — these are Adrian's own
// PDFs. Printing them is uncapped (Adrian, 2026-08-11); only the generated
// worksheet counts against the 4/day print cap.
import { NextRequest, NextResponse } from 'next/server';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { listPrintablesForLevel, isKioskKind, NOTE_SLUG_TO_LEVELS } from '@/lib/notes-list';
import { studentFromRequest } from '@/lib/kiosk-student';
import { scopeToStudent } from '@/lib/kiosk-topic-scope';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Master switch: closed → serve nothing (admin bypasses).
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const level = (params.get('level') || '').toLowerCase();
  // Default 'notes' keeps the pre-2026-08-11 single-kind callers working.
  const kind = params.get('kind') ?? 'notes';

  if (!NOTE_SLUG_TO_LEVELS[level]) {
    return NextResponse.json({ error: 'level must be s1, s2, em, am or jc' }, { status: 400 });
  }
  if (!isKioskKind(kind)) {
    return NextResponse.json({ error: "kind must be 'notes', 'revision' or 'practice'" }, { status: 400 });
  }

  // Hard-lock: students only see their own level (admin bypasses). Entitlements
  // are per-level, not per-kind — a student entitled to AM gets AM notes,
  // revision and practice alike.
  // Held outside the auth block so the topic-scope filter below can read the
  // student's year. Stays null for admin, which means "don't narrow anything".
  let studentLevel: string | null = null;

  if (!verifyAdminAuth(req)) {
    const student = studentFromRequest(req);
    if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
    if (!student.entitlements.notes.includes(level)) {
      return NextResponse.json({ error: 'Not your level', forbidden: true }, { status: 403 });
    }
    studentLevel = student.level;
  }

  const { notes } = await listPrintablesForLevel(kind, level);
  // A Sec 3 student hasn't been taught the whole AM syllabus, but one kiosk
  // level serves both years — so narrow by the topic number in the filename.
  // Fails open: unnumbered sheets and unmapped levels are always shown.
  const scoped = scopeToStudent(notes, level, studentLevel);
  // Kiosk only needs id/title/pdfUrl — drop timestamps/source.
  return NextResponse.json({ notes: scoped.map(n => ({ id: n.id, title: n.title, pdfUrl: n.pdfUrl })) });
}
