// /api/admin/papers — the marked-script library behind /admin/papers.
//
// GET    → every marking run, newest first, reduced to what's useful when you're
//          sitting next to the student: score, the topics that bled marks, and
//          links to the copies you can put on the screen. ?subject= narrows to
//          one marking lane (math | physics | chemistry | biology).
// POST   → { runId, studentId } tags a run with a student (or untags with null);
//          { runId, checked } toggles one ✓; { runIds, checked } sweeps many.
// DELETE → ?id= removes the run AND its stored files (originals, annotated
//          pages, assembled PDFs) from Blob.
//
// Reads Supabase DIRECTLY rather than through /api/admin/mark-paper's proxy to
// the bot. The proxy only exposes `by-student`, which is useless for the exact
// problem this page exists to fix: of 43 runs, 2 carried a student_id, so a
// per-student view showed almost nothing. Tagging is also what unblocks
// marked-paper evidence in the parent reports (`report-facts.ts`) — an untagged
// run belongs to nobody and can never appear in one.
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isOurBlobUrl } from '@/lib/blob-url';
import { getSupabaseAdmin } from '@/lib/supabase';
import { airtableRequest } from '@/lib/airtable';
import { recomputeTotals, pendingCount } from '@/lib/mark-triage';
import { cancelMarkingState, stripQueue } from '@/lib/mark-queue-cancel';
import { aggregateTopicBleed } from '@/lib/report-facts';
import { lostMarkQuestions } from '@/lib/shelf';
import { isMarkSubject } from '@/lib/mark-subjects';

export const runtime = 'nodejs';

const DEFAULT_DAYS = 365;
const MAX_DAYS = 3650;
const DEFAULT_LIMIT = 200;
/** Ceiling on the topic breakdown per run — the page shows the weakest few and
 *  expands to the rest; beyond this it stops being a conversation starter. */
const MAX_TOPICS_PER_RUN = 8;

