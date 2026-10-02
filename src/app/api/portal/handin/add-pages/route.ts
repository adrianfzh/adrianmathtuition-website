// POST /api/portal/handin/add-pages — add forgotten pages to one of the student's
// own hand-ins while it is still waiting to be marked (29 Sep 2026, Adrian: "if
// they forgot to submit a page, can they submit the missing pages?").
//
//   { runId, action: 'hold' }              → keep the paper out of the queue for
//                                             10 min while they photograph
//   { runId, action: 'add', photoUrls }    → append the pages; the bot reads every
//                                             page and puts them in question order
//
// The student's session decides whose paper it is (student_id on the run) and
// whose uploads the URLs are (the handins/<identity>/ prefix). The bot decides
// whether marking has started (lib/add-pages.js there) and refuses politely.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { portalIdentity } from '@/lib/portal-auth';
import { ADD_PAGES_MAX, ownsHandinUrl } from '@/lib/add-pages';

export const runtime = 'nodejs';
export const maxDuration = 120;   // the bot reads every page once (~20–60 s for a full paper)

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts').select('id, airtable_student_id').eq('id', user.id).single();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = portalIdentity(account);

  let body: { runId?: unknown; action?: unknown; photoUrls?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const runId = typeof body.runId === 'string' ? body.runId : '';
  const action = body.action === 'hold' ? 'hold' : body.action === 'add' ? 'add' : '';
  if (!runId || !action) return NextResponse.json({ error: 'runId and action required' }, { status: 400 });

  const { data: run } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .select('id, student_id, released_at, result_json->portal_submission')
    .eq('id', runId).maybeSingle();
  if (!run || run.student_id !== studentId || !run.portal_submission) {
    return NextResponse.json({ error: "We couldn't find that paper." }, { status: 404 });
  }
  // A released paper takes pages as a page re-mark (phase 3) — the bot decides; no hold needed.
  if (run.released_at && action === 'hold') return NextResponse.json({ ok: true, hold_until: null });

  let photos: { original_url: string }[] = [];
  if (action === 'add') {
    const urls = Array.isArray(body.photoUrls)
      ? [...new Set(body.photoUrls.filter((u): u is string => typeof u === 'string'))] : [];
    if (!urls.length) return NextResponse.json({ error: 'No pages to add' }, { status: 400 });
    if (urls.length > ADD_PAGES_MAX) return NextResponse.json({ error: `A paper holds at most ${ADD_PAGES_MAX} pages.` }, { status: 400 });
    if (!urls.every((u) => ownsHandinUrl(u, studentId))) {
      return NextResponse.json({ error: 'A photo upload went wrong — please re-add your photos and try again.' }, { status: 400 });
    }
    photos = urls.map((u) => ({ original_url: u }));
  }

  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'Adding pages is temporarily unavailable' }, { status: 503 });
  let d: Record<string, unknown> = {};
  try {
    const r = await fetch(`${botBase}/api/mark-paper`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'hold' ? { phase: 'pages-hold', id: runId } : { phase: 'add-pages', id: runId, photos }),
      signal: AbortSignal.timeout(110_000),
    });
    d = await r.json().catch(() => ({}));
    if (r.status === 503) return NextResponse.json({ error: 'The marker is restarting — try again in a minute. Your photos are saved.' }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the marker — your photos are saved, tap Add again." }, { status: 502 });
  }
  if (d.ok === false) return NextResponse.json({ refused: d.refused, error: d.message || 'These pages could not be added.' }, { status: 409 });
  if (d.error) return NextResponse.json({ error: String(d.error) }, { status: 502 });
  return NextResponse.json(d);
}
