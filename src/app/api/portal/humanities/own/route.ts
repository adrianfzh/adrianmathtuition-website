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
import type { OwnQuestion } from '@/lib/humanities-own';
import { splitOwnParts } from '@/lib/humanities-own-points';
import { prepareOwn } from '@/lib/humanities-own-prepare';
import { hasParts, partQuestion } from '@/lib/humanities-parts';
import { sgtDayStartISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

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
    const prepared = await Promise.all(answered.map(p => prepareOwn({
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

  const one = await prepareOwn(body);
  if (!one.ok) return NextResponse.json({ error: one.error }, { status: one.status });
  const out = await submitHumanities({ identity: sid, studentName: account.display_name, questionId: '', own: one.own, answer: String(body.answer ?? ''), source: 'app' });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  await log({ id: out.id, own: true, subject: one.own.subject, skill: one.own.skill, scheme: !!one.own.scheme });
  return NextResponse.json({ id: out.id, state: 'queued' });
}
