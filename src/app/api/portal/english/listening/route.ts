// /api/portal/english/listening — listening practice on our OWN recordings
// (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026).
//
//   POST { set: "ls01", answers: { "1": "B", "2": "tag", … } }
//        → { results[], right, total, script[] }   marked by the key, no model.
//        The key, the reasons and the script are in the reply only — never in the page before.
//
// Anonymous → 401 (the health-check probes it). Door: englishListeningOpen() — closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishListeningOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { checkListening, scriptShown } from '@/lib/english-listening';
import { listeningById } from '@/lib/english-speaking-data';
import { ownUuid } from '@/lib/english-own';
import { logAttempt } from '@/lib/english-practice-store';

export const dynamic = 'force-dynamic';

async function who(): Promise<string | null> {
  const account = await sessionAccount().catch(() => null);
  if (account) return portalIdentity(account);
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'admin';
  return null;
}

export async function POST(req: NextRequest) {
  const identity = await who();
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishListeningOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { set?: unknown; answers?: unknown };
  const set = listeningById(String(body.set ?? ''));
  if (!set || !body.answers || typeof body.answers !== 'object') return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const out = checkListening(set, body.answers as Record<string, unknown>);
  const uuid = ownUuid(set.id);
  await logAttempt({ identity, itemId: uuid, unit: uuid, kind: 'listening', answer: JSON.stringify(body.answers).slice(0, 2000), awarded: out.right, max: out.total, usedModel: false,
    result: { set: set.id, questions: out.results.map(r => ({ n: r.n, ok: r.ok })) } });
  return NextResponse.json({ ...out, script: scriptShown(set) });
}
