// POST /api/agent/twins/submit — a cloud session's twin, checked and filed by the SERVER
// (5 Oct 2026, docs/CLOUD.md §Cloud twins). Body:
//   {bank: 'maths'|'science', seed_id, question, options?, answer, solution, figure_spec?,
//    gate_record: {blind_answer, blind?, checker, notes?}, topic?, pool?, dry?}
// The server re-fetches the seed and re-runs EVERY deterministic gate itself (structure,
// marks, topics, novelty vs the bank incl. our other twins, number-swap, house style,
// forbidden words, syllabus scope for science, the blind answer against the key, every
// checker point), refuses when the sub-skill (maths) or topic (science) is already full or
// the seed already has a twin, draws any figure through the bot's figure library, then
// inserts exactly like twin.mjs / sci-twin.mjs publish. dry:true = the automatic gates +
// the figure only, and it returns the blind-solve and checker briefs to run next.
// A refusal is 4xx {gate, problems}. AGENT_TOKEN_TWINS or admin (lib/twins-door.ts).
import { NextRequest, NextResponse } from 'next/server';
import { twinsDoor, stampTwins } from '@/lib/twins-door';
import { parseSubmit } from '@/lib/twin-gates';
import { submitMath, submitScience } from '@/lib/twin-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const r0 = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const denied = await twinsDoor(req, r0.dry === true ? 'check' : 'submit', { bank: r0.bank ?? null, seed_id: r0.seed_id ?? null });
  if (denied) return denied;
  const p = parseSubmit(raw);
  if (!p.ok) return NextResponse.json({ ok: false, gate: 'request', problems: [p.error] }, { status: 400 });
  const body = p.value;
  try {
    const out = body.bank === 'maths'
      ? await submitMath(body)
      : await submitScience(body, { topic: typeof r0.topic === 'string' ? r0.topic : null, pool: typeof r0.pool === 'string' ? r0.pool : null });
    if (!body.dry) {
      void stampTwins(out.ok, out.ok
        ? `${body.bank} twin of ${body.seed_id.slice(0, 8)} filed → ${out.id}`
        : `${body.bank} twin of ${body.seed_id.slice(0, 8)} refused at ${out.gate}: ${out.problems[0] ?? ''}`.slice(0, 290),
      { bank: body.bank, seed_id: body.seed_id, id: out.ok ? out.id : null, gate: out.ok ? null : out.gate });
    }
    if (!out.ok) return NextResponse.json(out, { status: out.status });
    return NextResponse.json(out);
  } catch (e) {
    void stampTwins(false, `${body.bank} submit error: ${(e as Error).message}`.slice(0, 290));
    return NextResponse.json({ ok: false, gate: 'server', problems: [(e as Error).message] }, { status: 500 });
  }
}
