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
import { keyFromUrl } from '@/lib/student-files-url';
import { DAILY_SUBMIT_CAP, DAILY_SCIENCE_SUBMIT_CAP, countHandinsToday } from '@/lib/portal-submit-limit';
import type { HandinCountingClient, HandinFamily } from '@/lib/portal-submit-limit';
import { sendTelegram } from '@/lib/telegram';
import { escapeTelegramHtml } from '@/lib/telegram-html';
// Every notification from this file belongs in the marking topic (6 Sept 2026; falls back to the DM when unbound).
const notify_marking = (text: string) => sendTelegram(text, 'marking');
import { canTransition, type AssignmentRow } from '@/lib/assignments';
import { practiceAgainHandinName } from '@/lib/paper-display-name';
import { portalIdentity } from '@/lib/portal-auth';
import { markSubjectAccess, scienceMarkingOpen } from '@/lib/portal-beta';
import { enrolledMarkSubjects } from '@/lib/student-mark-subjects';
import { resolveHandinSubject, resolveScienceSubject } from '@/lib/mark-subject-for-student';
import { paperSubjectForMarkSubject, paperSubjectFromName } from '@/lib/portal-subjects';
import {
  dailyHandinCapForTier,
  handinAllowance,
  handinsRemaining,
  isTuitionAccount,
  requireActiveAccess,
} from '@/lib/portal-passes';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PAGES = 20;

/** How long a repeat of the same photos counts as a retry rather than a new
 *  hand-in. Long enough to cover a phone that reconnects minutes later, far
 *  shorter than the daily slot it protects. */
