// /api/admin/decide — "Decide here" on /admin (lib/decide.ts says why, 6 Nov 2026).
// ADMIN-ONLY.
//
// GET  → { rules[], ships[], papers[], papersTotal, questions[], questionsTotal }
// POST { kind:'rule',  slug, action: ship|change|drop, note? } → files a proposal_requests row (the worker applies it)
// POST { kind:'ship',  slug, action: ship|drop }               → files a new request for a proposal that did not ship
// POST { kind:'paper', id,   action: done|requeue }            → a flagged extraction paper: fine as it is, or back in the queue
// Questions to vet are decided through PATCH /api/admin/question-proposals, unchanged.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { wakeWorker } from '@/lib/overnight-io';
import { proposalRequestRow } from '@/lib/overnight';
import { canRetry, checkDecide, failedWhy, flagReason, newestPerSlug, sessionAsk, stillFailed, tapWords, type ReqRow } from '@/lib/decide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEEK = 7 * 86400_000;
const PAPERS_MAX = 200;
const QUESTIONS_MAX = 100;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  try {
    const [rulesR, reqsR, papersR, papersN, qR, qN] = await Promise.all([
      sb.from('extraction_rules').select('slug, title, plain_words, why, status, requeue_ids').in('status', ['proposed', 'redraft']).order('id', { ascending: false }),
      sb.from('proposal_requests').select('slug, action, status, failure_kind, result, requested_at').gte('requested_at', new Date(Date.now() - WEEK).toISOString()).limit(1000),
      sb.from('paper_library').select('id, source_file, status, notes, finished_at').eq('kind', 'source').in('status', ['flagged', 'failed'])
        .order('finished_at', { ascending: false, nullsFirst: false }).limit(PAPERS_MAX),
      sb.from('paper_library').select('id', { count: 'exact', head: true }).eq('kind', 'source').in('status', ['flagged', 'failed']),
      sb.from('authored_question_proposals').select('id, level, topics, question_text, answer, solution, marks, skill, verification, created_at')
        .eq('status', 'pending').order('created_at', { ascending: true }).limit(QUESTIONS_MAX),
      sb.from('authored_question_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    for (const r of [rulesR, reqsR, papersR, qR]) if (r.error) throw new Error(r.error.message);

    const reqs = (reqsR.data ?? []) as ReqRow[];
    const newest = newestPerSlug(reqs);
    const rules = (rulesR.data ?? []).map((r) => ({
      slug: String(r.slug), title: String(r.title || r.slug), plainWords: (r.plain_words as string | null) ?? '', why: (r.why as string | null) ?? '',
      redraft: r.status === 'redraft', papers: Array.isArray(r.requeue_ids) ? r.requeue_ids.length : 0,
      tap: tapWords(newest.get(String(r.slug))),
      busy: ['pending', 'running'].includes(newest.get(String(r.slug))?.status ?? ''),
    }));
    // a rule's own failed tap is shown on the rule, not twice
    const ships = stillFailed(reqs).filter((r) => !r.slug.startsWith('xr-')).map((r) => ({
      slug: r.slug, at: r.requested_at, why: failedWhy(r), retry: canRetry(r), ask: sessionAsk(r),
    }));
    // a ship tapped again from this list shows its new state
    const shipsBusy = [...newest.values()].filter((r) => !r.slug.startsWith('xr-') && ['pending', 'running'].includes(r.status) && reqs.some((x) => x.slug === r.slug && ['failed', 'needs_session'].includes(x.status)))
      .map((r) => ({ slug: r.slug, words: tapWords(r) }));
    const papers = (papersR.data ?? []).map((p) => ({
      id: String(p.id), file: String(p.source_file || 'A paper').replace(/\.pdf$/i, ''), failed: p.status === 'failed',
      why: flagReason(p.notes as string | null, String(p.status)), notes: String(p.notes || '').slice(0, 4000),
    }));
    return NextResponse.json({
      rules, ships, shipsBusy, papers, papersTotal: papersN.count ?? papers.length,
      questions: qR.data ?? [], questionsTotal: qN.count ?? (qR.data ?? []).length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = checkDecide(await req.json().catch(() => ({})));
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  const d = c.d;
  const sb = getSupabaseAdmin();

  if (d.kind === 'paper') {
    if (d.action === 'requeue') {
      const { data, error } = await sb.rpc('finish_extraction_paper', { p_id: d.id, p_runner: 'admin', p_status: 'queued', p_notes: `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] Adrian on /admin: try again` });
      if (error) return NextResponse.json({ error: error.message }, { status: 502 });
      if (!(Array.isArray(data) ? data[0] : data)) return NextResponse.json({ error: 'That paper could not be put back. Refresh the page.' }, { status: 409 });
      return NextResponse.json({ ok: true, message: 'Back in the queue.' });
    }
    const { data: row, error: readErr } = await sb.from('paper_library').select('notes').eq('id', d.id).eq('kind', 'source').in('status', ['flagged', 'failed']).maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 502 });
    if (!row) return NextResponse.json({ error: 'That paper is no longer waiting. Refresh the page.' }, { status: 409 });
    const stamp = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] Adrian on /admin: fine as it is`;
    const { error } = await sb.from('paper_library').update({ status: 'done', notes: [row.notes, stamp].filter(Boolean).join(' | ') })
      .eq('id', d.id).eq('kind', 'source').in('status', ['flagged', 'failed']);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, message: 'Marked as fine.' });
  }

  // a rule or a proposal: it must still be waiting
  if (d.kind === 'rule') {
    const { data } = await sb.from('extraction_rules').select('status').eq('slug', d.slug).maybeSingle();
    if (!data || data.status !== 'proposed') return NextResponse.json({ error: 'This rule is no longer waiting. Refresh the page.' }, { status: 409 });
  } else {
    const { data } = await sb.from('proposal_requests').select('slug, action, status, failure_kind, result, requested_at').eq('slug', d.slug)
      .gte('requested_at', new Date(Date.now() - WEEK).toISOString()).limit(100);
    if (!stillFailed((data ?? []) as ReqRow[]).length) return NextResponse.json({ error: 'This proposal is no longer in the list. Refresh the page.' }, { status: 409 });
  }

  const { data: busy } = await sb.from('proposal_requests').select('id').eq('slug', d.slug).in('status', ['pending', 'running']).limit(1);
  if (busy && busy.length) return NextResponse.json({ ok: true, duplicate: true, message: 'Already being done.' });
  // the same columns a Telegram tap writes, with no Telegram message: the worker answers on this page
  const row = proposalRequestRow({ slug: d.slug, action: d.action, note: d.note }, process.env.TELEGRAM_CHAT_ID);
  const { error } = await sb.from('proposal_requests').insert(row);
  if (error?.code === '23505') return NextResponse.json({ ok: true, duplicate: true, message: 'Already being done.' });
  if (error) return NextResponse.json({ error: `Could not send it: ${error.message}` }, { status: 500 });
  const wake = await wakeWorker(`proposal ${d.action} ${d.slug} (website decide)`);
  return NextResponse.json({ ok: true, wake, message: 'Sent. Usually done in under a minute.' });
}
