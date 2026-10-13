// /api/portal/english/grammar — the editing crash course's "Try 3" (SPEC-ENGLISH-PRACTICE.md,
// 13 Oct 2026). Lines come from OUR passages (lib/english-grammar.ts), never the language bank.
//
//   GET  ?kind=<kind>[&skip=<ref>,<ref>][&not=<passage item id>] → { lines: [{ ref, before, text, after }] }
//        three lines of that kind; no wrong or right word until the line is answered
//   POST { ref, answer }   → { result }   marked like a passage line (circle, then correct); nothing stored
//
// Anonymous → 401 (the health-check probes it). Door: englishPracticeOpen() — closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount } from '@/lib/portal-auth';
import { englishPracticeOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { OWN_EDITING, ownByUuid } from '@/lib/english-own-data';
import { checkDrill, drillPool, findDrillLine, isEditKind, pickDrill, publicDrillLine } from '@/lib/english-grammar';

export const dynamic = 'force-dynamic';

async function signedIn(): Promise<boolean> {
  if (await sessionAccount().catch(() => null)) return true;
  return !(await viewingAsStudent()) && (await isNotesAuthed());
}

export async function GET(req: NextRequest) {
  if (!(await signedIn())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishPracticeOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const kind = sp.get('kind');
  if (!isEditKind(kind)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const skip = (sp.get('skip') ?? '').split(',').filter(Boolean).slice(0, 60);
  const notSet = ownByUuid(sp.get('not') ?? '')?.id ?? null;
  const lines = pickDrill(drillPool(OWN_EDITING, kind), { skip, notSet }).map(publicDrillLine);
  return NextResponse.json({ lines });
}

export async function POST(req: NextRequest) {
  if (!(await signedIn())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishPracticeOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { ref?: unknown; answer?: unknown };
  const line = typeof body.ref === 'string' ? findDrillLine(OWN_EDITING, body.ref) : null;
  if (!line) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ result: checkDrill(line, body.answer) });
}
