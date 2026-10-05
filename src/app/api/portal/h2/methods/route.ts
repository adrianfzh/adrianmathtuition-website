// /api/portal/h2/methods — 🧭 the "Which method?" drills (SPEC-H2-TOOLS.md, 5 Oct 2026).
//
//   GET ?area=integration|vectors|distributions → { items }   the live drills in run order
//        (missed first, then unseen, then right; the day's shuffle within each). The
//        right answer travels with the item so the tap is marked instantly on the phone.
//   POST { id, choice }                         → { correct, answer }   logs the attempt.
//
// Anonymous → 401 (the health-check probes it). Door: h2ToolOpen('methods') — the demo
// student + Adrian's cookie while H2_METHOD_DRILLS_OPEN_TO_STUDENTS is closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { checkMethodChoice, drillOrder, parseMethodArea } from '@/lib/h2-tools';
import { attemptHistory, loadMethodDrill, loadMethodDrills, logAttempt } from '@/lib/h2-tools-store';
import { sgtTodayISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

async function who(): Promise<{ identity: string; account: Awaited<ReturnType<typeof sessionAccount>> } | null> {
  const account = await sessionAccount().catch(() => null);
  if (account) return { identity: portalIdentity(account), account };
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return { identity: 'admin', account: null };
  return null;
}

export async function GET(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await h2ToolOpen('methods', w.account))) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const area = parseMethodArea(req.nextUrl.searchParams.get('area'));
  if (!area) return NextResponse.json({ error: 'bad area' }, { status: 400 });
  const [items, history] = await Promise.all([loadMethodDrills(area), attemptHistory(w.identity, 'method').catch(() => new Map<string, boolean>())]);
  return NextResponse.json({ items: drillOrder(items, history, `${w.identity}|${sgtTodayISO()}`) });
}

export async function POST(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await h2ToolOpen('methods', w.account))) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; choice?: unknown };
  const id = String(body.id ?? '');
  const choice = typeof body.choice === 'number' ? body.choice : NaN;
  if (!UUID.test(id) || !Number.isInteger(choice)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const d = await loadMethodDrill(id);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const v = checkMethodChoice(d, choice);
  await logAttempt({ identity: w.identity, tool: 'method', itemId: id, answer: String(choice), correct: v.correct, result: { choseTrap: v.choseTrap, area: d.area, skill: d.skill } });
  return NextResponse.json({ correct: v.correct, answer: v.answer });
}
