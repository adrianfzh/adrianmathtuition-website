// POST /api/portal/event — fire-and-forget portal telemetry. ONE allow-list,
// two families (any other kind → 400: an allow-list, not a free-form event
// bus, so the kind space stays enumerable for one GROUP BY):
//   • 'marking:view' | 'marking:open' — MarkingBeacon.tsx fires them once on
//     mount of /app/marking and once per marked-script PDF open;
//     lib/portal-activity.ts's summariser reads exactly these two.
//   • lib/install-prompt.ts PORTAL_CLIENT_EVENT_KINDS (install:shown /
//     accepted / dismissed / ios-shown, push:nudge-*) — the Home install card
//     and the push nudge ("how many iPhones saw the card vs Android installs").
//
// Rows land in portal_event_log (identity, kind, created_at — no migration;
// the same ledger ask-log / lesson-event / timed-set write). Auth + identity +
// the write mirror src/app/api/portal/ask-log/route.ts: same session lookup,
// 401 for anonymous, service-client write, and a PER-FAMILY daily spam cap —
// each family counts only its own kinds, so a hammered beacon can't crowd out
// the other family's budget. Best-effort by contract: the client never sees
// anything but ok, so a card never stutters and a beacon never retries.
//
// Probed by /api/health-check (`portal-event`): anonymous POST must 401.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { portalIdentity, type PortalAccount } from '@/lib/portal-auth';
import { PORTAL_CLIENT_EVENT_KINDS, isPortalClientEventKind } from '@/lib/install-prompt';
import { sgtDayStart } from '@/lib/sgt';
import { SUBMIT_FAILED_KIND, sanitizeSubmitFailure, shouldNotifySubmitFailure, submitFailureLine } from '@/lib/submit-failure';
import { sendTelegram } from '@/lib/telegram';
import { SCIENCE_FEEDBACK_DAILY_CAP, SCIENCE_FEEDBACK_KIND, sanitizeScienceFeedback, scienceFeedbackLine } from '@/lib/science-feedback';

// A hand-in that failed on the phone after every retry (lib/submit-failure.ts,
// 7 Sep 2026): its own family, a small cap, a detail payload, and one Telegram
// line per student per hour so Adrian hears before a parent does.
const SUBMIT_DAILY_CAP = 20;

export const runtime = 'nodejs';

const MARKING_KINDS = ['marking:view', 'marking:open'] as const;
// Generous but bounded — a student opening every paper they own repeatedly in
// one day still lands nowhere near this; it only stops a runaway client loop.
const MARKING_DAILY_CAP = 500;
// A real device emits a handful of install/push events per day at most.
const CLIENT_DAILY_CAP = 100;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, display_name')
    .eq('id', user.id)
    .single<Pick<PortalAccount, 'id' | 'airtable_student_id' | 'display_name'>>();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { kind?: unknown; detail?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const kind = typeof body.kind === 'string' ? body.kind : '';
  const family = (MARKING_KINDS as readonly string[]).includes(kind)
    ? 'marking'
    : kind === SUBMIT_FAILED_KIND ? 'submit'
    : kind === SCIENCE_FEEDBACK_KIND ? 'science'
    : isPortalClientEventKind(kind) ? 'client' : null;
  if (!family) return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  const failure = family === 'submit' ? sanitizeSubmitFailure(body.detail) : null;
  if (family === 'submit' && !failure) return NextResponse.json({ error: 'Bad detail' }, { status: 400 });
  // 🧪 "Was this useful?" on a science paper (lib/science-feedback.ts, 11 Sep
  // 2026): its own family, a detail payload, one Telegram line per tap.
  const feedback = family === 'science' ? sanitizeScienceFeedback(body.detail) : null;
  if (family === 'science' && !feedback) return NextResponse.json({ error: 'Bad detail' }, { status: 400 });

  const identity = portalIdentity(account);
  try {
    const svc = createServiceClient();
    const familyKinds = family === 'marking' ? [...MARKING_KINDS] : family === 'submit' ? [SUBMIT_FAILED_KIND] : family === 'science' ? [SCIENCE_FEEDBACK_KIND] : [...PORTAL_CLIENT_EVENT_KINDS];
    const cap = family === 'marking' ? MARKING_DAILY_CAP : family === 'submit' ? SUBMIT_DAILY_CAP : family === 'science' ? SCIENCE_FEEDBACK_DAILY_CAP : CLIENT_DAILY_CAP;
    const { count } = await svc
      .from('portal_event_log')
      .select('id', { count: 'exact', head: true })
      .eq('identity', identity)
      .in('kind', familyKinds)
      .gte('created_at', sgtDayStart().toISOString());
    if ((count ?? 0) >= cap) return NextResponse.json({ ok: true, capped: true });
    if (failure) {
      // Was there already a failure from this student inside the hour? Read
      // BEFORE inserting this one, so the first of a burst is the one that talks.
      const { data: prev } = await svc.from('portal_event_log').select('created_at')
        .eq('identity', identity).eq('kind', SUBMIT_FAILED_KIND)
        .order('created_at', { ascending: false }).limit(1).maybeSingle<{ created_at: string }>();
      await svc.from('portal_event_log').insert({ identity, kind, detail: failure });
      if (shouldNotifySubmitFailure(prev?.created_at, new Date())) {
        await sendTelegram(submitFailureLine(account.display_name, failure), 'marking').catch(() => {});
      }
    } else if (feedback) {
      // The paper's name for the line — only a paper this student owns.
      const { data: run } = await svc.from('paper_marking_runs').select('paper_name')
        .eq('id', feedback.runId).eq('student_id', identity).maybeSingle<{ paper_name: string | null }>();
      if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      await svc.from('portal_event_log').insert({ identity, kind, detail: feedback });
      await sendTelegram(scienceFeedbackLine(account.display_name, run.paper_name, feedback), 'marking').catch(() => {});
    } else {
      await svc.from('portal_event_log').insert({ identity, kind });
    }
  } catch (e) {
    // Telemetry is best-effort by contract — report ok so the client never retries.
    console.error('[portal/event] write failed:', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
