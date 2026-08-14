// Batch triage over recent marking runs — /admin/mark/triage.
//
// GET  → unreleased runs from the last N days, each reduced to ONLY the
//        questions the marker asked a human to look at.
// POST → { action: 'agree' | 'override' | 'release' }.
//
// Release is the one thing here with an outward effect: it stamps `released_at`
// and nudges the student. Nothing reaches a student without that explicit tap —
// Adrian's review is the trust gate on AI marking (HANDOFF-MARKING-LOOP.md,
// locked decision 2).
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegramTo, sendTelegramDocumentTo } from '@/lib/telegram';
import {
  extractFlagged,
  applyAgree,
  applyOverride,
  recomputeTotals,
  isReleasable,
  pendingCount,
  TriageIndexError,
} from '@/lib/mark-triage';

export const runtime = 'nodejs';
// Release itself is fast; the ceiling is for the after() practice generation,
// which makes one model call per released paper with dropped marks.
export const maxDuration = 300;

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const RUN_COLUMNS =
  'id, created_at, paper_name, student_id, student_name, total_awarded, total_max, num_questions, annotated_pdf_url, pdf_url, released_at';

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
    .gte('created_at', daysAgoIso(days))
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
        studentId: r.student_id,
        studentName: r.student_name,
        awarded: summary.awarded,
        max: summary.max,
        totalQuestions: summary.totalQuestions,
        unflaggedCount: summary.unflaggedCount,
        annotatedPdfUrl: r.annotated_pdf_url,
        pdfUrl: r.pdf_url,
        flagged: summary.flagged,
        releasable: summary.flagged.length === 0,
      };
    });

  return NextResponse.json({
    days,
    runs,
    stats: {
      scripts: runs.length,
      questions: runs.reduce((n, r) => n + r.totalQuestions, 0),
      confident: runs.reduce((n, r) => n + r.unflaggedCount, 0),
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

  const { data } = await getSupabaseAdmin()
    .from('portal_accounts')
    .select('telegram_chat_id')
    .eq('airtable_student_id', studentId)
    .maybeSingle();
  if (data?.telegram_chat_id) return { chatId: data.telegram_chat_id, via: 'portal' };

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
  result_json: unknown;
}): Promise<{ delivered: boolean; via: 'portal' | 'telegram' | 'none'; note?: string }> {
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

  if (recipient.via === 'portal' && PORTAL_ENABLED) {
    const ok = await sendTelegramTo(
      recipient.chatId,
      `📄 Your marked <b>${escapeHtml(name)}</b> is ready${score}.\n\n${SITE}/app/marking`
    );
    return { delivered: ok, via: 'portal' };
  }

  // No portal (or portal off): send the annotated PDF itself.
  if (run.annotated_pdf_url) {
    const ok = await sendTelegramDocumentTo(
      recipient.chatId,
      run.annotated_pdf_url,
      `📄 Your marked ${name}${max > 0 ? ` — ${awarded}/${max}` : ''}`
    );
    if (ok) return { delivered: true, via: 'telegram' };
  }
  const ok = await sendTelegramTo(
    recipient.chatId,
    `📄 Your marked <b>${escapeHtml(name)}</b> is ready${score}. Adrian will pass it to you in class.`
  );
  return { delivered: ok, via: 'telegram' };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Post-release practice generation ─────────────────────────────────────────
// One follow-up question per dropped-marks question, built by the bot and
// stored on the run (`result_json.practice`) — /app/marking renders it under
// the paper. Fire-and-forget via after(): release NEVER waits on it or fails
// because of it. Safe to re-run — the bot returns a stored list without a
// model call (so Adrian's earlier 📝 press, or a retry, never double-pays) —
// and skipped entirely for full-mark papers before this is even queued.
function queuePracticeGeneration(runIds: string[]) {
  const botBase = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botBase || !botSecret || !runIds.length) return;
  const headers = { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' };

  after(async () => {
    for (const id of runIds) {
      try {
        const r = await fetch(`${botBase}/api/mark-paper`, {
          method: 'POST', headers, body: JSON.stringify({ phase: 'practice', id }),
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
          method: 'POST', headers, body: JSON.stringify({ phase: 'practice-docx', id }),
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
    questionIdx?: number;
    awarded?: number;
    note?: string;
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
    const { error: writeErr } = await supa
      .from('paper_marking_runs')
      .update({ result_json: nextJson, total_awarded: totals.awarded, total_max: totals.max })
      .eq('id', runId);
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      runId,
      awarded: totals.awarded,
      max: totals.max,
      pending: pendingCount(nextJson),
      releasable: isReleasable(nextJson),
    });
  }

  // ── release: stamp + nudge ────────────────────────────────────────────────
  if (body.action === 'release') {
    const runIds = body.runIds?.length ? body.runIds : body.runId ? [body.runId] : [];
    if (!runIds.length) return NextResponse.json({ error: 'runIds is required' }, { status: 400 });

    const { data: runs, error: readErr } = await supa
      .from('paper_marking_runs')
      .select('id, paper_name, student_id, student_name, annotated_pdf_url, result_json, released_at')
      .in('id', runIds);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const results: {
      runId: string;
      studentName: string | null;
      released: boolean;
      via: string;
      note?: string;
    }[] = [];
    const practiceQueue: string[] = [];

    for (const run of runs ?? []) {
      if (run.released_at) {
        results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: 'already released' });
        continue;
      }
      if (!isReleasable(run.result_json)) {
        results.push({
          runId: run.id,
          studentName: run.student_name,
          released: false,
          via: 'none',
          note: `${pendingCount(run.result_json)} question(s) still need review`,
        });
        continue;
      }

      const outcome = await deliver(run);

      // Stamp regardless of whether a nudge landed: the release IS Adrian's
      // decision, and a student with no Telegram must not keep re-appearing in
      // triage forever. `released_via: 'none'` is the record that it needs a
      // hand-back.
      const { error: writeErr } = await supa
        .from('paper_marking_runs')
        .update({ released_at: now, released_via: outcome.via })
        .eq('id', run.id);
      if (writeErr) {
        results.push({ runId: run.id, studentName: run.student_name, released: false, via: 'none', note: writeErr.message });
        continue;
      }
      results.push({
        runId: run.id,
        studentName: run.student_name,
        released: true,
        via: outcome.via,
        note: outcome.note,
      });

      // Full marks → nothing to practise; don't even queue the call.
      const totals = recomputeTotals(run.result_json);
      if (totals.max > 0 && totals.awarded < totals.max) practiceQueue.push(run.id);
    }

    queuePracticeGeneration(practiceQueue);

    return NextResponse.json({
      ok: true,
      released: results.filter(r => r.released).length,
      notified: results.filter(r => r.released && r.via !== 'none').length,
      results,
    });
  }

  return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 });
}
