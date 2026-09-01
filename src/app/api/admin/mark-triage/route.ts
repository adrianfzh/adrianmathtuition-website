// Batch triage over recent marking runs — /admin/mark/triage.
//
// GET  → unreleased, unarchived runs from the last N days, each reduced to ONLY
//        the questions the marker asked a human to look at.
// POST → { action: 'agree' | 'override' | 'release' | 'archive' | 'archive-all' }.
//
// Archive = "seen": Adrian handled the paper outside the system (marked it
// physically, handed it back in class), so it leaves triage / the hub card /
// the daily reminder WITHOUT releasing — released_at stays null, the student's
// portal never shows it, nobody is notified. The /admin/papers library still
// lists it. (Adrian, 2026-08-29: "make everything else as read or seen".)
//
// Release is the one thing here with an outward effect: it stamps `released_at`
// and nudges the student. For papers Adrian marks himself nothing reaches a
// student without that explicit tap — his review is the trust gate on AI
// marking (HANDOFF-MARKING-LOOP.md, locked decision 2).
//
// `{ action: 'release', runId, auto: true }` is the bot's door (2026-08-21,
// Adrian: "auto-release after bot finishes marking"): a PORTAL HAND-IN that the
// 🌙 queue worker just finished is released the moment its PDFs are linked,
// without waiting for triage. It skips the flagged-question gate (flags stay
// in result_json for the record), refuses anything that is not a portal
// submission, and stamps `released_via: 'auto:<channel>'` so the history shows
// which releases were automatic. Same student nudge + post-release enrichment
// as a manual release.
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegramTo, sendTelegramDocumentTo } from '@/lib/telegram';
import { pickSuperseded } from '@/lib/marking-supersede';
import {
  extractFlagged,
  applyAgree,
  applyOverride,
  recomputeTotals,
  isReleasable,
  pendingCount,
  computeAutoHold,
  TriageIndexError, overrideTally, paperTotalWarning, paperTotalsMismatch } from '@/lib/mark-triage';
import { buildReviseBlock } from '@/lib/revise-map';
import { canTransition, validateAssignment, type AssignmentStatus } from '@/lib/assignments';
import { sendPushToStudent } from '@/lib/portal-push';

export const runtime = 'nodejs';
// Release itself is fast; the ceiling is for the after() enrichment, which
// makes two model calls per released paper with dropped marks (revise mapping
// here, practice generation on the bot).
export const maxDuration = 300;

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

