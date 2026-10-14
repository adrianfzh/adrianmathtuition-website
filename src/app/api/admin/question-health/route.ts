// /api/admin/question-health — 🩺 the question check's one door (SPEC-QUESTION-HEALTH.md, 14 Oct 2026).
// Admin-authed: Adrian's page, and the Fly worker lane (it holds ADMIN_PASSWORD, like every lane).
//
// GET                  → { settings, week, paused[], edits[] }  (the page)
// GET ?peek=1          → { on, waiting }                        (the worker's one-curl peek)
// POST {action:'switch', on}                 Adrian turns the check on / off
// POST {action:'claim', runner, n}           the worker takes up to n questions (≤10)
// POST {action:'result', report, runner}     the worker's report → decide() → edits + stamp
// POST {action:'enqueue', ids, reason}       a sheet session queues what it picked
// POST {action:'status', ids}                a sheet session asks which picks are paused/retired/checked
// POST {action:'undo', edit_id}              take one automatic edit back
// POST {action:'decide', question_id, choice: 'keep'|'use-solver'|'retire'}   Adrian's answer on a paused one
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { parseReport } from '@/lib/question-health';
import {
  adrianDecide, claim, getSettings, isHealthReason, listPaused, listRecentEdits, noteServed, peek, setOn, submitResult, undoEdit, weekCounts,
} from '@/lib/question-health-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    if (req.nextUrl.searchParams.get('peek') === '1') return NextResponse.json(await peek());
    const [settings, week, paused, edits] = await Promise.all([getSettings(), weekCounts(), listPaused(), listRecentEdits()]);
    return NextResponse.json({ settings, week, paused, edits });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case 'switch':
        if (typeof body.on !== 'boolean') return NextResponse.json({ error: 'on must be true or false' }, { status: 400 });
        return NextResponse.json({ settings: await setOn(body.on, 'adrian') });
      case 'claim': {
        const n = Math.max(1, Math.min(10, Number(body.n) || 3));
        return NextResponse.json({ questions: await claim(String(body.runner || 'worker'), n) });
      }
      case 'result': {
        const parsed = parseReport(body.report);
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
        const decision = await submitResult(parsed.value, String(body.runner || 'worker'));
        return NextResponse.json({ ok: true, status: decision.status, note: decision.note, edits: decision.edits.length });
      }
      case 'enqueue': {
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : [];
        if (!isHealthReason(body.reason)) return NextResponse.json({ error: 'reason' }, { status: 400 });
        await noteServed(ids, body.reason);
        return NextResponse.json({ ok: true, ids: ids.length });
      }
      case 'status': {
        const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 500) : [];
        const { data, error } = ids.length ? await getSupabaseAdmin().from('question_health').select('question_id, status').in('question_id', ids) : { data: [], error: null };
        if (error) throw new Error(error.message);
        const seen = new Map((data ?? []).map((r) => [r.question_id, r.status]));
        return NextResponse.json({ statuses: Object.fromEntries(ids.map((id) => [id, seen.get(id) ?? 'unchecked'])) });
      }
      case 'undo': {
        const id = Number(body.edit_id);
        if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'edit_id' }, { status: 400 });
        await undoEdit(id, 'adrian');
        return NextResponse.json({ ok: true });
      }
      case 'decide': {
        const qid = String(body.question_id || '');
        const choice = body.choice;
        if (!UUID.test(qid) || (choice !== 'keep' && choice !== 'use-solver' && choice !== 'retire')) return NextResponse.json({ error: 'question_id + choice' }, { status: 400 });
        await adrianDecide(qid, choice, 'adrian');
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
