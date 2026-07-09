// POST /api/portal/learn/event — fire-and-forget usage ledger for the Learn
// player. Records completion / check pass|fail / decision wrong-pick events on
// the unit_events table, feeding weakness resurfacing (overview.review + the
// dashboard "Review time" card) and the explain-it-back daily cap.
//
// Auth: portal student session OR admin Bearer. Only student events are stored
// (admin is Adrian testing — nothing to personalise). Always returns 200 so the
// client never has to handle a failure; a bad body just no-ops.
import { NextRequest, NextResponse } from 'next/server';
import { practiceAuth } from '@/lib/practice';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// The events the player itself reports. explain_pass/explain_fail are written
// only by the /explain route (which owns the rate limit), never accepted here.
const ALLOWED = new Set(['completed', 'check_pass', 'check_fail', 'decision_wrong']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const caller = await practiceAuth(req);
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin has no student context — accept and ignore.
  if (caller.kind !== 'student') return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({}));
  const event = String(body?.event || '');
  if (!ALLOWED.has(event)) return NextResponse.json({ ok: false });

  const rawId = String(body?.unitId || '');
  const row = {
    user_id: caller.account.id,
    unit_id: UUID.test(rawId) ? rawId : null, // fixture ids aren't uuids → null
    subject: body?.subject ? String(body.subject).slice(0, 40) : null,
    topic: body?.topic ? String(body.topic).slice(0, 200) : null,
    kind: body?.kind ? String(body.kind).slice(0, 20) : null,
    event,
  };

  // Fire-and-forget: never surface a DB hiccup to the player.
  try {
    await getSupabaseAdmin().from('unit_events').insert(row);
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true });
}
