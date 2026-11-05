// POST /api/tutor/submit { studentId, paperName, subject, photoUrls } — a tutor hands in one
// of their students' papers (SPEC-TUTOR-TOOLS.md §7).
//
// The paper becomes an ordinary marking run (the bot's save-paper + set-student, exactly as
// /api/portal/submit does), so it is marked by the same machinery and comes back with the
// same red pen, totals and "where your marks went" cover. Three differences:
//   1. The run's student_id is 'tutor:<id>' and its student_name names the TUTOR, never the
//      student — the marked data Adrian keeps is anonymous (lib/tutor-portal).
//   2. It is NOT put in the 🌙 queue here. It waits in tutor_papers and joins the queue only
//      when no paper of Adrian's own students is waiting (lib/tutor-store
//      releaseWaitingTutorPapers).
//   3. The tutor's monthly cap is checked first; every hand-in is one row in tutor_papers,
//      the meter billing will read.
import { NextResponse, after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { ownsHandinUrl } from '@/lib/add-pages';
import {
  capState, cleanName, MAX_PAGES, sgtMonthKey, TUTOR_SUBJECTS,
  tutorRunStudentId, tutorRunStudentName,
} from '@/lib/tutor-portal';
import { botCall, papersUsedThisMonth, releaseWaitingTutorPapers } from '@/lib/tutor-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { studentId?: unknown; paperName?: unknown; subject?: unknown; photoUrls?: unknown };

  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: 'Pick a student.' }, { status: 400 });
  const paperName = cleanName(body.paperName, 80);
  if (!paperName) return NextResponse.json({ error: 'Name the paper (school, year, exam, paper number).' }, { status: 400 });
  const subject = (TUTOR_SUBJECTS as readonly string[]).includes(String(body.subject)) ? String(body.subject) : null;
  if (!subject) return NextResponse.json({ error: 'Pick the subject.' }, { status: 400 });
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((u): u is string => typeof u === 'string') : [];
  if (!photoUrls.length) return NextResponse.json({ error: 'Add the pages first.' }, { status: 400 });
  if (photoUrls.length > MAX_PAGES) return NextResponse.json({ error: `${MAX_PAGES} pages at most.` }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: student } = await sb.from('tutor_students').select('id').eq('id', studentId).eq('tutor_id', tutor.id).is('archived_at', null).maybeSingle();
  if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  const sid = tutorRunStudentId(studentId);
  if (!photoUrls.every(u => ownsHandinUrl(u, sid))) return NextResponse.json({ error: 'Those pages did not come from this hand-in.' }, { status: 400 });

  // The same photos again within the hour (a retried request) → the paper it already made.
  const { data: again } = await sb.from('paper_marking_runs').select('id')
    .eq('student_id', sid).gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
    .contains('source', { photos: [{ original_url: photoUrls[0] }] }).limit(1).maybeSingle();
  if (again?.id) return NextResponse.json({ ok: true, resumed: true });

  const month = sgtMonthKey();
  const cap = capState(await papersUsedThisMonth(sb, tutor.id, month), tutor.monthly_paper_cap);
  if (cap.full) return NextResponse.json({ error: `This month’s ${cap.cap} papers are used. More open on the 1st.` }, { status: 429 });

  const saved = await botCall({ phase: 'save-paper', paperName, subject: 'math', source: { photos: photoUrls.map(u => ({ original_url: u })) } }, 45_000);
  const runId = typeof saved?.run_id === 'string' ? saved.run_id : null;
  if (!runId) {
    console.error('[tutor-submit] save-paper failed:', saved?.error);
    return NextResponse.json({ error: 'The paper could not be saved — try again in a minute.' }, { status: 502 });
  }
  // Tag the run (what the bot's set-student phase writes) + the subject pill the health
  // check wants on every released run — one write, before the paper can be queued.
  await sb.from('paper_marking_runs')
    .update({ student_id: sid, student_name: tutorRunStudentName(tutor.display_name), paper_subject: subject })
    .eq('id', runId);

  const { data: row, error } = await sb.from('tutor_papers').insert({
    tutor_id: tutor.id, tutor_student_id: studentId, run_id: runId, paper_name: paperName,
    paper_subject: subject, pages: photoUrls.length, month,
  }).select('id').single();
  if (error || !row) {
    console.error('[tutor-submit] tutor_papers insert failed:', error?.message);
    return NextResponse.json({ error: 'The paper could not be saved — try again in a minute.' }, { status: 500 });
  }
  // Send it to the queue now if the queue is quiet; else it waits for the next check.
  after(async () => { try { await releaseWaitingTutorPapers(sb); } catch (e) { console.warn('[tutor-submit] release check failed:', (e as Error).message); } });
  return NextResponse.json({ ok: true, paperId: row.id, left: cap.left - 1 });
}
