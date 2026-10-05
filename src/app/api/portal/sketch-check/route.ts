// /api/portal/sketch-check — 📈 the graph-sketch checker (SPEC-SKETCH-CHECK.md, 5 Oct 2026).
//
//   POST { questionRef?, function?, domainLo?, domainHi?, photo, questionPhoto? } → { id }
//        a question from data/sketch-check/questions.json, OR a typed function, OR a
//        photo of the question (the bot reads the function off it); plus the sketch
//        photo (data URL or base64, downscaled in the browser). Inserts a QUEUED row and
//        pings the bot; the result page polls.
//   GET ?id=<uuid>  → { check }   their own only (Adrian: any)
//   GET             → { checks }  their own, newest first
//
// Anonymous → 401 (the health-check probes this). Door: h2ToolOpen('sketch') — closed:
// Adrian's cookie and the demo student. Cap: DAILY_SKETCH_CAP checks a Singapore day.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { h2ToolOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { sgtDayStartISO } from '@/lib/sgt';
import { sketchQuestionById, parseTypedFunction, parseDomain, DAILY_SKETCH_CAP, SKETCH_CAP_MESSAGE } from '@/lib/sketch-check';
import { submitSketch, loadSketch, listSketches, countSketchesToday, MAX_PHOTO_B64 } from '@/lib/sketch-check-store';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const UUID = /^[0-9a-f-]{36}$/i;

async function who() {
  const account = await sessionAccount().catch(() => null);
  const isAdmin = !(await viewingAsStudent()) && (await isNotesAuthed());
  if (account) return { identity: portalIdentity(account), account, isAdmin, name: account.display_name ?? null };
  if (isAdmin) return { identity: 'admin', account: null, isAdmin, name: 'Adrian' };
  return null;
}

export async function GET(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const row = await loadSketch(id, w.isAdmin ? { admin: true } : w.identity);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ check: row });
  }
  return NextResponse.json({ checks: await listSketches(w.identity) });
}

export async function POST(req: NextRequest) {
  const w = await who();
  if (!w) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await h2ToolOpen('sketch', w.account))) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });

  if (!w.isAdmin) {
    const used = await countSketchesToday(w.identity, sgtDayStartISO());
    if (used >= DAILY_SKETCH_CAP) return NextResponse.json({ error: SKETCH_CAP_MESSAGE }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const photo = typeof body.photo === 'string' ? body.photo : '';
  const questionPhoto = typeof body.questionPhoto === 'string' && body.questionPhoto ? body.questionPhoto : null;
  if (!photo) return NextResponse.json({ error: 'Add a photo of your sketch.' }, { status: 400 });
  if (photo.length > MAX_PHOTO_B64 || (questionPhoto && questionPhoto.length > MAX_PHOTO_B64)) {
    return NextResponse.json({ error: 'That photo is too large. Try again.' }, { status: 413 });
  }

  const q = sketchQuestionById(typeof body.questionRef === 'string' ? body.questionRef : null);
  let expr: string | null = null;
  let shown: string | null = null;
  let domain: [number | null, number | null] | null = null;
  if (q) {
    expr = q.expr; shown = q.shown; domain = q.domain ?? null;
  } else if (typeof body.function === 'string' && body.function.trim()) {
    const t = parseTypedFunction(body.function);
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
    expr = t.expr;
    shown = body.function.trim().slice(0, 160);
    domain = parseDomain(body.domainLo, body.domainHi);
  } else if (!questionPhoto) {
    return NextResponse.json({ error: 'Pick a question, type the function, or add a photo of the question.' }, { status: 400 });
  }

  const out = await submitSketch({
    identity: w.identity, studentName: w.name,
    questionRef: q?.id ?? null, questionId: q?.questionId ?? null,
    expr, shown, domain, exact: !!q?.exact || body.exact === true, asks: q?.asks ?? null,
    photoB64: photo, questionPhotoB64: questionPhoto,
  });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  await getSupabaseAdmin().from('portal_event_log').insert({ identity: w.identity, kind: 'sketch:submit', detail: { id: out.id, questionRef: q?.id ?? null } }).then(() => {}, () => {});
  return NextResponse.json({ id: out.id, state: 'queued' });
}