// ⏸ Auto-release kill switch (Adrian, 2026-08-29). Alessi's hand-in auto-released
// with an indefensible score — 15/16 parts were marked with question_found:false
// (per-photo isolation marked the model's guess, not her work) and nothing gated
// it. While paused, `auto: true` releases refuse and the run stays in triage; the
// bot's Telegram line carries the note, and the daily 8am reminder keeps the run
// visible. Manual release from /admin/mark/triage is unaffected.
// The accuracy gates SHIPPED bot-side 2026-08-29 evening (bot lib/release-gates.js,
// wired before autoReleaseHandIn: unreadable pages, zero/blind-majority questions,
// reconcile findings — `computeAutoHold` in lib/mark-triage.ts is the same logic
// over the persisted run, driving the amber chip below). Flip to false on Adrian's
// go once he's satisfied with the gated behaviour.
const AUTO_RELEASE_PAUSED = true;
const RUN_COLUMNS =
  'id, created_at, paper_name, subject, student_id, student_name, total_awarded, total_max, num_questions, annotated_pdf_url, pdf_url, released_at';

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const days = Math.min(Number(req.nextUrl.searchParams.get('days')) || DEFAULT_DAYS, MAX_DAYS);
  const supa = getSupabaseAdmin();

  const { data, error } = await supa
    .from('paper_marking_runs')
    .select(`${RUN_COLUMNS}, result_json`)
    .is('released_at', null)
    .is('archived_at', null)
    .gte('created_at', daysAgoIso(days))
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // One query for every paper on screen: which of them already have a finished
  // sheet. Cheap, and it decides whether the row offers the one-tap release.
  const sheetReadyRuns = new Set<string>();
  try {
    const ids = (data ?? []).map(r => r.id as string);
    if (ids.length) {
      const { data: jobs } = await getSupabaseAdmin()
        .from('sheet_jobs').select('run_id').eq('status', 'done').in('run_id', ids);
      for (const j of jobs ?? []) sheetReadyRuns.add(j.run_id as string);
    }
  } catch { /* no badge is better than a broken list */ }

  const runs = (data ?? [])
    // A run still in the queue has no `results` yet — it isn't reviewable, and
    // showing it as "0 flagged, ready to release" would invite releasing nothing.
    .filter(r => Array.isArray((r.result_json as { results?: unknown })?.results))
    .map(r => {
      const summary = extractFlagged(r.result_json);
      return {
        id: r.id,
        createdAt: r.created_at,
        paperName: r.paper_name || 'Untitled paper',
        // The marking lane (math | physics | chemistry | biology); the row shows
        // a chip only when it is not math.
        subject: (r.subject as string | null) || 'math',
        studentId: r.student_id,
        studentName: r.student_name,
        awarded: summary.awarded,
        max: summary.max,
        totalQuestions: summary.totalQuestions,
        unflaggedCount: summary.unflaggedCount,
        annotatedPdfUrl: r.annotated_pdf_url,
        pdfUrl: r.pdf_url,
        annotatedPhotos: extractAnnotatedPhotos(r.result_json),
        flagged: summary.flagged,
        // Not shown by default; correctable, and the denominator for any rate.
        confident: summary.confident,
        releasable: summary.flagged.length === 0,
        // Marks changed after marking → the stored PDF still shows the old ones.
        pdfStale: !!(r.result_json as { pdf_stale?: unknown } | null)?.pdf_stale,
        // Do the marks add up to a real paper total? A misread [n] on one
        // question is invisible in every other view, and it silently skews the
        // percentage on the student's copy and in every report that uses it.
        // The run's OWN two numbers first — registry total vs what the questions
        // add up to — and only then the guess from the shape of the total.
        totalWarning: paperTotalsMismatch(r.result_json, r.total_awarded) ?? paperTotalWarning(r.total_max),
        // Is a finished self-study sheet waiting in Dropbox for this paper? When
        // there is one, releasing it alongside the marks is one tap and needs no
        // file picking — the worker already filed it (see /api/admin/release-with-sheet).
        sheetReady: sheetReadyRuns.has(r.id as string),
        // Why auto-release held (or would have) — the bot's accuracy gates
        // re-derived from the persisted signals. Explanatory only: manual
        // release ignores it.
        autoHold: computeAutoHold(r.result_json),
      };
    });

  return NextResponse.json({
    days,
    runs,
    stats: {
      scripts: runs.length,
      questions: runs.reduce((n, r) => n + r.totalQuestions, 0),
      confident: runs.reduce((n, r) => n + r.unflaggedCount, 0),
      // How often Adrian has had to correct the marker, split by who the error
      // cost. Marks he ADDED are marks a student earned and did not get — the
      // number that gates auto-release. Averaging the two directions would hide
      // exactly the one that matters.
      corrections: (data ?? []).reduce((acc, r) => {
        const t = overrideTally(r.result_json);
        return { against: acc.against + t.against, forStudent: acc.forStudent + t.forStudent, reviewed: acc.reviewed + t.reviewed };
      }, { against: 0, forStudent: 0, reviewed: 0 }),
      flagged: runs.reduce((n, r) => n + r.flagged.length, 0),
      readyToRelease: runs.filter(r => r.releasable).length,
    },
  });
}

// ── Release recipient resolution ─────────────────────────────────────────────
// Portal first (the destination), Telegram as the doorbell, Airtable as the
// fallback for students with no portal account yet.
type Recipient = { chatId: number | string; via: 'portal' | 'telegram' } | null;

