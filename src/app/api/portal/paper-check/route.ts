// POST /api/portal/paper-check { paperName } → { named, available, via, label, key }
//
// "Do we hold the questions for the paper this student is about to hand in?"
// Asked from /app/submit while the name is still being typed (Adrian, 10 Sep
// 2026: "app should hint if we do not have the question paper in the database"),
// answered by the bot's read-only phase:'paper-available' — no run, no mark
// spent, nothing written anywhere.
//
// FAILS OPEN, always. A timeout, a 5xx, an undeployed bot, a garbled body: all
// answer `available` (lib/paper-check QUIET), because the only thing this route
// can do is ASK a student for two more photographs, and asking wrongly for
// pages we already hold is worse than not asking at all. It can never delay or
// refuse a hand-in — the submit POST does not wait for it.
//
// Anonymous → 401 (the health-check probes this).
import { NextResponse } from 'next/server';
import { sessionAccount } from '@/lib/portal-auth';
import { QUIET, looksLikeNamedPaper, shapePaperCheck } from '@/lib/paper-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Long enough for a warm Fly round trip, short enough that a typing student never waits on it. */
const BOT_TIMEOUT_MS = 3000;

export async function POST(req: Request) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({} as { paperName?: unknown }));
  const paperName = typeof (body as { paperName?: unknown }).paperName === 'string'
    ? (body as { paperName: string }).paperName.trim().slice(0, 80)
    : '';
  // Not worth a round trip: the bot would need a 4-digit year to name a paper at
  // all (lib/paper-key reads one only out of the name itself).
  if (!looksLikeNamedPaper(paperName)) return NextResponse.json(QUIET);

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json(QUIET);

  try {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase: 'paper-available',
        paperName,
        // The student's own name is stripped out of the key the same way the
        // marker strips it, so "isabelle TYS AM 2025 P2" parses identically here
        // and at marking time.
        studentName: account.display_name || '',
      }),
      signal: AbortSignal.timeout(BOT_TIMEOUT_MS),
    });
    if (!r.ok) return NextResponse.json(QUIET);
    return NextResponse.json(shapePaperCheck(await r.json().catch(() => null)));
  } catch (e) {
    console.warn('[paper-check] bot unreachable:', (e as Error).message);
    return NextResponse.json(QUIET);
  }
}
