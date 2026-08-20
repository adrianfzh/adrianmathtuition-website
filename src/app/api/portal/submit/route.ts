// POST /api/portal/submit — a student hands in a photographed paper.
//
// The submission IS a saved mark-paper run: the bot's phase:'save-paper' creates
// the same "⏳ uploaded — not marked yet" row Adrian's own uploads make, so it
// appears in /admin/mark-paper history with the ▶ Mark button, counts on the
// admin hub's ⏳ papers-to-mark card, and rides the existing remark machinery.
// Nothing new to mark FROM — only a new door IN.
//
// Hand-ins AUTO-QUEUE (Adrian, 13 Aug 2026 — "auto-mark hand-ins"): the run goes
// straight into the bot's 🌙 marking queue via phase:'enqueue', so instead of a
// "come tap ▶ Mark" doorbell, Adrian's Telegram gets the FINISHED marking with the
// 🖼 PDF attached (the queue worker's message, which names the student and nudges
// Release). The doorbell text below survives only as the fallback when the enqueue
// itself fails — a hand-in must never sit silent. The release gate is untouched:
// the run reaches /app/marking only when Adrian releases it in triage, because the
// queue's flags only catch what the model *doubts* — one human glance before a
// student sees red ink stays worth it.
//
// Ownership is stamped server-side from the session — the client sends photo
// URLs and an optional name, never a student id. A URL is accepted only from
// OUR blob store AND under this student's own portal prefix (the submit-token
// route pins uploads there), so one student cannot submit another's photos.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isOurBlobUrl } from '@/lib/blob-url';
import { DAILY_SUBMIT_CAP, sgtStartOfDayIso } from '@/lib/portal-submit-limit';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PAGES = 20;

function sgtToday(): string {
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
    .format(new Date());
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('airtable_student_id, display_name')
    .eq('id', user.id)
    .single();
  if (!account?.airtable_student_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = account.airtable_student_id;

  let body: { photoUrls?: unknown; paperName?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const photoUrls = Array.isArray(body.photoUrls)
    ? [...new Set(body.photoUrls.filter((u): u is string => typeof u === 'string'))]
    : [];
  if (!photoUrls.length) return NextResponse.json({ error: 'No photos to submit' }, { status: 400 });
  if (photoUrls.length > MAX_PAGES) {
    return NextResponse.json({ error: `That's too many pages for one paper (max ${MAX_PAGES}) — submit the rest as a second paper.` }, { status: 400 });
  }
  for (const u of photoUrls) {
    let ok = false;
    if (isOurBlobUrl(u)) {
      try { ok = new URL(u).pathname.startsWith(`/mark-paper/portal/${studentId}/`); } catch { ok = false; }
    }
    if (!ok) return NextResponse.json({ error: 'A photo upload went wrong — please re-add your photos and try again.' }, { status: 400 });
  }

  const paperName =
    (typeof body.paperName === 'string' && body.paperName.trim().slice(0, 80)) ||
    `Submitted ${sgtToday()}`;

  // Phase G hardening (Adrian, 21 Aug 2026): one hand-in per student per SGT
  // calendar day — replaces the earlier 3-per-10-min soft brake. Counts runs
  // actually saved, so a failed submission does not burn the day's slot.
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from('paper_marking_runs')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('result_json->>portal_submission', 'true')
    .gte('created_at', sgtStartOfDayIso());
  if ((count ?? 0) >= DAILY_SUBMIT_CAP) {
    return NextResponse.json({ error: 'You have already sent in a paper today — Mr Fong takes one paper per student per day. Send the next one tomorrow!' }, { status: 429 });
  }

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'Submissions are temporarily unavailable' }, { status: 503 });
  const bot = async (payload: Record<string, unknown>) => {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json().catch(() => ({}));
  };

  const saved = await bot({
    phase: 'save-paper',
    paperName,
    source: { photos: photoUrls.map(u => ({ original_url: u })) },
  });
  const runId = saved?.run_id;
  if (!runId) {
    console.error('[portal-submit] save-paper failed:', saved?.error);
    return NextResponse.json({ error: 'The submission could not be saved — try again in a minute.' }, { status: 502 });
  }

  // Tag the run to its student (same phase the admin send row uses).
  await bot({ phase: 'set-student', id: runId, studentId, studentName: account.display_name || '' });

  // Stamp HOW it arrived, so student-facing surfaces can show "with Mr Fong" for
  // portal hand-ins without ever picking up papers Adrian uploaded himself.
  // Read-merge-write on a row created milliseconds ago — nothing else has it yet.
  try {
    const { data: row } = await admin.from('paper_marking_runs').select('result_json').eq('id', runId).single();
    const rj = (row?.result_json && typeof row.result_json === 'object') ? row.result_json as Record<string, unknown> : {};
    await admin.from('paper_marking_runs').update({ result_json: { ...rj, portal_submission: true } }).eq('id', runId);
  } catch (e) {
    console.warn('[portal-submit] portal_submission stamp failed:', (e as Error).message);
  }

  // Auto-queue the hand-in for marking (after the stamp above, so the queue
  // worker can never claim the run while the stamp's read-merge-write is in
  // flight). phase:'enqueue' defaults to opus/teacher — the same marking Adrian's
  // own 🌙 button queues. On success we send NOTHING: the queue worker's finished-
  // marking Telegram (student name + 🖼 PDF + Release nudge) is the doorbell now.
  const who = account.display_name || 'A student';
  let queued = false;
  try {
    const q = await bot({ phase: 'enqueue', id: runId });
    queued = !!q?.ok;
    if (!queued) console.warn('[portal-submit] enqueue failed:', q?.error);
  } catch (e) {
    console.warn('[portal-submit] enqueue failed:', (e as Error).message);
  }
  if (!queued) {
    // The run is saved either way — but with no queue entry nobody would ever
    // hear about it, so fall back to the old "come tap ▶ Mark" doorbell.
    sendTelegram(
      `📬 <b>${who}</b> submitted a paper for marking — ${photoUrls.length} page${photoUrls.length === 1 ? '' : 's'}` +
      ` — “${paperName}”.\nAuto-queue failed, so it's waiting as ⏳ in /admin/mark-paper history — tap ▶ Mark yourself.`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, runId });
}