const RESUBMIT_WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: account } = await supabase
    .from('portal_accounts')
    .select('id, airtable_student_id, display_name')
    .eq('id', user.id)
    .single();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Strangers (empty airtable_student_id) hand in as `acct:<uuid>` — the ONE
  // identity convention (lib/portal-auth.portalIdentity). The bot's set-student
  // phase stores it verbatim (student_id/student_name are plain text columns;
  // the 🌙 queue, its Telegram and auto-release all key on the run row, never
  // on Airtable), so the whole marking loop works unchanged.
  const studentId = portalIdentity(account);
  const tuition = isTuitionAccount(account);

  // Pass gate + the hand-in meter (strangers only; tuition costs no DB hit).
  // The paywall page is the normal path — this is the API belt, and it also
  // hands back the CURRENT pass row so the meter below reads no second time.
  const access = await requireActiveAccess(account);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const meteredPass = access.pass; // null for tuition accounts

  let body: { photoUrls?: unknown; paperName?: unknown; assignmentId?: unknown; paperId?: unknown; confirmed?: boolean; subject?: unknown; family?: unknown; schemeUrls?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const admin = getSupabaseAdmin();

  // "From Adrian" worksheet (SPEC-ASSIGN.md): the id is client-supplied, so
  // ownership/kind/status are re-checked here. Tagged runs auto-release on
  // marking and flip the assignment to marked; exempt from the daily cap (D3)
  // because Adrian initiated it — one hand-in per assignment is the brake.
  let assignment: AssignmentRow | null = null;
  if (typeof body.assignmentId === 'string' && body.assignmentId) {
    const { data: a } = await admin
      .from('portal_assignments').select('*')
      .eq('id', body.assignmentId).eq('airtable_student_id', studentId)
      .maybeSingle();
    const row = a as AssignmentRow | null;
    if (!row || row.kind !== 'worksheet' || row.status === 'revoked' || row.status === 'held') {
      return NextResponse.json({ error: 'That worksheet isn’t available any more.' }, { status: 404 });
    }
    if (!canTransition(row.status, 'submitted')) {
      return NextResponse.json({ error: 'You have already sent this worksheet in — it’s with Adrian.' }, { status: 409 });
    }
    assignment = row;
  }

  // A self-generated printed paper (SPEC-PRINT-PAPER.md): re-check ownership
  // and status here (the id is client-supplied). Its stored question ids get
  // stamped onto the run below — the pre-registration the marker reads.
  // Cap-exempt since 7 Sep 2026 (Adrian: "printed papers don't count" — only an
  // exam paper spends the day; spec D5 flipped).
  let printedPaper: { id: string; question_ids: unknown } | null = null;
  if (!assignment && typeof body.paperId === 'string' && body.paperId) {
    const { data: p } = await admin
      .from('portal_generated_papers')
      .select('id, question_ids, status')
      .eq('id', body.paperId)
      .eq('airtable_student_id', studentId)
      .maybeSingle();
    if (!p) return NextResponse.json({ error: 'That printed paper isn’t available any more.' }, { status: 404 });
    if (p.status !== 'open') {
      return NextResponse.json({ error: 'You have already handed this paper in — it’s with Adrian.' }, { status: 409 });
    }
    printedPaper = { id: p.id, question_ids: p.question_ids };
  }

  // 🧪 Science (SPEC-SCIENCE-MARKING.md §Decision 10 Sep 2026): the Science tab's
  // form sends family:'science' and a subject. Free for every signed-in student
  // while the door is open (no enrolment check), refused outright when it is
  // not — a physics paper is never silently marked as maths. It is always its
  // own hand-in: never a worksheet, never a printed paper.
  const science = body.family === 'science';
  let scienceSubject: 'physics' | 'chemistry' | 'biology' | null = null;
  if (science) {
    if (assignment || printedPaper) return NextResponse.json({ error: 'A science paper is handed in on its own — not as a worksheet or a printed paper.' }, { status: 400 });
    scienceSubject = resolveScienceSubject(body.subject, await scienceMarkingOpen());
    if (!scienceSubject) return NextResponse.json({ error: 'Pick the subject — physics, chemistry or biology — before sending.' }, { status: 400 });
  }
  const family: HandinFamily = science ? 'science' : 'math';

  const photoUrls = Array.isArray(body.photoUrls)
    ? [...new Set(body.photoUrls.filter((u): u is string => typeof u === 'string'))]
    : [];
  if (!photoUrls.length) return NextResponse.json({ error: 'No photos to submit' }, { status: 400 });
  if (photoUrls.length > MAX_PAGES) {
    return NextResponse.json({ error: `That's too many pages for one paper (max ${MAX_PAGES}) — submit the rest as a second paper.` }, { status: 400 });
  }
  // A URL is this student's own upload when its key sits under their prefix.
  const ownsUrl = (u: string): boolean => {
    const key = keyFromUrl(u);
    if (key) {
      // Private-store upload (5 Sep 2026): the submit-token route pinned the key
      // under handins/<identity>/, so the prefix IS the ownership proof.
      return key.startsWith(`handins/${studentId}/`);
    }
    if (isOurBlobUrl(u)) {
      // decodeURIComponent: a stranger's identity segment (`acct:<uuid>`)
      // contains a colon, which a URL serializer MAY percent-encode — decode
      // before comparing so both spellings match the prefix the submit-token
      // route pinned. Airtable rec ids are alphanumeric, so this is a no-op
      // for tuition students.
      try { return decodeURIComponent(new URL(u).pathname).startsWith(`/mark-paper/portal/${studentId}/`); } catch { return false; }
    }
    return false;
  };
  for (const u of photoUrls) {
    if (!ownsUrl(u)) return NextResponse.json({ error: 'A photo upload went wrong — please re-add your photos and try again.' }, { status: 400 });
  }
  // The school's mark scheme, if the student has it (science only; a PDF or
  // photos, uploaded under the same prefix via submit-token?kind=scheme). It
  // rides save-paper as source.scheme_source — the shape the admin attach uses —
  // so the bot extracts it, grounds on it and STORES it for every later hand-in
  // of the same paper.
  const schemeUrls = science && Array.isArray(body.schemeUrls)
    ? [...new Set(body.schemeUrls.filter((u): u is string => typeof u === 'string'))].slice(0, 12)
    : [];
  for (const u of schemeUrls) {
    if (!ownsUrl(u)) return NextResponse.json({ error: 'The mark scheme upload went wrong — please re-add it and try again.' }, { status: 400 });
  }
  const schemePdf = schemeUrls.find(u => /\.pdf($|\?)/i.test(u)) ?? null;
  const schemePages = schemeUrls.filter(u => u !== schemePdf).map(u => ({ url: u }));
  const schemeSource = (schemePdf || schemePages.length) ? { scheme_source: { pdf_url: schemePdf, pages: schemePages } } : {};

  // Required since 2026-08-21 (Adrian: "let's just have the student fill it up
  // properly") — the client disables Send until it's typed; this is the backstop.
  let paperName = (typeof body.paperName === 'string' ? body.paperName.trim().slice(0, 80) : '')
    || (assignment ? assignment.title.slice(0, 80) : '');
  // A Practice Again hand-in is named after its SOURCE paper, one shape for every
  // student (Adrian, 8 Sep 2026: "why are Practice Again named differently?" —
  // the sheet title's wording changed across a week of releases and each hand-in
  // copied whichever it got). lib/paper-display-name practiceAgainHandinName.
  if (assignment || /^practice\s+again\b/i.test(paperName)) {
    let sourceName: string | null = null;
    if (assignment?.source_run_id) {
      const { data: src } = await admin.from('paper_marking_runs').select('paper_name').eq('id', assignment.source_run_id).maybeSingle<{ paper_name: string | null }>();
      sourceName = src?.paper_name ?? null;
    }
    paperName = practiceAgainHandinName(paperName || 'Practice Again', sourceName, account.display_name ?? null).slice(0, 80);
  }
  if (!paperName) {
    return NextResponse.json({ error: 'Tell us which paper this is (e.g. "Xinmin 2021 Prelim P2") before sending.' }, { status: 400 });
  }

  // Phase G hardening (Adrian, 21 Aug 2026): one hand-in per student per SGT
  // calendar day — replaces the earlier 3-per-10-min soft brake. Counts runs
  // actually saved, so a failed submission does not burn the day's slot.
  // Since 24 Aug 2026 the count spans BOTH surfaces (this and the bot's
  // /handin) — see countHandinsToday. The bot enforces the same ceiling from
  // its side, so whichever a student reaches first spends the day's slot.
  // The cast is TS ergonomics, not a loosening: the generated Supabase client
  // types are deep enough that inferring them through the helper trips TS2589
  // ("type instantiation is excessively deep"). HandinCountingClient names the
  // four methods actually used.
  // Strangers additionally spend their pass's hand-in meter (8 on Standard,
  // 20 on Intensive) — checked BEFORE the daily cap so "pass used up" never
  // masquerades as "come back tomorrow". Assignments stay exempt from both
  // (Adrian initiated them; one hand-in per assignment is the brake).
  if (meteredPass && !assignment && !science && handinsRemaining(meteredPass) <= 0) {
    return NextResponse.json({
      error: `You’ve used all ${handinAllowance(meteredPass)} marked papers in this pass — upgrade to Intensive or wait for your next pass at /app/pass. Everything else stays open.`,
    }, { status: 402 });
  }

  // Daily ceiling: tuition students keep the global cap (1/SGT day, shared
  // with the bot's /handin); a stranger's ceiling comes from their pass tier
  // (Standard 1/day, Intensive 3/day — trials meter as Standard).
  // Only an EXAM paper spends the day (7 Sep 2026): a sheet or a printed paper
  // neither checks the cap here nor counts in it (countHandinsToday).
  // 🧪 Science has its own slot (one a day, everyone), counted apart from the
  // maths slot — see countHandinsToday's family argument.
  const dailyCap = science ? DAILY_SCIENCE_SUBMIT_CAP : tuition ? DAILY_SUBMIT_CAP : dailyHandinCapForTier(meteredPass?.tier);
  const count = (assignment || printedPaper) ? 0 : await countHandinsToday(admin as unknown as HandinCountingClient, studentId, new Date(), family);
  if ((count ?? 0) >= dailyCap) {
    return NextResponse.json({
      error: science
        ? 'Today’s science hand-in is used — one science paper a day; a fresh one opens at midnight. Your maths hand-in is separate.'
        : dailyCap === 1
        ? 'Today’s exam-paper hand-in is used — a fresh one opens at midnight. Practice Again sheets and printed papers don’t count, so those can still go in.'
        : `You’ve handed in ${dailyCap} exam papers today — a fresh allowance opens at midnight. Practice Again sheets and printed papers don’t count.`,
    }, { status: 429 });
  }

  // ── the same submission, sent twice ────────────────────────────────────────
  // Sophie, 1 Sep 2026: eighteen pages uploaded, then the one small POST that
  // registers them died on a network handover and she saw Safari's bare "Load
  // failed". Her photos were already in Blob storage; nothing reached Adrian.
  //
  // The client can now retry that POST, which needs this route to be safe to
  // call twice — otherwise a reply lost on the way BACK would make a second
  // paper, spend her one hand-in for the day, and put a duplicate in triage.
  //
  // No new column is needed to make it safe: every upload pathname is a fresh
  // crypto.randomUUID() (api/portal/submit-token), so a photo URL is unique to
  // one submission for all time. Finding a recent run of this student's that
  // already carries this exact first photo means this is that same submission
  // arriving again — so hand back the run it already made.
  const firstPhoto = photoUrls[0];
  const { data: already } = await admin
    .from('paper_marking_runs')
    .select('id, created_at')
    .eq('student_id', studentId)
    .gte('created_at', new Date(Date.now() - RESUBMIT_WINDOW_MS).toISOString())
    .contains('source', { photos: [{ original_url: firstPhoto }] })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (already?.id) {
    console.log('[portal-submit] same photos already saved as', already.id, '— returning it rather than duplicating');
    return NextResponse.json({ runId: already.id, resumed: true });
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

  // ── look at the hand-in before filing it ───────────────────────────────────
  // Adrian, 1 Sep 2026. The one problem nobody can fix after marking is a page
  // that was never photographed: Q7 with no page produces no row, scores zero,
  // and looks identical to Q7 genuinely left blank. Only the student can tell
  // those apart, and only while the paper is still in front of them.
  //
  // ADVISORY, NEVER A GATE. `confirmed` is what the student sends back after
  // reading the warning, and it always goes through. A checker that can refuse a
  // hand-in is worse than the gap it catches — the paper gets marked with a
  // missing page either way, but a refused hand-in never arrives at all.
  if (!body.confirmed) {
    const pre = await bot({ phase: 'preflight', source: { photos: photoUrls.map(u => ({ original_url: u })) } });
    const findings = Array.isArray(pre?.findings) ? pre.findings : [];
    if (findings.some((f: { blocking?: boolean }) => f?.blocking)) {
      return NextResponse.json({ needsConfirm: true, findings }, { status: 409 });
    }
  }

  // THE GATE (lib/mark-subject-for-student). The client picker is only UX; the
  // subject a hand-in is actually marked as is decided here, server-side, and a
  // student can never reach a subject they are not entitled to: 'closed' (the
  // default until the flag flips) forces math whatever the browser sent, 'open'
  // honours only a subject the student is enrolled in, and Adrian's admin cookie
  // ('preview') may mark anything. Assignments and printed papers are math.
  let subject: string = 'math';
  if (scienceSubject) {
    subject = scienceSubject;
  } else if (!assignment && !(typeof body.paperId === 'string' && body.paperId)) {
    subject = resolveHandinSubject({
      requested: body.subject,
      enrolled: await enrolledMarkSubjects(studentId),
      access: await markSubjectAccess(),
    });
  }

  const saved = await bot({
    phase: 'save-paper',
    paperName,
    subject,
    source: { photos: photoUrls.map(u => ({ original_url: u })), ...schemeSource },
  });
  const runId = saved?.run_id;
  if (!runId) {
    console.error('[portal-submit] save-paper failed:', saved?.error);
    return NextResponse.json({ error: 'The submission could not be saved — try again in a minute.' }, { status: 502 });
  }

  // Tag the run to its student (same phase the admin send row uses).
  await bot({ phase: 'set-student', id: runId, studentId, studentName: account.display_name || '' });

  // Stamp HOW it arrived, so student-facing surfaces can show "with Adrian" for
  // portal hand-ins without ever picking up papers Adrian uploaded himself.
  // Read-merge-write on a row created milliseconds ago — nothing else has it yet.
  //
  // And WHICH maths it is (SPEC-PORTAL-V2 §1, paper_subject): the Papers page
  // pills and per-subject tiles key on it, and the health check wants every
  // released run to carry one. The hand-in form's own subject choice is the
  // marking lane (math / physics / …, lib/mark-subjects) — a science paper is
  // 'Other' outright; a maths paper reads the assignment's level first (the
  // Send-work card set it), then the paper name (kiara am tys 2022 p1 → A Math),
  // else null for Adrian to tag on the desk. Never overwrites a value the bot
  // already stamped at save-paper.
  // A science hand-in is stamped with its science (Physics / Chemistry /
  // Biology, 10 Sep 2026) — the Science tab lists by it and the maths gate
  // never admits it.
  const paperSubject = subject !== 'math'
    ? (paperSubjectForMarkSubject(subject) ?? 'Other')
    : paperSubjectFromName(assignment?.level) ?? paperSubjectFromName(paperName);
  try {
    const { data: row } = await admin.from('paper_marking_runs').select('result_json, paper_subject').eq('id', runId).single();
    const rj = (row?.result_json && typeof row.result_json === 'object') ? row.result_json as Record<string, unknown> : {};
    await admin.from('paper_marking_runs').update({
      paper_subject: (row?.paper_subject as string | null | undefined) ?? paperSubject,
      result_json: {
        ...rj,
        portal_submission: true,
        ...(assignment ? { assignment_id: assignment.id } : {}),
        // Pre-registration (SPEC-PRINT-PAPER.md): the exact QB questions on
        // the printed sheet, in order — the marker can ground on their stored
        // solutions instead of working out what each question even is.
        ...(printedPaper ? { generated_paper_id: printedPaper.id, generated_question_ids: printedPaper.question_ids } : {}),
      },
    }).eq('id', runId);
  } catch (e) {
    console.warn('[portal-submit] portal_submission / paper_subject stamp failed:', (e as Error).message);
  }

  // Spend one hand-in on the stranger's pass meter — AFTER the run is saved,
  // so a failed submission never burns allowance. Read-modify-write on the row
  // requireActiveAccess just fetched: two truly simultaneous submits could
  // write the same value and under-count by one (accepted — it only ever gives
  // a hand-in away, and the daily cap bounds the drift); a failure here is
  // logged, never fatal — the paper is already with Adrian.
  if (meteredPass && !assignment && !science) {
    const { error: meterErr } = await admin
      .from('portal_passes')
      .update({ handins_used: (meteredPass.handins_used ?? 0) + 1 })
      .eq('id', meteredPass.id);
    if (meterErr) console.error('[portal-submit] hand-in meter update failed:', meterErr.message);
  }

  if (assignment) {
    const { error: flipErr } = await admin.from('portal_assignments')
      .update({ status: 'submitted', run_id: runId, submitted_at: new Date().toISOString() })
      .eq('id', assignment.id).eq('status', 'assigned');
    if (flipErr) console.error('[portal-submit] assignment flip failed:', flipErr.message);
  }
  if (printedPaper) {
    const { error: flipErr } = await admin.from('portal_generated_papers')
      .update({ status: 'submitted', run_id: runId })
      .eq('id', printedPaper.id).eq('status', 'open');
    if (flipErr) console.error('[portal-submit] printed-paper flip failed:', flipErr.message);
  }

  // Auto-queue the hand-in for marking (after the stamp above, so the queue
  // worker can never claim the run while the stamp's read-merge-write is in
  // flight). phase:'enqueue' defaults to opus/teacher — the same marking Adrian's
  // own 🌙 button queues. On success ONE line — 📥 handed in, queued (Adrian,
  // 10 Sep 2026: "do it") — so he knows a paper is in the queue before the
  // marking lands; the queue worker's finished-marking Telegram (student name +
  // 🖼 PDF) stays the doorbell, and nothing here asks him to tap anything.
  const who = account.display_name || 'A student';
  let queued = false;
  try {
    const q = await bot({ phase: 'enqueue', id: runId });
    queued = !!q?.ok;
    if (!queued) console.warn('[portal-submit] enqueue failed:', q?.error);
  } catch (e) {
    console.warn('[portal-submit] enqueue failed:', (e as Error).message);
  }
  if (queued) {
    const lane = scienceSubject ? `🧪 ${scienceSubject} · ` : '';
    const scheme = schemeUrls.length ? ' · mark scheme attached' : '';
    notify_marking(
      `📥 <b>${escapeTelegramHtml(who)}</b> handed in “${escapeTelegramHtml(paperName)}” — ` +
      `${lane}${photoUrls.length} page${photoUrls.length === 1 ? '' : 's'}${scheme}, queued for marking.`
    ).catch(() => {});
  }
  if (!queued) {
    // The run is saved either way — but with no queue entry nobody would ever
    // hear about it, so fall back to the old "come tap ▶ Mark" doorbell.
    notify_marking(
      `📬 <b>${who}</b> submitted a paper for marking — ${photoUrls.length} page${photoUrls.length === 1 ? '' : 's'}` +
      ` — “${paperName}”.\nAuto-queue failed, so it's waiting as ⏳ in /admin/mark-paper history — tap ▶ Mark yourself.`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, runId });
}
