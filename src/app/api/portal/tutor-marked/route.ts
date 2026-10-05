// POST /api/portal/tutor-marked — file a paper the tutor marked ON PAPER (5 Oct 2026,
// Adrian: "allow students to upload physically marked copies of exam papers - so they
// have one place they can keep track"). lib/tutor-marked has the rules.
//
//   { photoUrls[], paperName, subject? }            → the total is read off the pages
//   { photoUrls[], paperName, subject?, awarded, max } → the student typed the score
//
// Read sure → filed, { ok, runId, awarded, max, scoreFrom:'read' }.
// Read not sure → 409 { needsScore:true, guess } and NOTHING is filed; the page asks
// the student to type the score and sends again with it.
// No computer marking, no queue, no weekly limit (Adrian: "2-a-week limit is papers i
// actually mark"). Behind TUTOR_MARKED_UPLOAD_OPEN_TO_STUDENTS. Anonymous → 401
// (health-check `portal-tutor-marked`).
import { NextResponse } from 'next/server';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { tutorMarkedUploadOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ownsHandinUrl } from '@/lib/add-pages';
import { allowedSubjects, paperSubjectFromName } from '@/lib/portal-subjects';
import { checkScore, tutorMarkedRunRow, TUTOR_MARKED_MAX_PAGES } from '@/lib/tutor-marked';
import { readTutorTotal } from '@/lib/tutor-marked-reader';
import { sendTelegram } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** A repeat of the same first photo this soon is the same upload sent again. */
const RESUBMIT_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await tutorMarkedUploadOpen())) return NextResponse.json({ error: 'Not available yet.' }, { status: 404 });
  const sid = portalIdentity(account);

  const body = await req.json().catch(() => ({} as Record<string, unknown>)) as {
    photoUrls?: unknown; paperName?: unknown; subject?: unknown; awarded?: unknown; max?: unknown;
  };
  const photoUrls = Array.isArray(body.photoUrls)
    ? [...new Set(body.photoUrls.filter((u): u is string => typeof u === 'string'))]
    : [];
  if (!photoUrls.length) return NextResponse.json({ error: 'Add the pages of your marked paper first.' }, { status: 400 });
  if (photoUrls.length > TUTOR_MARKED_MAX_PAGES) {
    return NextResponse.json({ error: `That's too many pages for one paper (max ${TUTOR_MARKED_MAX_PAGES}).` }, { status: 400 });
  }
  if (photoUrls.some(u => !ownsHandinUrl(u, sid))) {
    return NextResponse.json({ error: 'A photo upload went wrong — please re-add your photos and try again.' }, { status: 400 });
  }
  const paperName = typeof body.paperName === 'string' ? body.paperName.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (!paperName) return NextResponse.json({ error: 'Tell us which paper this is (e.g. "Xinmin 2024 Prelim P2").' }, { status: 400 });

  // Which maths: the student's pick when it is one of theirs, else the name, else their only one.
  const allowed = allowedSubjects(account);
  const picked = typeof body.subject === 'string' ? allowed.find(s => s === body.subject) : undefined;
  const fromName = paperSubjectFromName(paperName);
  const paperSubject = picked ?? (fromName && allowed.includes(fromName) ? fromName : null) ?? (allowed.length === 1 ? allowed[0] : fromName);

  const sb = getSupabaseAdmin();
  // The same upload arriving twice (a dropped reply) → the paper it already made.
  const { data: already } = await sb.from('paper_marking_runs').select('id, total_awarded, total_max')
    .eq('student_id', sid).eq('source', 'tutor-marked')
    .gte('created_at', new Date(Date.now() - RESUBMIT_WINDOW_MS).toISOString())
    .contains('result_json', { source: { photos: [{ original_url: photoUrls[0] }] } })
    .limit(1).maybeSingle();
  if (already?.id) return NextResponse.json({ ok: true, runId: already.id, awarded: already.total_awarded, max: already.total_max, resumed: true });

  // The score: typed, or read once off the pages.
  let score = (body.awarded !== undefined || body.max !== undefined) ? checkScore(body.awarded, body.max) : null;
  let scoreFrom: 'read' | 'typed' = 'typed';
  if (body.awarded !== undefined || body.max !== undefined) {
    if (!score) return NextResponse.json({ error: 'Check the score — marks scored, out of the paper’s total.' }, { status: 400 });
  } else {
    const read = await Promise.race([
      readTutorTotal(photoUrls).catch(e => { console.warn('[tutor-marked] read failed:', (e as Error).message); return null; }),
      new Promise<null>(r => setTimeout(() => r(null), 40_000)),
    ]);
    if (!read || !read.sure) {
      return NextResponse.json({ needsScore: true, guess: read ? { awarded: read.awarded, max: read.max } : null }, { status: 409 });
    }
    score = { awarded: read.awarded, max: read.max };
    scoreFrom = 'read';
  }

  const row = tutorMarkedRunRow({
    studentId: sid, studentName: account.display_name || '', paperName, paperSubject,
    pageUrls: photoUrls, awarded: score!.awarded, max: score!.max, scoreFrom, at: new Date().toISOString(),
  });
  const { data: saved, error } = await sb.from('paper_marking_runs').insert(row).select('id').single();
  if (error || !saved) {
    console.error('[tutor-marked] insert failed:', error?.message);
    return NextResponse.json({ error: 'Your paper could not be saved — try again in a minute.' }, { status: 502 });
  }

  const who = escapeTelegramHtml(account.display_name || 'A student');
  sendTelegram(
    `📝 <b>${who}</b> filed a paper you marked on paper — “${escapeTelegramHtml(paperName)}”, ${score!.awarded}/${score!.max} (${scoreFrom === 'read' ? 'total read off the page' : 'score typed by the student'}). Kept in their Papers, no marking.`,
    'marking',
  ).catch(() => {});

  return NextResponse.json({ ok: true, runId: saved.id, awarded: score!.awarded, max: score!.max, scoreFrom });
}
