// /api/portal/humanities/own — hand in an answer to a question the student brought from school
// (15 Oct 2026, lib/humanities-own.ts). POST { subject, pure?, skill?, question, sources, marks?, answer } →
// { id } — or, for a question with parts (17 Oct 2026, lib/humanities-parts.ts), { group, ids }: the question and
// the answer are split by part and each part is marked as its own answer. The same reader, cap and report as our
// own questions (lib/humanities-submit). Anonymous → 401 (the health-check probes this). Door: humanitiesOwnOpen().
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOwnOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { countHumanitiesToday } from '@/lib/humanities-runs';
import { submitHumanities, DAILY_HUMANITIES_CAP } from '@/lib/humanities-submit';
import { checkOwn, isOwnPoints, type OwnQuestion } from '@/lib/humanities-own';
import { writeOwnPoints, classifyOwnType, splitOwnParts } from '@/lib/humanities-own-points';
import { guessSkill, OWN_SKILLS } from '@/lib/humanities-own-guess';
import type { HumanitiesSubject } from '@/lib/humanities-questions';
import { findUploaded } from '@/lib/humanities-upload-bank';
import { hasParts, partQuestion } from '@/lib/humanities-parts';
import { sgtDayStartISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

type Prepared = { ok: true; own: OwnQuestion } | { ok: false; status: number; error: string };

/** One question (or one part) ready to mark: its type worked out, a Geography short question's points written. */
async function prepare(input: Record<string, unknown>): Promise<Prepared> {
  const body = { ...input };
  // The type is worked out, never asked: the wording rules, then one short read when they find nothing.
  const subject = String(body.subject ?? '') as HumanitiesSubject;
  // A school question another student already sent is marked the same way: the type it was read as, and for a
  // Geography short question the same list of points (lib/humanities-upload-bank).
  const banked = subject in OWN_SKILLS ? await findUploaded(subject, String(body.question ?? ''), String(body.sources ?? '')).catch(() => null) : null;
  if (banked && OWN_SKILLS[subject].includes(banked.skill as never)) body.skill = banked.skill;
  if (subject in OWN_SKILLS && !OWN_SKILLS[subject].includes(String(body.skill ?? '') as never)) {
    const q = String(body.question ?? '');
    body.skill = guessSkill(subject, q) ?? await classifyOwnType(subject, q) ?? '';
    if (!body.skill) return { ok: false, status: 400, error: 'We could not tell what this question asks. Check the whole question is there.' };
  }
  const checked = checkOwn(body);
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  let own = checked.own;
  if (isOwnPoints(own.skill) && banked?.points?.length && banked.skill === own.skill) {
    own = { ...own, points: banked.points, command: banked.command ?? 'explain', develop: !!banked.develop, rules: banked.rules ?? [], marks: own.marks ?? banked.marks };
  } else if (isOwnPoints(own.skill)) {
    // A Geography short question: write its list of creditable points first (lib/humanities-own-points).
    const pts = await writeOwnPoints(own);
    if (!pts) return { ok: false, status: 503, error: 'We could not set up the marking for this question. Try again in a minute.' };
    own = { ...own, ...pts };
  }
  return { ok: true, own };
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await humanitiesOwnOpen())) return NextResponse.json({ error: 'Humanities feedback is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);

  const used = await countHumanitiesToday(sid, sgtDayStartISO());
  if (used >= DAILY_HUMANITIES_CAP) {
    return NextResponse.json({ error: `You have handed in ${used} answers today — the next one goes in tomorrow.` }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const log = (detail: Record<string, unknown>) => getSupabaseAdmin().from('portal_event_log').insert({ identity: sid, kind: 'humanities:submit', detail }).then(() => {});

  // A question with parts: each part is marked as its own answer, grouped (lib/humanities-parts).
  const question = String(body.question ?? '');
  const split = hasParts(question) ? await splitOwnParts(question, String(body.answer ?? '')) : null;
  if (split) {
    const answered = split.parts.filter(p => p.answer.split(/\s+/).filter(Boolean).length >= 3);
    if (!answered.length) return NextResponse.json({ error: 'We could not find your answer to any part. Check your answer is there.' }, { status: 400 });
    if (used + answered.length > DAILY_HUMANITIES_CAP) {
      return NextResponse.json({ error: `That is ${answered.length} parts, and you have ${DAILY_HUMANITIES_CAP - used} answers left today. Send it tomorrow, or fewer parts.` }, { status: 429 });
    }
    const of = split.parts.map(p => p.label);
    const unanswered = split.parts.filter(p => !answered.includes(p)).map(p => p.label);
    const prepared = await Promise.all(answered.map(p => prepare({
      subject: body.subject, pure: body.pure, sources: body.sources,
      question: partQuestion(split.stem, p), marks: p.marks ?? undefined,
    })));
    const bad = prepared.find(p => !p.ok);
    if (bad && !bad.ok) return NextResponse.json({ error: bad.error }, { status: bad.status });
    const group = randomUUID();
    const ids: string[] = [];
    for (const [i, p] of answered.entries()) {
      const own = { ...(prepared[i] as { own: OwnQuestion }).own, part: { label: p.label, of, unanswered } };
      const out = await submitHumanities({ identity: sid, studentName: account.display_name, questionId: '', own, answer: p.answer, source: 'app', groupId: group });
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
      ids.push(out.id);
    }
    await log({ group, ids, own: true, parts: of.length, subject: body.subject });
    return NextResponse.json({ group, ids, state: 'queued' });
  }

  const one = await prepare(body);
  if (!one.ok) return NextResponse.json({ error: one.error }, { status: one.status });
  const out = await submitHumanities({ identity: sid, studentName: account.display_name, questionId: '', own: one.own, answer: String(body.answer ?? ''), source: 'app' });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  await log({ id: out.id, own: true, subject: one.own.subject, skill: one.own.skill, scheme: !!one.own.scheme });
  return NextResponse.json({ id: out.id, state: 'queued' });
}
