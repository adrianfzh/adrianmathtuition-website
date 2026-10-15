// 🎬 Question clips (SPEC-CLIP-PIPELINE.md §9, 15 Oct 2026) — the door's state, and asking for one.
//
//   GET  /api/portal/question-clip?id=<qid>  → { status, line, href }   (status null = none yet)
//   POST /api/portal/question-clip {id, from, retry?}  → { status }   ADMIN ONLY: queue the clip
//   POST /api/portal/question-clip {id, verdict: 'good'|'not_good'|null, note?}  ADMIN ONLY: his watch
//
// Signed-in only (401), and the switch: questionClipsVisible() — Adrian's admin cookie and the
// preview student until QUESTION_CLIPS_OPEN_TO_STUDENTS flips (403). A student never sees a clip
// that is not ready, and never the reasons.
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/admin-session';
import { questionClipsAdmin, questionClipsVisible } from '@/lib/portal-beta';
import { clipStatusLine } from '@/lib/question-clip';
import { enqueueQuestionClip, getQuestionClip, setQuestionClipVerdict } from '@/lib/question-clip-store';

export const dynamic = 'force-dynamic';

const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function GET(req: NextRequest) {
  const admin = verifyAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  const acct = admin ? null : await sessionAccount();
  if (!admin && !acct) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await questionClipsVisible(acct ? portalIdentity(acct) : null))) return NextResponse.json({ error: 'Not open yet' }, { status: 403 });
  const id = (req.nextUrl.searchParams.get('id') || '').trim();
  if (!idOk(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const row = await getQuestionClip(id, false);
  const isAdmin = await questionClipsAdmin();
  const status = row?.status ?? null;
  if (!isAdmin && status !== 'ready') return NextResponse.json({ status: null });
  return NextResponse.json({
    status, canMake: isAdmin, line: clipStatusLine(status, isAdmin ? row?.refuse_reason : null),
    href: `/app/clip/q/${id}`,
  });
}

export async function POST(req: NextRequest) {
  if (!(await questionClipsAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body.id ?? '').trim();
  if (!idOk(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if ('verdict' in body) {
    const v = body.verdict === 'good' || body.verdict === 'not_good' ? body.verdict : null;
    await setQuestionClipVerdict(id, v, typeof body.note === 'string' ? body.note : null);
    return NextResponse.json({ ok: true });
  }
  const from = ['practice', 'paper', 'admin'].includes(String(body.from)) ? String(body.from) : 'admin';
  const status = await enqueueQuestionClip(id, from, body.retry === true);
  if (status === 'missing') return NextResponse.json({ error: 'No such question' }, { status: 404 });
  return NextResponse.json({ status, line: clipStatusLine(status) });
}
