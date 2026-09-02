// POST /api/portal/lesson-event — fire-and-forget lesson telemetry.
// Body: { slug, scene: number } (scene entered), { slug, done: true }, or
// { slug, narrated: true } (the voice track was started — once per visit).
//
// Rows land in portal_event_log (identity, kind, created_at — no migration:
// the scene index is folded into the kind), as:
//
//   lesson:<slug>:scene:<n>   lesson:<slug>:done   lesson:<slug>:narrated
//
// Cardinality is bounded: slugs come only from lib/lesson-catalog.ts and the
// scene index is capped, so the kind space stays enumerable for funnels
// ("how far into binomial-theorem-am do students get?" = one GROUP BY kind;
// "what share of visits use the voice?" = narrated ÷ scene:0).
//
// Student session only; anonymous POST must 401 — probed by /api/health-check
// (the assignments-route pattern). Fail-open counters, fail-soft writes: this
// route must never make the player stutter.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { lessonBySlug } from '@/lib/lesson-catalog';
import { sgtDayStart } from '@/lib/sgt';

export const runtime = 'nodejs';

/** Scene indexes are folded into the event kind — cap them so a buggy client
 *  can't mint unbounded kind values. No script is anywhere near 50 scenes. */
const MAX_SCENE_INDEX = 49;
/** Per-student daily row cap (SGT day) — same spam brake shape as ask-log. */
const DAILY_EVENT_CAP = 500;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'id' | 'airtable_student_id'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { slug?: unknown; scene?: unknown; done?: unknown; narrated?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!lessonBySlug(slug)) return NextResponse.json({ error: 'Unknown lesson' }, { status: 400 });

  let kind: string;
  if (body.done === true) {
    kind = `lesson:${slug}:done`;
  } else if (body.narrated === true) {
    kind = `lesson:${slug}:narrated`;
  } else if (
    typeof body.scene === 'number' && Number.isInteger(body.scene)
    && body.scene >= 0 && body.scene <= MAX_SCENE_INDEX
  ) {
    kind = `lesson:${slug}:scene:${body.scene}`;
  } else {
    return NextResponse.json({ error: 'scene (0-based index), done:true or narrated:true required' }, { status: 400 });
  }

  const identity = portalIdentity(account);
  const svc = createServiceClient();
  try {
    // SGT-midnight window, same bound as ask-log's cap.
    const sgtMidnight = sgtDayStart();
    const { count } = await svc
      .from('portal_event_log')
      .select('id', { count: 'exact', head: true })
      .eq('identity', identity)
      .like('kind', 'lesson:%')
      .gte('created_at', sgtMidnight.toISOString());
    if ((count ?? 0) >= DAILY_EVENT_CAP) return NextResponse.json({ ok: true, capped: true });
    await svc.from('portal_event_log').insert({ identity, kind });
  } catch (e) {
    // Telemetry is best-effort by contract — report ok so the client never retries.
    console.error('[lesson-event] write failed:', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
