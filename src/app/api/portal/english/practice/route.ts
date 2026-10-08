// /api/portal/english/practice — English practice on our OWN sets
// (SPEC-ENGLISH-PRACTICE.md; own content only since 7 Oct 2026 — lib/english-own-data.ts).
//
//   POST { editing: <item id>, answers }  → { results[], right, total }           marked by rule, no model; the attempt is stored
//   POST { editing: <item id>, line, answer } → { result }                         one line as the student goes; nothing stored
//   POST { unit: <key>, answer }          → short answer:  { awarded, marks, line, why, missing, scheme }
//                                           summary:       { content, contentMax, hit[], points[], language, words, over, scheme }
//        The scheme is in the reply only — never in a page before the check.
//        A judgement is read on PLAN usage (7 Oct 2026, "all on plan"): the reply is
//        { kind: 'queued', job } and the page asks again —
//   GET  ?job=<id>                        → { state: 'waiting' | 'failed' } or { state: 'done', result }
//   GET  ?set=<set id>                    → { jobs: { <unit key>: { job, state, answer, result? } } }  the newest per question
//        At most DAILY_ENGLISH_MODEL_CAP judged answers a student a day. Rule-marked answers are instant.
//
// Anonymous → 401 (the health-check probes it). Door: englishPracticeOpen() — closed.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { englishPracticeOpen, viewingAsStudent } from '@/lib/portal-beta';
import { isNotesAuthed } from '@/lib/notes-auth';
import { ENGLISH_ANSWER_MAX, SUMMARY_WORD_LIMIT, checkEditing, marksLine, parseUnitKey, schemeShown, wordCount } from '@/lib/english-practice';
import { checkShort, checkSummary, englishCheckOnApi, latestJobs, loadEditingSet, loadJob, loadUnit, logAttempt, queueCheck, queuedToday, viewJob, type JobView } from '@/lib/english-practice-store';
import { DAILY_ENGLISH_MODEL_CAP, ruleShort } from '@/lib/english-practice';

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

function resultOf(v: Extract<JobView, { state: 'done' }>) {
  const { unit } = v;
  if (v.summary) {
    const words = wordCount(v.answer);
    return { kind: 'summary', content: v.summary.content, contentMax: v.summary.contentMax, hit: v.summary.verdict.hit, language: v.summary.verdict.language,
      words, over: words > SUMMARY_WORD_LIMIT, scheme: schemeShown(unit.scheme) };
  }
  const s = v.short!;
  return { kind: 'short', awarded: s.awarded, marks: unit.marks, line: marksLine(s.awarded, unit.marks), why: s.why, missing: s.missing, scheme: schemeShown(unit.scheme) };
}

export async function GET(req: NextRequest) {
  const identity = await who();
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishPracticeOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const job = req.nextUrl.searchParams.get('job') ?? '';
  const set = req.nextUrl.searchParams.get('set') ?? '';
  if (UUID.test(job)) {
    const row = await loadJob(job, identity);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const v = await viewJob(row);
    return NextResponse.json(v.state === 'done' ? { state: 'done', result: resultOf(v) } : { state: v.state });
  }
  if (UUID.test(set)) {
    const jobs: Record<string, unknown> = {};
    for (const row of await latestJobs(set.toLowerCase(), identity)) {
      const v = await viewJob(row);
      jobs[row.ref as string] = { job: row.id, state: v.state, answer: String((row.meta as { answer?: string } | null)?.answer ?? ''), ...(v.state === 'done' ? { result: resultOf(v) } : {}) };
    }
    return NextResponse.json({ jobs });
  }
  return NextResponse.json({ error: 'bad request' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const identity = await who();
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await englishPracticeOpen())) return NextResponse.json({ error: 'Not open yet.' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { editing?: unknown; answers?: unknown; line?: unknown; unit?: unknown; answer?: unknown };

  // — an editing passage: every line by rule —
  if (body.editing !== undefined) {
    const id = String(body.editing ?? '');
    // — one line of it, as the student goes (8 Oct 2026: one line at a time): the same rule, nothing stored —
    if (UUID.test(id) && typeof body.line === 'string') {
      const one = await loadEditingSet(id);
      const line = one?.lines.find(l => l.label === body.line);
      if (!one || !line) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const r = checkEditing({ ...one, lines: [line] }, { [line.label]: body.answer }).results[0];
      return NextResponse.json({ result: r });
    }
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

  // — on the plan: a judgement answer is queued, not read on the spot (the free rule still answers at once) —
  if (!englishCheckOnApi()) {
    const rule = unit.kind === 'summary' ? null : ruleShort(unit, answer);
    if (rule === null) {
      if ((await queuedToday(identity).catch(() => DAILY_ENGLISH_MODEL_CAP)) >= DAILY_ENGLISH_MODEL_CAP) return NextResponse.json({ error: CAPPED }, { status: 429 });
      const job = await queueCheck(unit, answer, passage, identity);
      if (!job) return NextResponse.json({ error: TRY_LATER }, { status: 502 });
      return NextResponse.json({ kind: 'queued', job });
    }
  }

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
