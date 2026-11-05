// /api/portal/english/oral — oral practice, Paper 4 (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026).
//
//   POST multipart { set, part, q, seconds, attempt?, audio }
//        → { attempt, q, heard }      the recording is stored privately and turned into words
//          + next: { say, audio }     Part 2: after a set prompt, the speaking partner's question
//                                     that reacts to the answer (SPEC §Speaking partner)
//          | help: { lead, lines }    the answer sounded like a student at risk: no next question,
//                                     the help lines instead, and Adrian is told (lib/wellbeing)
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
import { askedOf, getAttempt, newAttempt, oralReportsToday, partnerVoice, queueReport, saidOf, saveAnswer, saveFollowUp, settle, transcribeSpeech, turnsOf, wellbeingCheck, writeFollowUp, type OralAttempt } from '@/lib/english-oral-store';
import { isFollowUpTurn, turnCount } from '@/lib/english-oral-partner';
import { helpLines } from '@/lib/wellbeing';

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
  return { state, attempt: a.id, set: a.set_id, part: a.part, said: saidOf(a), asked: askedOf(a),
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
    const n = set ? turnsOf(row) : 0;
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
  // Part 2 is six turns: each set prompt, then the partner's question about the answer.
  const turns = part === 'interaction' ? turnCount(set) : promptsFor(set, part).length;
  if (!Number.isInteger(q) || q < 0 || q >= turns) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const ext = audioExt(audio.type);
  if (!ext) return NextResponse.json({ error: 'That recording could not be read. Try again.' }, { status: 400 });
  if (audio.size < 2000) return NextResponse.json({ error: 'The recording is empty. Check the microphone and try again.' }, { status: 400 });
  if (audio.size > ORAL_AUDIO_MAX_BYTES) return NextResponse.json({ error: 'The recording is too long.' }, { status: 413 });
  if ((await oralReportsToday(identity).catch(() => DAILY_ORAL_CAP)) >= DAILY_ORAL_CAP) return NextResponse.json({ error: CAPPED }, { status: 429 });

  const id = String(form.get('attempt') ?? '');
  let row = UUID.test(id) ? await getAttempt(id, identity) : await newAttempt(identity, set.id, part);
  if (!row || row.set_id !== set.id || row.part !== part || row.status !== 'recording') return NextResponse.json({ error: 'Start again.' }, { status: 409 });
  if (part === 'interaction' && isFollowUpTurn(q) && !row.answers.find(a => a.q === q - 1)?.followUp) return NextResponse.json({ error: 'Start again.' }, { status: 409 });

  const bytes = Buffer.from(await audio.arrayBuffer());
  const seconds = Math.max(0, Math.min(maxSeconds(part), Math.round(Number(form.get('seconds')) || 0)));
  const words = await transcribeSpeech(bytes, ext);
  if (words === null) return NextResponse.json({ error: 'Could not hear it just now. Try again in a moment.' }, { status: 502 });
  // Silence can come back as an invented speech — words that could not have been said are nothing heard.
  const heard = plausibleSpeech(words, seconds) ? words : '';
  if (!heard) return NextResponse.json({ error: NOT_HEARD }, { status: 422 });
  row = await saveAnswer(row, q, bytes, ext, seconds, heard);
  if (!row) return NextResponse.json({ error: 'Could not save it. Try again.' }, { status: 502 });

  // Part 2, after a set prompt: the partner's question that reacts to this answer.
  const partner = part === 'interaction' && !isFollowUpTurn(q) ? await writeFollowUp(row, q, heard) : null;
  // A student talking freely may say something worrying (bot docs/SOLVER.md §Wellbeing).
  const risk = await wellbeingCheck(row, heard, partner?.risk);
  if (risk) return NextResponse.json({ attempt: row.id, q, heard, help: helpLines(risk) });
  if (!partner) return NextResponse.json({ attempt: row.id, q, heard });
  const kept = await saveFollowUp(row, q, partner.say);
  if (!kept) return NextResponse.json({ error: 'Could not save it. Try again.' }, { status: 502 });
  return NextResponse.json({ attempt: row.id, q, heard, next: { say: partner.say, audio: await partnerVoice(partner.say) } });
}
