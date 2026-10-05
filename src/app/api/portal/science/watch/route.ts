// ▶ Watch it (5 Oct 2026) — the animated worked solution for one science MCQ.
//
//   GET  /api/portal/science/watch?id=<qid>  → { title, topic, scenes } | 404 when the question has no clip
//   POST /api/portal/science/watch {id}      → { urls } — the beats' voice clips (MiniMax, made once, cached)
//
// The clip is built from the committed spec (lib/watch-it-store → lib/watch-it
// buildWatchScript): no model call. Signed-in only (401 anonymous — the
// health-check probes it), and the switch: watchItVisible() — Adrian's admin
// cookie only until WATCH_IT_OPEN_TO_STUDENTS flips (403 otherwise).
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sessionAccount } from '@/lib/portal-auth';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { watchItVisible } from '@/lib/portal-beta';
import { buildWatchScript } from '@/lib/watch-it';
import { watchSpecFor } from '@/lib/watch-it-store';
import { buildPlayScenes } from '@/lib/lesson-load';
import { ensureBeatVoice } from '@/lib/explain-voice-store';
import { VOICE_EXT, sayHash } from '@/lib/explain-voice';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function gate(): Promise<NextResponse | null> {
  const admin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  if (!admin && !(await sessionAccount())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await watchItVisible())) return NextResponse.json({ error: 'Not open yet' }, { status: 403 });
  return null;
}

const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function GET(req: NextRequest) {
  const denied = await gate();
  if (denied) return denied;
  const id = (req.nextUrl.searchParams.get('id') || '').trim();
  if (!idOk(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const spec = watchSpecFor(id);
  if (!spec) return NextResponse.json({ error: 'No clip for this question' }, { status: 404 });
  const script = buildWatchScript(spec);
  return NextResponse.json({ slug: script.slug, title: script.title, topic: script.topic, minutes: script.minutes, theme: script.theme, character: script.character, scenes: buildPlayScenes(script, new Map()) });
}

/** One question's clips sit together; a changed sentence gets a new clip (the hash). */
const watchVoiceFolder = (qid: string) => `pages/watch-it/${qid.toLowerCase()}`;

export async function POST(req: NextRequest) {
  const denied = await gate();
  if (denied) return denied;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id ?? '').trim();
  if (!idOk(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const spec = watchSpecFor(id);
  if (!spec) return NextResponse.json({ error: 'No clip for this question' }, { status: 404 });
  const folder = watchVoiceFolder(id);
  const { urls, made, failed } = await ensureBeatVoice(folder, (k, say) => `${folder}/b${k}-${sayHash(say)}.${VOICE_EXT}`, buildWatchScript(spec), `watch ${id}`);
  return NextResponse.json({ urls, made, failed });
}
