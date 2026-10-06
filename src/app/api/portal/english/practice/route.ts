// /api/portal/english/practice — English practice from the language bank
// (SPEC-ENGLISH-PRACTICE.md, 6 Oct 2026).
//
//   GET  ?image=<text id>                 → the text's picture (bytes; its storage name is never exposed)
//   POST { editing: <item id>, answers }  → { results[], right, total }           marked by rule, no model
//   POST { unit: <key>, answer }          → short answer:  { awarded, marks, line, why, missing, scheme }
//                                           summary:       { content, contentMax, hit[], points[], language, words, over, scheme }
//        The scheme is in the reply only — never in a page before the check.
//        A judgement costs one model call, at most DAILY_ENGLISH_MODEL_CAP a student a day.
//
// Anonymous → 401 (the health-check probes it). Door: englishPracticeOpen() — closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishPracticeOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { ENGLISH_ANSWER_MAX, SUMMARY_WORD_LIMIT, checkEditing, marksLine, parseUnitKey, schemeShown, wordCount } from '@/lib/english-practice';
import { checkShort, checkSummary, loadEditingSet, loadTextImage, loadUnit, logAttempt } from '@/lib/english-practice-store';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRY_LATER = 'Could not check it just now. Try again in a moment.';
const CAPPED = 'That is a lot of answers checked today. More tomorrow.';

async function who(): Promise<string | null> {
  const account = await sessionAccount().catch(() => null);
  if (account) return portalIdentity(account);
  if (!(await viewingAsStudent()) && (await isNotesAuthed())) return 'admin';
  return null;
}

export async function GET(req: NextRequest) {
  if (!(await who())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishPracticeOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('image') ?? '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const img = await loadTextImage(id);
  if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(img.bytes, { headers: { 'Content-Type': img.type, 'Cache-Control': 'private, max-age=3600' } });
}

export async function POST(req: NextRequest) {
  const identity = await who();
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishPracticeOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { editing?: unknown; answers?: unknown; unit?: unknown; answer?: unknown };

  // — an editing passage: every line by rule —
  if (body.editing !== undefined) {
    const id = String(body.editing ?? '');
    if (!UUID.test(id) || !body.answers || typeof body.answers !== 'object') return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const set = await loadEditingSet(id);
    if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const out = checkEditing(set, body.answers as Record<string, unknown>);
    await logAttempt({ identity, itemId: id, unit: id, kind: 'editing', answer: JSON.stringify(body.answers).slice(0, 2000), awarded: out.right, max: out.total, usedModel: false,
      result: { lines: out.results.map(r => ({ label: r.label, ok: r.ok })) } });
    return NextResponse.json(out);
  }

  // — one question on a text —
  const key = parseUnitKey(body.unit);
  const answer = String(body.answer ?? '').trim().slice(0, ENGLISH_ANSWER_MAX);
  if (!key) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  if (answer.length < 1) return NextResponse.json({ error: 'Write your answer first.' }, { status: 400 });
  const found = await loadUnit(key.itemId, String(body.unit));
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { unit, passage } = found;

  if (unit.kind === 'summary') {
    const r = await checkSummary(unit, answer, passage, identity);
    if (r.state === 'capped') return NextResponse.json({ error: CAPPED }, { status: 429 });
    if (r.state === 'failed') return NextResponse.json({ error: TRY_LATER }, { status: 502 });
    const words = wordCount(answer);
    await logAttempt({ identity, itemId: unit.itemId, unit: unit.key, kind: 'summary', answer, awarded: r.content, max: r.contentMax, usedModel: true, result: { hit: r.verdict.hit, words } });
    return NextResponse.json({ kind: 'summary', content: r.content, contentMax: r.contentMax, hit: r.verdict.hit, language: r.verdict.language,
      words, over: words > SUMMARY_WORD_LIMIT, scheme: schemeShown(unit.scheme) });
  }

  const r = await checkShort(unit, answer, passage, identity);
  if (r.state === 'capped') return NextResponse.json({ error: CAPPED }, { status: 429 });
  if (r.state === 'failed') return NextResponse.json({ error: TRY_LATER }, { status: 502 });
  await logAttempt({ identity, itemId: unit.itemId, unit: unit.key, kind: unit.kind === 'choice' ? 'choice' : 'short', answer, awarded: r.verdict.awarded, max: unit.marks, usedModel: r.usedModel });
  return NextResponse.json({ kind: 'short', awarded: r.verdict.awarded, marks: unit.marks, line: marksLine(r.verdict.awarded, unit.marks),
    why: r.verdict.why, missing: r.verdict.missing, scheme: schemeShown(unit.scheme) });
}
