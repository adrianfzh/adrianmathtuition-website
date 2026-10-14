// 📌 My definitions (14 Oct 2026) — the student's own saved definitions on the
// Physics / Biology definitions pages. Rules: lib/my-definitions.ts; I/O:
// lib/my-definitions-store.ts.
//
//   GET    ?subject=physics|biology          → { items }
//   POST   { subject, term }                 → { item, already? } | { message }
//   DELETE { id }                            → { ok }
//
// Who: a signed-in student (their portal identity, from the session — never
// from the body) or Adrian's admin cookie (identity 'admin:preview'). Closed
// unless MY_DEFINITIONS_OPEN_TO_STUDENTS, the preview student or the admin
// cookie, AND the subject's definitions page is open to the caller.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { isNotesAuthed } from '@/lib/notes-auth';
import {
  BIOLOGY_DEFINITIONS_OPEN_TO_STUDENTS, CHEMISTRY_DEFINITIONS_OPEN_TO_STUDENTS, SCIENCE_DEFINITIONS_OPEN_TO_STUDENTS, myDefinitionsOpenFor, scienceMarkingOpen, viewingAsStudent,
} from '@/lib/portal-beta';
import { isDefSubject, type DefSubject } from '@/lib/my-definitions';
import { addMine, listMine, removeMine } from '@/lib/my-definitions-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE_OPEN: Record<DefSubject, boolean> = {
  physics: SCIENCE_DEFINITIONS_OPEN_TO_STUDENTS,
  biology: BIOLOGY_DEFINITIONS_OPEN_TO_STUDENTS,
  chemistry: CHEMISTRY_DEFINITIONS_OPEN_TO_STUDENTS,
};

async function caller(subject: DefSubject | null): Promise<string | null> {
  const acct = await sessionAccount().catch(() => null);
  const admin = !(await viewingAsStudent()) && (await isNotesAuthed());
  const identity = acct ? portalIdentity(acct) : admin ? 'admin:preview' : null;
  if (!identity) return null;
  if (!(await myDefinitionsOpenFor(acct ? identity : null))) return null;
  if (!(await scienceMarkingOpen())) return null;
  if (subject && !PAGE_OPEN[subject] && !admin) return null;
  return identity;
}

export async function GET(req: NextRequest) {
  const s = new URL(req.url).searchParams.get('subject');
  if (!isDefSubject(s)) return NextResponse.json({ error: 'subject required' }, { status: 400 });
  const identity = await caller(s);
  if (!identity) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  try {
    return NextResponse.json({ items: await listMine(identity, s) });
  } catch {
    return NextResponse.json({ error: 'Could not load' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const subject = body?.subject;
  if (!isDefSubject(subject)) return NextResponse.json({ error: 'subject required' }, { status: 400 });
  const identity = await caller(subject);
  if (!identity) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  try {
    const r = await addMine(identity, subject, String(body?.term ?? ''));
    return 'added' in r ? NextResponse.json({ item: r.added, already: !!r.already }) : NextResponse.json({ message: r.message });
  } catch {
    return NextResponse.json({ message: 'We could not add that just now. Try again in a minute.' });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const identity = await caller(null);
  if (!identity) return NextResponse.json({ error: 'Not available' }, { status: 403 });
  try {
    return NextResponse.json({ ok: await removeMine(identity, id) });
  } catch {
    return NextResponse.json({ error: 'Could not remove' }, { status: 500 });
  }
}