const COLUMNS =
  'id, created_at, paper_name, student_id, student_name, num_questions, subject, ' +
  'total_awarded, total_max, rules_version, pdf_url, photos_pdf_url, annotated_pdf_url, released_at, checked_at, source, superseded_by';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const days = Math.min(Number(q.get('days')) || DEFAULT_DAYS, MAX_DAYS);
  const limit = Math.min(Number(q.get('limit')) || DEFAULT_LIMIT, 500);
  const studentId = q.get('student') || '';
  const untaggedOnly = q.get('untagged') === '1';
  // ?subject=physics — the science lanes (SPEC-SCIENCE-MARKING.md). Unknown
  // values 400 rather than silently returning everything.
  const subject = q.get('subject') || '';
  if (subject && !isMarkSubject(subject)) {
    return NextResponse.json({ error: `unknown subject "${subject}"` }, { status: 400 });
  }

  const supa = getSupabaseAdmin();
  let query = supa
    .from('paper_marking_runs')
    .select(`${COLUMNS}, result_json`)
    .gte('created_at', new Date(Date.now() - days * 86400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (studentId) query = query.eq('student_id', studentId);
  if (untaggedOnly) query = query.is('student_id', null);
  if (subject) query = query.eq('subject', subject);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const runs = (data ?? [])
    // A run with no stored marking is a failed or still-queued attempt. It has
    // nothing to go through with a student, and listing it as "0/0" reads as a
    // paper the student scored nothing on.
    .filter(r => Array.isArray((r.result_json as { results?: unknown })?.results))
    .map(r => {
      // Prefer the stored totals; recompute when they're missing, since triage
      // overrides write both and older rows sometimes carry neither.
      const totals =
        r.total_max == null || r.total_awarded == null
          ? recomputeTotals(r.result_json)
          : { awarded: r.total_awarded, max: r.total_max };
      const date = String(r.created_at).slice(0, 10);
      const topics = aggregateTopicBleed([
        { id: r.id, date, name: r.paper_name || 'Paper', totalAwarded: totals.awarded, totalMax: totals.max, resultJson: r.result_json },
      ]).slice(0, MAX_TOPICS_PER_RUN);

      return {
        id: r.id,
        date,
        createdAt: r.created_at,
        paperName: r.paper_name || 'Untitled paper',
        // 'math' for every run before the column existed; the row only grows a
        // chip when it is something else.
        subject: (r.subject as string | null) || 'math',
        // What the marking was grounded on (bot result_json.grounding.source) — the 📘 chip.
        grounding: ((r.result_json as { grounding?: { source?: string | null } } | null)?.grounding?.source) ?? null,
        rulesVersion: (r.rules_version as string | null) ?? null,
        studentId: r.student_id,
        studentName: r.student_name,
        awarded: totals.awarded,
        max: totals.max,
        pct: totals.max > 0 ? Math.round((totals.awarded / totals.max) * 100) : null,
        questions: r.num_questions ?? (r.result_json as { results?: unknown[] })?.results?.length ?? 0,
        // Still-open triage flags, so a script that hasn't been checked isn't
        // walked through as if its marks were final.
        pending: pendingCount(r.result_json),
        released: !!r.released_at,
        // A later re-mark of the same paper replaced this one on the student's
        // side. The row stays in the library — this is where the history lives.
        superseded: !!r.superseded_by,
        // Adrian has been through this one — annotated it, sent it, or ticked it off.
        checked: !!r.checked_at,
        annotatedPdfUrl: r.annotated_pdf_url,
        photosPdfUrl: r.photos_pdf_url,
        pdfUrl: r.pdf_url,
        topics,
        // Every question that lost marks — the 🧺 Shelve list. Paper order, so
        // it reads like the script; capped the same spirit as the topic chips.
        lostQuestions: lostMarkQuestions(r.result_json).slice(0, 20),
      };
    });

  return NextResponse.json({
    days,
    runs,
    stats: {
      total: runs.length,
      untagged: runs.filter(r => !r.studentId).length,
      unchecked: runs.filter(r => !r.checked).length,
      students: new Set(runs.map(r => r.studentId).filter(Boolean)).size,
    },
  });
}

// ── POST: tag a run with a student, or toggle its ✓ checked state ────────────

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { runId?: string; runIds?: unknown; studentId?: string | null; checked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // Bulk ✓ — the "mark all as checked" sweep from the library header. Same
  // stamp as the single toggle below, applied to every id in one update.
  if (Array.isArray(body.runIds) && typeof body.checked === 'boolean') {
    const ids = body.runIds.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 500);
    if (!ids.length) return NextResponse.json({ error: 'runIds is empty' }, { status: 400 });
    const { error } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .update({ checked_at: body.checked ? new Date().toISOString() : null })
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: ids.length, checked: body.checked });
  }

  const { runId, studentId } = body;
  if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

  // Manual ✓ from the library — the "looked through it, nothing to change" case that
  // no annotated copy or send would ever record (Adrian, 19 Aug 2026). A body with
  // `checked` is ONLY that toggle; tagging keeps its own shape below.
  if (typeof body.checked === 'boolean') {
    const { error } = await getSupabaseAdmin()
      .from('paper_marking_runs')
      .update({ checked_at: body.checked ? new Date().toISOString() : null })
      .eq('id', runId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, runId, checked: body.checked });
  }

  // Resolve the NAME from Airtable rather than trusting one sent by the client:
  // student_name is denormalised into this row and shows up in triage, so a
  // stale or mistyped name would outlive whatever screen produced it.
  let studentName: string | null = null;
  if (studentId) {
    try {
      // Single-record GET ignores fields[] — fetch all and pick in JS.
      const student = await airtableRequest('Students', `/${studentId}`);
      studentName = (student?.fields?.['Student Name'] as string) || null;
      if (!studentName) return NextResponse.json({ error: 'student has no name' }, { status: 400 });
    } catch {
      return NextResponse.json({ error: 'student not found' }, { status: 404 });
    }
  }

  const { error } = await getSupabaseAdmin()
    .from('paper_marking_runs')
    .update({ student_id: studentId || null, student_name: studentName })
    .eq('id', runId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, runId, studentId: studentId || null, studentName });
}

// ── DELETE: remove a run and everything it stored ────────────────────────────
// Adrian's ask (13 Aug 2026): junk rows pile up in mark-paper's history —
// abandoned ⏳ uploads, duplicate attempts — with no way to clear them. Released
// runs are deletable too (the confirm on the client is the guard); deleting one
// simply removes it from the student's portal along with everything else.

