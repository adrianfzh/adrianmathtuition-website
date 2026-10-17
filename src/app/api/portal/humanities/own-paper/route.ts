// /api/portal/humanities/own-paper — a whole paper from school, marked question by question (17 Oct 2026, Adrian: "do
// the next two"). POST { subject, pure?, items: [{ number, question, material, answer }] } → { group, ids }. The page
// reads the photographed pages in batches (/api/portal/humanities/transcribe mode 'paper') and merges them
// (lib/humanities-paper-merge); here each question — or each part of one with parts (lib/humanities-parts) — is made
// ready (lib/humanities-own-prepare) and handed in as its own run, all under one group_id; /app/humanities/group/<id>
// shows the paper's total. The same reader, cap and report as one question. Anonymous → 401. Door: humanitiesOwnOpen().
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOwnOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { countHumanitiesToday } from '@/lib/humanities-runs';
import { submitHumanities, DAILY_HUMANITIES_CAP } from '@/lib/humanities-submit';
import { splitOwnParts } from '@/lib/humanities-own-points';
import { prepareOwn, type Prepared } from '@/lib/humanities-own-prepare';
import { hasParts, partQuestion } from '@/lib/humanities-parts';
import { markable } from '@/lib/humanities-paper-merge';
import type { PaperItem } from '@/lib/humanities-photo';
import { sgtDayStartISO } from '@/lib/sgt';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** At most a few setting-up reads at a time. */
async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await humanitiesOwnOpen())) return NextResponse.json({ error: 'Humanities feedback is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({})) as { subject?: unknown; pure?: unknown; items?: unknown };
  const items = (Array.isArray(body.items) ? body.items as PaperItem[] : []).slice(0, 30)
    .map(i => ({ number: String(i.number ?? ''), question: String(i.question ?? ''), material: String(i.material ?? ''), answer: String(i.answer ?? '') }));
  const ready = items.filter(markable);
  if (!ready.length) return NextResponse.json({ error: 'We could not find any question with your answer. Check the photos show the questions and what you wrote.' }, { status: 400 });

  // Each question becomes its parts when it has them.
  type Unit = { number: string; label: string; cut?: string; question: string; material: string; answer: string; marks?: number };
  const units: Unit[] = [];
  const skipped: string[] = items.filter(i => !markable(i)).map(i => i.number);
  for (const it of ready) {
    const split = hasParts(it.question) ? await splitOwnParts(it.question, it.answer) : null;
    if (!split) { units.push({ number: it.number, label: it.number, question: it.question, material: it.material, answer: it.answer }); continue; }
    for (const p of split.parts) {
      const label = `${it.number}(${p.label})`;
      if (p.answer.split(/\s+/).filter(Boolean).length < 3) { skipped.push(label); continue; }
      units.push({ number: it.number, label, cut: `(${p.label})`, question: partQuestion(split.stem, p), material: it.material, answer: p.answer, marks: p.marks ?? undefined });
    }
  }
  const used = await countHumanitiesToday(sid, sgtDayStartISO());
  if (used + units.length > DAILY_HUMANITIES_CAP) {
    return NextResponse.json({ error: `This paper has ${units.length} answers to mark and you have ${Math.max(0, DAILY_HUMANITIES_CAP - used)} left today. Send it tomorrow.` }, { status: 429 });
  }
  const prepared: Prepared[] = await inBatches(units, 4, u => prepareOwn({ subject: body.subject, pure: body.pure, question: u.question, sources: u.material, marks: u.marks }));
  const group = randomUUID();
  const of = units.map(u => u.label);
  const ids: string[] = [];
  const failed: string[] = [];
  for (const [i, u] of units.entries()) {
    const p = prepared[i];
    if (!p.ok) { failed.push(u.label); continue; }
    const own = { ...p.own, part: { label: u.label, of, unanswered: skipped, paper: true, ...(u.cut ? { cut: u.cut } : {}) } };
    const out = await submitHumanities({ identity: sid, studentName: account.display_name, questionId: '', own, answer: u.answer, source: 'app', groupId: group });
    if (out.ok) ids.push(out.id); else failed.push(u.label);
  }
  if (!ids.length) return NextResponse.json({ error: 'We could not set up the marking for this paper. Try again in a minute.' }, { status: 503 });
  await getSupabaseAdmin().from('portal_event_log').insert({ identity: sid, kind: 'humanities:submit', detail: { group, ids, paper: true, questions: ready.length, units: units.length, failed, subject: body.subject } }).then(() => {});
  return NextResponse.json({ group, ids, failed, skipped, state: 'queued' });
}
