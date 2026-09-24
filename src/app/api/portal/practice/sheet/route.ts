// POST /api/portal/practice/sheet — 📷 photos in, one sheet a day out
// (SPEC-PRACTICE-PHOTO.md §14, 24 Sep 2026).
//
//   { photos: [dataUrl, …] ≤ 5, level?, workedExample? }
//     → every photo is read by the bot (text · ONE sub-skill · marks) and given
//       a bank seed the student may see (lib/practice-photo-classify); the
//       photos go to the student's own folder in the student-files bucket; ONE
//       sheet_jobs row of kind 'photo-sheet' (no run) carries them; ONE
//       portal_assignments worksheet row ('writing', source 'practice-photo')
//       shows on the Practice list at once. The waiting list (lib/daily-queue):
//       one sheet a day, today first, then the first free day up to three days
//       ahead — a queued job carries scheduled_for and is claimed from midnight
//       SGT of that day (the sheet worker's peek/next filter).
//     ← { ok, assignmentId, day, waits, message }
//   { action: 'remove', id }  — the student takes a sheet back (queued OR still
//       being written — the questions are just filed): the job is cancelled,
//       the assignment revoked.
//
// Gates: practicePhotoOpen (admin cookie / demo student while the flag is off),
// requireActiveAccess. Sizes: the body must stay under Vercel's 4.5 MB — the
// client downscales to 1400 px and lib/practice-sheet refuses a photo over
// MAX_PHOTO_DATA_URL_CHARS. Health-check probes the 401.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createServiceClient } from '@/lib/supabase-server';
import { resolveFindLevel } from '@/lib/portal-find';
import { portalIdentity } from '@/lib/portal-auth';
import { requireActiveAccess } from '@/lib/portal-passes';
import { practicePhotoOpen } from '@/lib/portal-beta';
import { logFindRow } from '@/lib/find-assign';
import { classifyPhoto, type ClassifyAccount } from '@/lib/practice-photo-classify';
import { PHOTO_UNREADABLE_MESSAGE } from '@/lib/practice-photo';
import { parseSheetBody, dataUrlBytes, sheetTitle, photoTopics, sheetSentMessage, PHOTO_SHEET_ALLOWANCE } from '@/lib/practice-sheet';
import { placeInQueue, usedByDay, dayWord } from '@/lib/daily-queue';
import { sgtTodayISO, sgtDateISO } from '@/lib/sgt';
import { putStudentFile, handinKey } from '@/lib/student-files';
import { sendTelegram } from '@/lib/telegram';
import type { SheetJobPhoto } from '@/lib/sheet-jobs';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Account = ClassifyAccount & { airtable_student_id: string | null; display_name: string | null };

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { data: account } = await supabase.from('portal_accounts')
    .select('id, airtable_student_id, level, subjects, is_ip, display_name')
    .eq('id', user.id).maybeSingle<Account>();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const identity = portalIdentity(account);
  if (!(await practicePhotoOpen())) return NextResponse.json({ error: 'Not open yet' }, { status: 403 });
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = createServiceClient();

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // ── Remove: a queued (or writing) sheet the student no longer wants ────────
  if (body.action === 'remove') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: asg } = await admin.from('portal_assignments').select('id, status, sheet_job_id')
      .eq('id', id).eq('airtable_student_id', identity).eq('source', 'practice-photo').eq('kind', 'worksheet')
      .maybeSingle<{ id: string; status: string; sheet_job_id: string | null }>();
    if (!asg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (asg.status !== 'writing') return NextResponse.json({ error: 'This sheet is already written — it stays on your list.' }, { status: 409 });
    if (asg.sheet_job_id) {
      await admin.from('sheet_jobs')
        .update({ status: 'cancelled', stage: 'removed by the student', claimed_by: null, claimed_at: null, heartbeat_at: null })
        .eq('id', asg.sheet_job_id).in('status', ['queued', 'claimed']);
    }
    await admin.from('portal_assignments').update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', asg.id).eq('status', 'writing');
    return NextResponse.json({ ok: true, removed: true });
  }

  // ── A new sheet ────────────────────────────────────────────────────────────
  const parsed = parseSheetBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const ask = parsed.value;
  const level = resolveFindLevel(ask.level, account);
  const botBase = process.env.BOT_BASE_URL, botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });

  // The waiting list first — no point reading five photos for a full week.
  const now = new Date();
  const today = sgtTodayISO(now);
  const sgtMidnight = new Date(`${today}T00:00:00+08:00`).toISOString();
  const { data: jobs } = await admin.from('sheet_jobs').select('scheduled_for, created_at')
    .eq('kind', 'photo-sheet').eq('airtable_student_id', identity)
    .not('status', 'in', '("cancelled","failed")')
    .or(`created_at.gte.${sgtMidnight},scheduled_for.gte.${today}`);
  const used = usedByDay(((jobs ?? []) as { scheduled_for: string | null; created_at: string }[])
    .map(j => ({ createdDay: sgtDateISO(new Date(j.created_at)), queuedFor: j.scheduled_for })));
  const place = placeInQueue({ allowance: PHOTO_SHEET_ALLOWANCE, today, usedByDay: used, noun: 'sheet' });
  if (!place.ok) return NextResponse.json({ error: place.message }, { status: 429 });

  // Read every photo (in parallel — the bot's classify is ~10 s each).
  const { data: last } = await admin.from('generation_requests').select('source_question_id')
    .eq('portal_account_id', account.id).order('created_at', { ascending: false }).limit(1)
    .maybeSingle<{ source_question_id: string | null }>();
  const reads = await Promise.all(ask.photos.map(p =>
    classifyPhoto(admin, account, { botBase, botSecret }, { imageBase64: p, level, avoidId: last?.source_question_id ?? null }, { unreadable: PHOTO_UNREADABLE_MESSAGE })));
  for (let i = 0; i < reads.length; i++) {
    const r = reads[i];
    if (!r.ok) return NextResponse.json({ error: `Photo ${i + 1}: ${r.error}` }, { status: r.status });
  }

  // File the photos under the student's own folder, then the job and its row.
  const photos: SheetJobPhoto[] = [];
  for (let i = 0; i < ask.photos.length; i++) {
    const r = reads[i];
    if (!r.ok) continue;
    const bytes = dataUrlBytes(ask.photos[i]);
    if (!bytes) return NextResponse.json({ error: `Photo ${i + 1} could not be read — try again.` }, { status: 400 });
    let url: string, key: string;
    try {
      const put = await putStudentFile({ key: handinKey(identity, bytes.ext), body: bytes.bytes, contentType: bytes.contentType });
      url = put.url; key = put.key;
    } catch (e) {
      console.error('[practice-sheet] photo upload failed:', (e as Error).message);
      return NextResponse.json({ error: 'Could not save the photos — try again.' }, { status: 502 });
    }
    photos.push({
      url, key,
      text: r.classification.extractedText.slice(0, 2000),
      subgroup: r.classification.subgroup,
      marks: r.classification.marks,
      seed: r.seed ? { id: r.seed.id, tier: String(r.seed.tier), marks: r.seed.marks } : null,
      figureExpected: Boolean(r.classification.figureExpected),
    });
  }

  const title = sheetTitle(place.day);
  const { data: job, error: jobErr } = await admin.from('sheet_jobs').insert({
    kind: 'photo-sheet', run_id: null,
    airtable_student_id: identity,
    student_name: account.display_name || '',
    paper_name: title,
    focus: null, status: 'queued',
    scheduled_for: place.waits ? place.day : null,
    photos, worked_example: ask.workedExample,
    requested_by: 'student',
  }).select('id').single<{ id: string }>();
  if (jobErr || !job) {
    console.error('[practice-sheet] job insert failed:', jobErr?.message);
    return NextResponse.json({ error: 'Could not queue the sheet — try again.' }, { status: 500 });
  }
  const { data: asg, error: asgErr } = await admin.from('portal_assignments').insert({
    airtable_student_id: identity, kind: 'worksheet', question_id: null,
    title, topic: photoTopics(photos), level: level.slice(0, 20), tier: null, note: null,
    status: 'writing', source: 'practice-photo', sheet_job_id: job.id,
  }).select('id').single<{ id: string }>();
  if (asgErr || !asg) {
    console.error('[practice-sheet] assignment insert failed:', asgErr?.message);
    await admin.from('sheet_jobs').update({ status: 'cancelled', stage: 'no assignment row' }).eq('id', job.id);
    return NextResponse.json({ error: 'Could not queue the sheet — try again.' }, { status: 500 });
  }

  // The finder ledger, one line per photo (the nightly find-review reads it).
  for (const p of photos) {
    await logFindRow(admin, {
      identity, kind: 'photo', qbHit: Boolean(p.seed), generated: false,
      questionId: p.seed?.id ?? null, seedText: p.text, level, tier: 'practice-photo', assignmentId: asg.id,
      candidates: { practiceSheet: true, jobId: job.id, subgroup: p.subgroup, marks: p.marks, figureExpected: p.figureExpected, seed: p.seed },
    });
  }

  const who = account.display_name || identity;
  const when = place.waits ? `queued for ${dayWord(place.day, today)}` : 'writing now';
  sendTelegram(
    `📷 <b>${who}</b> sent ${photos.length} photo${photos.length === 1 ? '' : 's'} for a practice sheet — ${when}` +
    `${ask.workedExample ? ' · with a worked example' : ''}${photos.some(p => !p.subgroup) ? ' · ⚠️ a photo could not be filed under a sub-skill' : ''}`,
    'marking',
  ).catch(() => {});

  return NextResponse.json({
    ok: true, assignmentId: asg.id, day: place.day, waits: place.waits,
    message: sheetSentMessage({ waits: place.waits, dayWord: dayWord(place.day, today), photos: photos.length, workedExample: ask.workedExample }),
  });
}