async function resolveRecipient(studentId: string | null): Promise<Recipient> {
  if (!studentId) return null;

  // Stranger runs carry the acct:<uuid> portal identity
  // (lib/portal-auth.portalIdentity): their portal_accounts row is keyed by
  // that uuid — and there is no Airtable record to fall back to, so don't
  // fire a guaranteed-404 lookup at the Students table for them.
  const isStranger = studentId.startsWith('acct:');
  const { data } = await getSupabaseAdmin()
    .from('portal_accounts')
    .select('telegram_chat_id')
    .eq(isStranger ? 'id' : 'airtable_student_id', isStranger ? studentId.slice('acct:'.length) : studentId)
    .maybeSingle();
  if (data?.telegram_chat_id) return { chatId: data.telegram_chat_id, via: 'portal' };
  if (isStranger) return null; // web push (run.student_id) is their doorbell

  try {
    // Single-record GET ignores fields[] — fetch all and pick in JS.
    const student = await airtableRequest('Students', `/${studentId}`);
    const chatId = student?.fields?.['Student Telegram ID'];
    if (chatId) return { chatId: String(chatId), via: 'telegram' };
  } catch (err) {
    console.warn('[mark-triage] Airtable student lookup failed:', (err as Error).message);
  }
  return null;
}

const PORTAL_ENABLED = process.env.NEXT_PUBLIC_PORTAL_ENABLED === 'true';
const SITE = 'https://www.adrianmathtuition.com';

async function deliver(run: {
  id: string;
  paper_name: string | null;
  student_id: string | null;
  student_name: string | null;
  annotated_pdf_url: string | null;
  photos_pdf_url?: string | null;
  result_json: unknown;
}, auto = false, sheet: { title: string } | null = null): Promise<{ delivered: boolean; via: 'portal' | 'telegram' | 'none'; note?: string }> {
  // Telegram /handin runs: the marked copy goes back to the ORIGIN chat (which
  // may be a parent's, not the student's own), as the IMAGES PDF only (Adrian
  // 2026-08-22: never the full PDF, no "pass it back in class" line). On
  // auto-release the BOT is already sending the document in the same tick, so
  // this just reports success instead of double-sending.
  {
    const tg = telegramHandinOf(run.result_json);
    if (tg?.chat_id) {
      const tgName = run.paper_name || 'your paper';
      const { awarded: tgAwarded, max: tgMax } = recomputeTotals(run.result_json);
      const plainScore = tgMax > 0 ? ` — ${tgAwarded}/${tgMax}` : '';
      if (auto) return { delivered: true, via: 'telegram', note: 'marked copy sent by the bot' };
      const docUrl = run.photos_pdf_url || run.annotated_pdf_url;
      if (docUrl) {
        const ok = await sendTelegramDocumentTo(tg.chat_id, docUrl,
          `🎉 Your paper "${tgName}" has been marked${plainScore}! Here's your marked copy — the red ink is where the learning is. 💪`);
        if (ok) return { delivered: true, via: 'telegram' };
      }
      const ok = await sendTelegramTo(tg.chat_id,
        `📄 Your marked <b>${escapeHtml(tgName)}</b> is ready${tgMax > 0 ? ` — <b>${tgAwarded}/${tgMax}</b>` : ''}. Adrian will send the copy here shortly.`);
      return { delivered: ok, via: 'telegram' };
    }
  }
  const recipient = await resolveRecipient(run.student_id);
  if (!recipient) {
    return {
      delivered: false,
      via: 'none',
      note: run.student_id ? 'no Telegram link — hand back manually' : 'run has no student — hand back manually',
    };
  }

  const { awarded, max } = recomputeTotals(run.result_json);
  const name = run.paper_name || 'your paper';
  const score = max > 0 ? ` — <b>${awarded}/${max}</b>` : '';
  // Marks and remedy arrive together (SPEC-TEACHING-CYCLE step 7): when a sheet
  // rides the release, the nudge names both and points at the work, not just
  // the score. A bare score with the practice following later is the thing the
  // combined release exists to prevent.
  const sheetLine = sheet
    ? `\n\n📘 Practice to go with it: <b>${escapeHtml(sheet.title)}</b> — work it on paper, then photograph it and hand it in.\n${SITE}/app/assignments`
    : '';

  if (recipient.via === 'portal' && PORTAL_ENABLED) {
    const ok = await sendTelegramTo(
      recipient.chatId,
      `📄 Your marked <b>${escapeHtml(name)}</b> is ready${score}.\n\n${SITE}/app/marking${sheetLine}`
    );
    return { delivered: ok, via: 'portal' };
  }

  // No portal (or portal off): send the annotated PDF itself.
  if (run.annotated_pdf_url) {
    const ok = await sendTelegramDocumentTo(
      recipient.chatId,
      run.annotated_pdf_url,
      `📄 Your marked ${name}${max > 0 ? ` — ${awarded}/${max}` : ''}${sheet ? `\n\n📘 Practice to go with it: ${sheet.title} — in the app under From Adrian.` : ''}`
    );
    if (ok) return { delivered: true, via: 'telegram' };
  }
  const ok = await sendTelegramTo(
    recipient.chatId,
    `📄 Your marked <b>${escapeHtml(name)}</b> is ready${score}. Adrian will pass it to you in class.${sheetLine}`
  );
  return { delivered: ok, via: 'telegram' };
}