export async function DELETE(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  const { data: row, error: fetchErr } = await supa
    .from('paper_marking_runs').select('*').eq('id', id).maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'run not found' }, { status: 404 });

  // Harvest every Blob URL the row references by scanning its serialised form:
  // the files live in different corners (source photo originals and the question
  // paper inside result_json, annotated pages + their solutions twins, the three
  // assembled-PDF columns), and shapes have drifted across marker versions. A
  // sweep of the whole row catches them all; isOurBlobUrl keeps it to our store.
  const urls = [...new Set(JSON.stringify(row).match(/https:\/\/[^"\\\s]+/g) || [])].filter(isOurBlobUrl);

  // Into the bin first, THEN out of the table — and the files stay put for 30
  // days (Adrian, 31 Aug 2026). This used to delete the row and every Blob in
  // one irreversible go, from an icon next to Dropbox and ✓ on a phone-sized
  // row; a mis-tap destroyed a marked script, its source photos and, if it had
  // been released, the student's copy. It also destroyed labelled data: since
  // the corrections became the calibration signal, a deleted paper is evidence
  // deleted.
  //
  // ?purge=1 keeps the old behaviour for when he means it.
  const purgeNow = req.nextUrl.searchParams.get('purge') === '1';
  if (!purgeNow) {
    const { error: binErr } = await supa.from('paper_marking_runs_bin').upsert({
      id,
      row,
      blob_urls: urls,
      paper_name: row.paper_name ?? null,
      student_name: row.student_name ?? null,
      deleted_at: new Date().toISOString(),
      purge_after: new Date(Date.now() + 30 * 86400_000).toISOString(),
    });
    // No bin, no delete. Losing the paper because the safety net failed is the
    // exact outcome the net exists to prevent.
    if (binErr) return NextResponse.json({ error: `could not bin it: ${binErr.message}` }, { status: 500 });
  }

  const { error: delErr } = await supa.from('paper_marking_runs').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  let blobsDeleted = 0;
  if (purgeNow && urls.length) {
    try { await del(urls); blobsDeleted = urls.length; }
    catch (e) { console.error('[papers] blob cleanup failed for', id, (e as Error).message); }
  }

  // Opportunistic purge of anything past its 30 days — no cron to forget, and
  // it only runs on a delete, which is exactly when a bin is on someone's mind.
  let purged = 0;
  try {
    const { data: expired } = await supa
      .from('paper_marking_runs_bin').select('id, blob_urls').lt('purge_after', new Date().toISOString()).limit(20);
    for (const e of expired ?? []) {
      const old = (e.blob_urls as string[] | null) ?? [];
      if (old.length) { try { await del(old); } catch { /* orphaned files are cheap */ } }
      await supa.from('paper_marking_runs_bin').delete().eq('id', e.id);
      purged++;
    }
  } catch (e) { console.warn('[papers] bin purge skipped:', (e as Error).message); }

  return NextResponse.json({ ok: true, id, blobsDeleted, binned: !purgeNow, purged });
}

/** Put a binned paper back, files and all — or take a paper off the marking queue. */
export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as { action?: string; id?: string }));
  if (body.action !== 'restore' && body.action !== 'cancel-marking') {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }
  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const supa = getSupabaseAdmin();

  // ── Take a paper off the marking queue ─────────────────────────────────────
  // The queue is the `queue` key inside result_json, and EVERY drain the bot has
  // filters on it being present — the Fly worker, the Mac's claim, and the
  // heartbeat/submit guards, which read a missing queue as "claim lost" and
  // refuse to write. So removing that one key cancels the paper everywhere at
  // once, a running Mac session included: it stops at its next per-page
  // heartbeat, and anything it finished anyway is dropped as superseded rather
  // than delivered. Reasoning and the state machine: lib/mark-queue-cancel.ts.
  //
  // Deliberately NOT a new bot phase: deploying the bot kills whatever it is
  // marking at that moment, which is a steep price for a cancel button.
  if (body.action === 'cancel-marking') {
    const { data: run, error: readErr } = await supa
      .from('paper_marking_runs').select('id, paper_name, total_max, result_json').eq('id', id).maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });

    const state = cancelMarkingState(run);
    if (!state.can) return NextResponse.json({ error: state.reason, state: state.state }, { status: 409 });

    // Guarded on total_max still being null: a marking that LANDED between the
    // read and this write must not have its finished queue record stripped.
    const { data: done, error: upErr } = await supa
      .from('paper_marking_runs')
      .update({ result_json: stripQueue(run.result_json, new Date().toISOString()) })
      .eq('id', id).is('total_max', null)
      .select('id').maybeSingle();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    if (!done) return NextResponse.json({ error: 'it finished marking while you tapped — nothing was cancelled' }, { status: 409 });

    return NextResponse.json({ ok: true, id, cancelled: true, wasRunning: state.running });
  }

  const { data: binned, error: readErr } = await supa
    .from('paper_marking_runs_bin').select('row').eq('id', id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!binned) return NextResponse.json({ error: 'not in the bin — it may have passed 30 days' }, { status: 404 });

  const { error: insErr } = await supa.from('paper_marking_runs').insert(binned.row as Record<string, unknown>);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  await supa.from('paper_marking_runs_bin').delete().eq('id', id);
  return NextResponse.json({ ok: true, id, restored: true });
}
