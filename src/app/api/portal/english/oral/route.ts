// /api/portal/english/oral — oral practice, Paper 4 (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026).
//
//   POST multipart { set, part, q, seconds, attempt?, audio }
//        → { attempt, q, heard }      the recording is stored privately and turned into words
//   POST json { attempt, said: string[] }
//        → { state: 'waiting' }       the words (as the student confirmed them) are queued for the
//                                     plan reader — never the paid key
//   GET  ?attempt=<id>
//        → { state: 'recording' | 'waiting' | 'done' | 'failed', set, part, said[], report?, band? }
//
// Anonymous → 401 (the health-check probes it). Doors: englishOralOpen() for the planned response,
// englishOralInteractionOpen() for the spoken interaction — both closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishOralInteractionOpen, englishOralOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { DAILY_ORAL_CAP, ORAL_AUDIO_MAX_BYTES, ORAL_PARTS, ORAL_WORDS_MAX, audioExt, bandShown, enoughSaid, maxSeconds, plausibleSpeech, promptsFor, type OralPart } from '@/lib/english-oral';
import { oralById } from '@/lib/english-speaking-data';
import { getAttempt, newAttempt, oralReportsToday, queueReport, saidOf, saveAnswer, settle, transcribeSpeech, type OralAttempt } from '@/lib/english-oral-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_HEARD = 'We could not hear any words. Move somewhere quieter, hold the phone closer, and record it again.';
const CAPPED = 'That is enough speaking practice for today. More tomorrow.';

async function who(): Promise<string | null> {
  const account = await sessionAccount().catch(() => null);
  if (account) return portalIdentity(account);
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'admin';
  return null;
}
const doorOpen = (part: OralPart): Promise<boolean> => (part === 'planned' ? englishOralOpen() : englishOralInteractionOpen());
const closed = () => NextResponse.json({ error: 'Not open yet.' }, { status: 403 });

function view(a: OralAttempt) {
  const state = a.status === 'queued' ? 'waiting' : a.status;
  return { state, attempt: a.id, set: a.set_id, part: a.part, said: saidOf(a),
    ...(a.status === 'done' && a.report ? { report: a.report, band: bandShown(a.part, a.report.band) } : {}) };
}

export async function GET(req: NextRequest) {
  const identity = await who();
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('attempt') ?? '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const row = await getAttempt(id, identity);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await doorOpen(row.part))) return closed();
  return NextResponse.json(view(await settle(row)));
}

export async function POST(req: NextRequest) {
  const identity = await who();
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // — the words, confirmed: queue the reading —
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { attempt?: unknown; said?: unknown };
    const id = String(body.attempt ?? '');
    if (!UUID.test(id) || !Array.isArray(body.said)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const row = await getAttempt(id, identity);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await doorOpen(row.part))) return closed();
    if (row.status !== 'recording') return NextResponse.json(view(row));
    const set = oralById(row.set_id);
    const n = set ? promptsFor(set, row.part).length : 0;
    if (!set || row.answers.length < n) return NextResponse.json({ error: 'Answer every prompt first.' }, { status: 400 });
    const said = Array.from({ length: n }, (_, q) => String((body.said as unknown[])[q] ?? '').trim().slice(0, ORAL_WORDS_MAX));
    if (!enoughSaid(said)) return NextResponse.json({ error: 'There are too few words to read. Record it again and say more.' }, { status: 400 });
    if ((await oralReportsToday(identity).catch(() => DAILY_ORAL_CAP)) >= DAILY_ORAL_CAP) return NextResponse.json({ error: CAPPED }, { status: 429 });
    if (!(await queueReport(row, said))) return NextResponse.json({ error: 'Could not send it just now. Try again in a moment.' }, { status: 502 });
    return NextResponse.json({ state: 'waiting', attempt: row.id });
  }

  // — one spoken answer —
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const part = String(form.get('part') ?? '') as OralPart;
  const set = oralById(String(form.get('set') ?? ''));
  const q = Number(form.get('q'));
  const audio = form.get('audio');
  if (!set || !ORAL_PARTS.includes(part) || !(audio instanceof Blob)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (!(await doorOpen(part))) return closed();
  if (!Number.isInteger(q) || q < 0 || q >= promptsFor(set, part).length) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const ext = audioExt(audio.type);
  if (!ext) return NextResponse.json({ error: 'That recording could not be read. Try again.' }, { status: 400 });
  if (audio.size < 2000) return NextResponse.json({ error: 'The recording is empty. Check the microphone and try again.' }, { status: 400 });
  if (audio.size > ORAL_AUDIO_MAX_BYTES) return NextResponse.json({ error: 'The recording is too long.' }, { status: 413 });
  if ((await oralReportsToday(identity).catch(() => DAILY_ORAL_CAP)) >= DAILY_ORAL_CAP) return NextResponse.json({ error: CAPPED }, { status: 429 });

  const id = String(form.get('attempt') ?? '');
  let row = UUID.test(id) ? await getAttempt(id, identity) : await newAttempt(identity, set.id, part);
  if (!row || row.set_id !== set.id || row.part !== part || row.status !== 'recording') return NextResponse.json({ error: 'Start again.' }, { status: 409 });

  const bytes = Buffer.from(await audio.arrayBuffer());
  const seconds = Math.max(0, Math.min(maxSeconds(part), Math.round(Number(form.get('seconds')) || 0)));
  const words = await transcribeSpeech(bytes, ext);
  if (words === null) return NextResponse.json({ error: 'Could not hear it just now. Try again in a moment.' }, { status: 502 });
  // Silence can come back as an invented speech — words that could not have been said are nothing heard.
  const heard = plausibleSpeech(words, seconds) ? words : '';
  if (!heard) return NextResponse.json({ error: NOT_HEARD }, { status: 422 });
  row = await saveAnswer(row, q, bytes, ext, seconds, heard);
  if (!row) return NextResponse.json({ error: 'Could not save it. Try again.' }, { status: 502 });
  return NextResponse.json({ attempt: row.id, q, heard });
}
