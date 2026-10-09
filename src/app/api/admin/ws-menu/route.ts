// /api/admin/ws-menu — the door behind /admin/worksheets, the Telegram /ws menu as a
// page (9 Oct 2026). Admin only. It does the two things a browser cannot:
//
//   GET  ?level=AM         → { topics }   the level's topic list, the same one the bot
//                                         shows (it asks /api/bot/worksheet in dry mode)
//   POST { form }          → kind 3:      { lane:'instant', sheet }  the PDF, at once
//                            kinds 1,2,4,5: { lane:'queued', job }    one worksheet_jobs row
//
// The request is built by lib/ws-menu `buildWsRequest` (pure, tested against the bodies
// the bot builds), never taken from the browser. Kind 3 goes to /api/bot/worksheet with
// the bot's own header; a queued kind is inserted through `jobInsert`, the same validator
// /api/admin/worksheet-jobs uses, with `requested_by` = Adrian's Telegram chat — so the
// finished .docx is sent there exactly as a /ws job's is. Nothing is sent from here.
// Listing jobs, a topic's sheets and skills, and cancel stay on /api/admin/worksheet-jobs.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jobInsert, type WorksheetJob } from '@/lib/worksheet-jobs';
import { buildWsRequest, WS_LEVELS, WS_PAPERS, type WsForm } from '@/lib/ws-menu';
import { TtlCache } from '@/lib/bot-worksheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const topicsCache = new TtlCache<string[]>(10 * 60_000);
const IMPOSSIBLE_TOPIC = '__list_topics__';   // never matches → the 400 carries validTopics (the bot's own trick)

async function callWorksheet(req: NextRequest, body: Record<string, unknown>, timeoutMs: number) {
  const secret = (process.env.RENDER_MARKING_SECRET || '').trim();
  if (!secret) return { status: 0, data: { error: 'the worksheet door is not set up on this deployment' } as Record<string, unknown> };
  try {
    const r = await fetch(`${req.nextUrl.origin}/api/bot/worksheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-render-secret': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: { error: (e as Error).message } as Record<string, unknown> };
  }
}

async function topicsFor(req: NextRequest, level: string): Promise<string[] | null> {
  const hit = topicsCache.get(level);
  if (hit) return hit;
  const r = await callWorksheet(req, { dry: true, level, topic: IMPOSSIBLE_TOPIC }, 15_000);
  const topics = r.status === 400 && Array.isArray(r.data.validTopics) ? (r.data.validTopics as unknown[]).map(String) : null;
  if (topics?.length) topicsCache.set(level, topics);
  return topics;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const level = String(req.nextUrl.searchParams.get('level') || '').trim().toUpperCase();
  if (!WS_LEVELS.some((l) => l.token === level)) return NextResponse.json({ error: 'level required' }, { status: 400 });
  const topics = await topicsFor(req, level);
  if (!topics) return NextResponse.json({ error: 'Could not read the topic list. Try again.' }, { status: 502 });
  return NextResponse.json({ topics });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { form?: WsForm };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const form = (body.form && typeof body.form === 'object' ? body.form : {}) as WsForm;

  // the level whose topic list the names are checked against (a paper's own level for kind 5)
  const level = form.kind === 5 ? WS_PAPERS.find((p) => p.key === form.paper)?.level : String(form.level || '').toUpperCase();
  const needsTopics = form.kind !== 5 || (form.exclude ?? []).length > 0;
  const topics = level && needsTopics && WS_LEVELS.some((l) => l.token === level) ? await topicsFor(req, level) : [];
  if (!topics) return NextResponse.json({ error: 'Could not read the topic list. Try again.' }, { status: 502 });

  const chat = Number(String(process.env.TELEGRAM_CHAT_ID || '').trim()) || null;
  const built = buildWsRequest(form, topics, chat);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  if (built.lane === 'instant') {
    const r = await callWorksheet(req, built.body, 50_000);
    if (r.status === 200 && r.data.url) return NextResponse.json({ lane: 'instant', sheet: r.data });
    const error = r.status === 404 ? 'The bank has no questions for that choice. Try another topic, or Mixed.'
      : r.status === 400 ? String(r.data.error || 'That topic is not on the list for this level.')
      : `The worksheet could not be built (${r.status || 'no answer'}). Try again in a minute.`;
    return NextResponse.json({ error }, { status: r.status === 404 || r.status === 400 ? r.status : 502 });
  }

  if (!chat) return NextResponse.json({ error: 'No Telegram chat is set up to send the file to.' }, { status: 500 });
  const ins = jobInsert(built.body);
  if (!ins.ok) return NextResponse.json({ error: ins.error }, { status: 400 });
  const { data: job, error } = await getSupabaseAdmin().from('worksheet_jobs').insert(ins.row).select('*').single<WorksheetJob>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lane: 'queued', job });
}
