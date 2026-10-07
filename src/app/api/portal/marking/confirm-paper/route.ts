// POST /api/portal/marking/confirm-paper {runId, yes} → { ok, remarking }
//
// 🔎 The student answers "is this the <2025 A-Level H2 Maths Paper 1>?" on a paper that
// was marked from the working alone because we could not tell which paper it is
// (7 Oct 2026, SPEC-PAPER-MATCH.md §⑥; rule: lib/paper-unsure, bot lib/paper-recognise).
//   yes → the run takes that paper's name, so every lookup (the library's paper and
//         answers, the bank's marks) finds it, and the bot marks it again. A failed
//         hand-over to the bot puts the row back exactly as it was.
//   no  → the question is not asked again; nothing else changes.
// Only on a RELEASED run that is theirs — the ownership filter is the access control.
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { unsurePaper, answeredCandidate } from '@/lib/paper-unsure';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sid = portalIdentity(account);
  const body = await req.json().catch(() => ({} as { runId?: unknown; yes?: unknown }));
  const runId = typeof body.runId === 'string' ? body.runId : '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: 'runId required' }, { status: 400 });
  const yes = body.yes === true;

  const sb = getSupabaseAdmin();
  const { data: run, error } = await sb.from('paper_marking_runs')
    .select('id, paper_name, result_json').eq('id', runId).eq('student_id', sid).not('released_at', 'is', null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: 'Not your paper' }, { status: 404 });
  const cand = unsurePaper(run.result_json);
  if (!cand) return NextResponse.json({ error: 'Nothing to confirm on this paper' }, { status: 409 });

  const rj = (run.result_json && typeof run.result_json === 'object' ? run.result_json : {}) as Record<string, unknown>;
  const pm = (rj.paper_match && typeof rj.paper_match === 'object' ? rj.paper_match : {}) as Record<string, unknown>;
  const stamp = answeredCandidate(pm.candidate as Record<string, unknown>, yes, new Date().toISOString(), run.paper_name ?? null);
  const next = { ...rj, paper_match: { ...pm, candidate: stamp } };

  if (!yes) {
    const { error: e } = await sb.from('paper_marking_runs').update({ result_json: next }).eq('id', runId);
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    return NextResponse.json({ ok: true, remarking: false });
  }

  const botBase = process.env.BOT_BASE_URL, botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'Marking is not available right now — try again later.' }, { status: 503 });
  const { error: upErr } = await sb.from('paper_marking_runs').update({ paper_name: cand.name, result_json: next }).eq('id', runId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  try {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'enqueue', id: runId, model: 'opus', style: 'teacher', remark: true }),
      signal: AbortSignal.timeout(30_000),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  } catch (e) {
    await sb.from('paper_marking_runs').update({ paper_name: run.paper_name, result_json: rj }).eq('id', runId);
    console.warn('[confirm-paper] re-mark not queued:', (e as Error).message);
    return NextResponse.json({ error: 'We could not start the marking — try again in a minute.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, remarking: true });
}