/** Telegram /handin runs — the bot stamps result_json.telegram_handin at queue time. */
function telegramHandinOf(resultJson: unknown): { chat_id?: string | number } | null {
  if (!resultJson || typeof resultJson !== 'object') return null;
  const tg = (resultJson as { telegram_handin?: unknown }).telegram_handin;
  return tg && typeof tg === 'object' ? (tg as { chat_id?: string | number }) : null;
}

/** Annotated page images for the triage cards — Adrian compares the AI's call against the actual working. */
function extractAnnotatedPhotos(resultJson: unknown): { photoIndex: number; url: string }[] {
  if (!resultJson || typeof resultJson !== 'object') return [];
  const arr = (resultJson as { annotated_photos?: unknown }).annotated_photos;
  if (!Array.isArray(arr)) return [];
  return arr
    .map(p => (p && typeof p === 'object'
      ? { photoIndex: (p as { photo_index?: number }).photo_index ?? -1, url: (p as { url?: string }).url || '' }
      : { photoIndex: -1, url: '' }))
    .filter(p => p.photoIndex >= 0 && !!p.url);
}

/** The site-side stamp /api/portal/submit writes — the only runs auto-release may touch. */
function isPortalSubmission(resultJson: unknown): boolean {
  return !!resultJson && typeof resultJson === 'object' && (resultJson as { portal_submission?: unknown }).portal_submission === true;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Post-release enrichment ──────────────────────────────────────────────────
// Two fire-and-forget jobs per released dropped-marks run, via after():
// release NEVER waits on either or fails because of them.
//
//   1. Revise mapping (website-side, lib/revise-map) — one model call maps
//      each dropped question to a swipe-card sub-group, stored as
//      `result_json.revise` and rendered as "📚 Revise" links on /app/marking.
//   2. Practice generation (bot-side) — one follow-up question per dropped
//      question, stored as `result_json.practice`.
//
// Both write result_json with a read-merge-write, so per run they MUST stay
// sequential — mapping completes its write before the bot is asked to do its
// own. Both are idempotent: mapping skips when `revise` already exists, and
// the bot returns a stored practice list without a model call (so Adrian's
// earlier 📝 press, or a retry, never double-pays). Full-mark papers are
// skipped before any of this is even queued.
function queuePostReleaseEnrichment(runIds: string[], practiceIds?: string[]) {
  if (!runIds.length) return;
  // Practice generation (a model call per dropped question) runs only for the
  // ids in practiceIds — Telegram hand-ins are excluded since 22 Aug 2026: the
  // student's 📝 button generates on demand, so an untapped paper costs nothing
  // (Adrian: "if they don't tap the button, there is no need to generate").
  // Revise mapping still runs for every released run (cheap, powers the portal
  // chips).
  const wantPractice = new Set(practiceIds ?? runIds);
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  const botHeaders = { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' };

  after(async () => {
    const supa = getSupabaseAdmin();
    for (const id of runIds) {
      try {
        // Fresh read — the row may have moved since the release loop held it.
        const { data: row } = await supa
          .from('paper_marking_runs')
          .select('result_json')
          .eq('id', id)
          .single();
        const rj = (row?.result_json && typeof row.result_json === 'object')
          ? row.result_json as Record<string, unknown>
          : null;
        if (rj && !rj.revise) {
          const revise = await buildReviseBlock(rj);
          if (revise) {
            const { error } = await supa
              .from('paper_marking_runs')
              .update({ result_json: { ...rj, revise } })
              .eq('id', id);
            if (error) console.warn(`[mark-triage] revise mapping write failed for ${id}:`, error.message);
          }
        }
      } catch (err) {
        console.warn(`[mark-triage] revise mapping failed for ${id}:`, (err as Error).message);
      }
    }

    if (!botBase || !botSecret) return;
    for (const id of runIds) {
      if (!wantPractice.has(id)) continue;
      try {
        const r = await fetch(`${botBase}/api/mark-paper`, {
          method: 'POST', headers: botHeaders, body: JSON.stringify({ phase: 'practice', id }),
        });
        const d = await r.json().catch(() => ({} as { error?: string; items?: unknown[] }));
        if (!r.ok || d.error) {
          console.warn(`[mark-triage] practice generation failed for ${id}:`, d.error || r.status);
          continue;
        }
        if (!Array.isArray(d.items) || d.items.length === 0) continue;
        // House-style Word file of the list — also stored on the run, and also
        // idempotent (practice.docx_url wins on the bot side).
        await fetch(`${botBase}/api/mark-paper`, {
          method: 'POST', headers: botHeaders, body: JSON.stringify({ phase: 'practice-docx', id }),
        }).catch(() => { /* the on-page list still renders without the file */ });
      } catch (err) {
        console.warn(`[mark-triage] practice generation failed for ${id}:`, (err as Error).message);
      }
    }
  });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    action?: string;
    runId?: string;
    runIds?: string[];
    url?: string;
    questionIdx?: number;
    awarded?: number;
    note?: string;
    auto?: boolean;
    /** 📘 Optional sheet to release alongside the marked copy (step 7). */
    sheet?: { pdfUrl?: string; title?: string; note?: string; topic?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const supa = getSupabaseAdmin();
  const now = new Date().toISOString();

  // ── agree / override: read-modify-write one run's result_json ──────────────
  if (body.action === 'agree' || body.action === 'override') {
    const { runId, questionIdx } = body;
    if (!runId || typeof questionIdx !== 'number') {
      return NextResponse.json({ error: 'runId and questionIdx are required' }, { status: 400 });
    }

    const { data: run, error: readErr } = await supa
      .from('paper_marking_runs')
      .select('id, result_json, released_at')
      .eq('id', runId)
      .single();
    if (readErr || !run) return NextResponse.json({ error: readErr?.message || 'run not found' }, { status: 404 });
    if (run.released_at) {
      return NextResponse.json({ error: 'already released — marks are final' }, { status: 409 });
    }

    let nextJson: Record<string, unknown>;
    try {
      nextJson =
        body.action === 'agree'
          ? applyAgree(run.result_json, questionIdx, now)
          : applyOverride(run.result_json, questionIdx, Number(body.awarded), body.note ?? '', now);
    } catch (err) {
      if (err instanceof TriageIndexError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }

    const totals = recomputeTotals(nextJson);
    // An OVERRIDE changes the number in the portal but not the ink already
    // baked into the marked PDF, and the paper-total strip is drawn from these
    // columns at assembly time — so after this write the stored PDF says
    // something else. Sophie's 31 Aug paper would have gone out reading 67/90
    // on screen and 71/90 on the page. Mark it stale here; release refuses
    // while it is, until Adrian attaches his amended copy or rebuilds.
    // (Agree changes no mark, so it never makes the PDF stale.)
    const staleJson = body.action === 'override' && Number(body.awarded) !== undefined
      ? { ...nextJson, pdf_stale: { at: now, reason: `Q index ${questionIdx} overridden to ${Number(body.awarded)}` } }
      : nextJson;
    const { error: writeErr } = await supa
      .from('paper_marking_runs')
      .update({ result_json: staleJson, total_awarded: totals.awarded, total_max: totals.max })
      .eq('id', runId);
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      runId,
      awarded: totals.awarded,
      max: totals.max,
      pending: pendingCount(nextJson),
      releasable: isReleasable(nextJson),
      pdfStale: body.action === 'override',
    });
  }

  // ── attach-amended: Adrian's own hand on the marked copy ──────────────────
  // He downloads the marked PDF, writes on it (Sophie's carries "= 67/90" and
  // "-4" in red), and this makes THAT the copy the student opens. Batch marking
  // has had this for months as "Upload amended PDF"; the single-paper flow had
  // no equivalent, so an edited paper could only be attached through an API
  // call. It also clears pdf_stale — a copy Adrian has written the true total
  // on is, by definition, no longer out of date.
  if (body.action === 'attach-amended') {
    const { runId } = body;
    const url = String((body as { url?: unknown }).url ?? '').trim();
    if (!runId || !url) return NextResponse.json({ error: 'runId and url are required' }, { status: 400 });
    if (!/^https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\//.test(url)) {
      return NextResponse.json({ error: 'url must be a Vercel Blob URL' }, { status: 400 });
    }
    const { data: run, error: readErr } = await supa
      .from('paper_marking_runs').select('id, result_json, released_at').eq('id', runId).single();
    if (readErr || !run) return NextResponse.json({ error: readErr?.message || 'run not found' }, { status: 404 });
    if (run.released_at) return NextResponse.json({ error: 'already released — the student has this copy' }, { status: 409 });
    const rj = (run.result_json || {}) as Record<string, unknown>;
    delete rj.pdf_stale;
    const { error: upErr } = await supa
      .from('paper_marking_runs').update({ annotated_pdf_url: url, result_json: rj }).eq('id', runId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, runId, annotatedPdfUrl: url });
  }

  // ── release: stamp + nudge ────────────────────────────────────────────────
  if (body.action === 'release') {
    const runIds = body.runIds?.length ? body.runIds : body.runId ? [body.runId] : [];
    if (!runIds.length) return NextResponse.json({ error: 'runIds is required' }, { status: 400 });

    const auto = body.auto === true;
    // 📘 Release WITH the sheet (SPEC-TEACHING-CYCLE step 7). Optional: without
    // it this is exactly the old release. The assignment is created BEFORE the
    // release stamp so a failed assignment can never leave the student holding
    // a bare score — release aborts instead, and Adrian retries.
    const sheet = body.sheet && typeof body.sheet === 'object'
      ? {
          pdfUrl: String((body.sheet as { pdfUrl?: unknown }).pdfUrl ?? '').trim(),
          title: String((body.sheet as { title?: unknown }).title ?? '').trim(),
          note: String((body.sheet as { note?: unknown }).note ?? '').trim(),
          topic: String((body.sheet as { topic?: unknown }).topic ?? '').trim(),
        }
      : null;
    if (sheet && !sheet.pdfUrl) {
      return NextResponse.json({ error: 'sheet.pdfUrl is required when attaching a sheet' }, { status: 400 });
    }
    if (sheet && runIds.length > 1) {
      return NextResponse.json({ error: 'a sheet can only ride a single-run release' }, { status: 400 });
    }

    const { data: runs, error: readErr } = await supa
      .from('paper_marking_runs')
      .select('id, paper_name, student_id, student_name, annotated_pdf_url, photos_pdf_url, result_json, released_at, created_at')
      .in('id', runIds);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    // A paper whose marks were overridden carries a PDF that still shows the old
    // ones. Releasing it sends the student two different totals — the corrected
    // one in the portal, the original printed on the page she opens. Refuse,
    // and name the fix: attach the copy you wrote the new total on.
    const stale = (runs ?? []).filter(r => (r.result_json as { pdf_stale?: unknown } | null)?.pdf_stale);
    if (stale.length) {
      return NextResponse.json({
        error: stale.length === 1
          ? 'This paper\u2019s marks were changed after it was marked, so its PDF still shows the old total. Upload your amended copy first (\u270f\ufe0f the marked PDF you wrote the new total on), then release.'
          : `${stale.length} of these papers had marks changed after marking, so their PDFs show the old totals. Upload the amended copies first.`,
        staleRunIds: stale.map(r => r.id),
      }, { status: 409 });
    }

    const results: {
      runId: string;
      studentName: string | null;
      released: boolean;
      via: string;
      note?: string;
    }[] = [];
    const practiceQueue: string[] = [];
    const enrichQueue: string[] = [];

    for (const run of runs ?? []) {
      if (run.released_at) {
        results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: 'already released' });
        continue;
      }
      if (auto && AUTO_RELEASE_PAUSED) {
        results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: 'auto-release paused — accuracy gates pending; review in triage' });
        continue;
      }
      if (auto && !isPortalSubmission(run.result_json) && !telegramHandinOf(run.result_json)) {
        // Auto-release is for papers students handed in themselves (portal or
        // Telegram /handin — Adrian 2026-08-22: "release to student once marking
        // is done"). Anything Adrian uploaded keeps the manual gate.
        results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: 'not a student hand-in — release from triage' });
        continue;
      }
      if (!auto && !isReleasable(run.result_json)) {
        results.push({
          runId: run.id,
          studentName: run.student_name,
          released: false,
          via: 'none',
          note: `${pendingCount(run.result_json)} question(s) still need review`,
        });
        continue;
      }

      // Create the assignment first — see the `sheet` comment above.
      let sheetForNudge: { title: string } | null = null;
      if (sheet) {
        if (!run.student_id) {
          results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: 'tag the run to a student before releasing a sheet with it' });
          continue;
        }
        const title = sheet.title || `Practice — from ${run.paper_name || 'your marked paper'}`;
        const v = validateAssignment({
          studentId: run.student_id,
          kind: 'worksheet',
          pdfUrl: sheet.pdfUrl,
          title,
          topic: sheet.topic || null,
          note: sheet.note || 'Read your newest marked paper first, then work this sheet on paper — photograph it and hand it in here when you are done.',
          // The sheet is written FROM this paper — recording it is what lets the
          // marked copy say "practice was sent from this" and the shelf know
          // which wave a topic belongs to.
          sourceRunId: run.id,
        });
        if (!v.ok) {
          results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: `sheet rejected: ${v.error}` });
          continue;
        }
        const { data: created, error: aErr } = await supa.from('portal_assignments').insert(v.row).select('id').single();
        if (aErr || !created) {
          results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: `could not assign the sheet: ${aErr?.message ?? 'insert failed'} — nothing released` });
          continue;
        }
        sheetForNudge = { title };
      }

      const outcome = await deliver(run, auto, sheetForNudge);
      const via = auto ? `auto:${outcome.via}` : outcome.via;

      // Stamp regardless of whether a nudge landed: the release IS Adrian's
      // decision, and a student with no Telegram must not keep re-appearing in
      // triage forever. `released_via: 'none'` is the record that it needs a
      // hand-back.
      const { error: writeErr } = await supa
        .from('paper_marking_runs')
        .update({ released_at: now, released_via: via })
        .eq('id', run.id);
      if (writeErr) {
        results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: writeErr.message });
        continue;
      }
      results.push({
        runId: run.id,
        studentName: run.student_name,
        released: true,
        via,
        note: outcome.note,
      });

      // A re-mark replaces the old marking instead of sitting beside it
      // (Adrian, 2026-08-31: "re-mark lands, previous run auto-archive").
      // Releasing THIS run stamps `superseded_by` on every earlier released
      // marking of the same paper for the same student, so the student's
      // /app/marking shows one — the current — score. Nothing is deleted and
      // `released_at` is untouched: /admin/papers still has the full history.
      // Non-fatal by design; a failure here must never undo a release.
      try {
        if (!run.student_id || !run.paper_name) throw new Error('untagged run — nothing to supersede');
        const { data: siblings } = await supa
          .from('paper_marking_runs')
          .select('id, student_id, paper_name, created_at, superseded_by')
          .eq('student_id', run.student_id)
          .not('released_at', 'is', null)
          .is('superseded_by', null)
          .limit(200);
        const stale = pickSuperseded(
          { id: run.id, student_id: run.student_id, paper_name: run.paper_name, created_at: run.created_at },
          siblings ?? [],
        );
        if (stale.length) {
          await supa.from('paper_marking_runs').update({ superseded_by: run.id }).in('id', stale);
        }
      } catch (e) {
        // Untagged runs land here by design — an unnamed or unassigned paper
        // has no identity to match on, so it replaces nothing.
        console.warn('[mark-triage] supersede skipped:', (e as Error).message);
      }

      // Web push (portal): "Your marked paper is ready ✅" on every device the
      // student turned notifications on for (/app/settings). Runs after the
      // response via after(); sendPushToStudent never throws — a push failure
      // must NEVER fail or delay a release. Rides alongside the Telegram
      // nudge, not instead of it.
      if (run.student_id) {
        const pushStudentId = run.student_id;
        const pushBody = run.paper_name || 'Tap to see your marks';
        try {
          after(() => sendPushToStudent(pushStudentId, {
            title: 'Your marked paper is ready ✅',
            body: pushBody,
            url: '/app/marking',
          }));
        } catch (err) {
          console.warn('[mark-triage] push scheduling failed:', (err as Error).message);
        }
      }

      // Full marks → nothing to practise; don't even queue the call.
      const totals = recomputeTotals(run.result_json);
      if (totals.max > 0 && totals.awarded < totals.max) {
        enrichQueue.push(run.id);
        // Telegram hand-ins generate practice on the student's 📝 tap instead.
        if (!telegramHandinOf(run.result_json)) practiceQueue.push(run.id);
      }

      // "From Adrian" worksheet (SPEC-ASSIGN.md): the hand-in stamped its
      // assignment id on the run; releasing the marking is what flips the
      // assignment to marked (a re-mark + re-release overwrites the score).
      const rj = (run.result_json && typeof run.result_json === 'object') ? run.result_json as Record<string, unknown> : {};
      const assignmentId = typeof rj.assignment_id === 'string' ? rj.assignment_id : null;
      if (assignmentId) {
        try {
          const { data: a } = await supa.from('portal_assignments').select('id, status').eq('id', assignmentId).maybeSingle();
          if (a && canTransition(a.status as AssignmentStatus, 'marked')) {
            await supa.from('portal_assignments')
              .update({ status: 'marked', marked_at: now, run_id: run.id, score: totals.awarded, out_of: totals.max })
              .eq('id', assignmentId);
          }
        } catch (e) {
          console.warn('[mark-triage] assignment flip failed:', (e as Error).message);
        }
      }
    }

    queuePostReleaseEnrichment(enrichQueue, practiceQueue);

    return NextResponse.json({
      ok: true,
      released: results.filter(r => r.released).length,
      notified: results.filter(r => r.released && !r.via.endsWith('none')).length,
      results,
    });
  }

  // ── archive: "seen" — out of the queue WITHOUT releasing ──────────────────
  if (body.action === 'archive') {
    if (!body.runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });
    const { data: run, error: readErr } = await supa
      .from('paper_marking_runs')
      .select('id, released_at')
      .eq('id', body.runId)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
    if (run.released_at) {
      return NextResponse.json({ error: 'already released — nothing to archive' }, { status: 409 });
    }
    const { error: writeErr } = await supa
      .from('paper_marking_runs')
      .update({ archived_at: now })
      .eq('id', body.runId);
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, archived: 1 });
  }

  if (body.action === 'archive-all') {
    // Bulk-clear the whole waiting queue (no date window — older-than-view runs
    // go too). One guard: a HELD STUDENT HAND-IN is never swallowed en masse.
    // Portal submissions auto-release on the happy path, so one sitting here
    // unreleased IS the signal Adrian must act on (release or re-mark) — it can
    // only be archived deliberately, one run at a time.
    const [{ data: toArchive, error: readErr }, { count: skippedStudent }] = await Promise.all([
      supa
        .from('paper_marking_runs')
        .select('id')
        .is('released_at', null)
        .is('archived_at', null)
        .not('result_json->results', 'is', null)
        .is('result_json->portal_submission', null),
      supa
        .from('paper_marking_runs')
        .select('id', { count: 'exact', head: true })
        .is('released_at', null)
        .is('archived_at', null)
        .not('result_json->results', 'is', null)
        .not('result_json->portal_submission', 'is', null),
    ]);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const ids = (toArchive ?? []).map(r => r.id);
    if (ids.length) {
      const { error: writeErr } = await supa
        .from('paper_marking_runs')
        .update({ archived_at: now })
        .in('id', ids);
      if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, archived: ids.length, skippedStudent: skippedStudent ?? 0 });
  }

  return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
}
