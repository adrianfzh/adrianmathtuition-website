// /api/admin/question-proposals — practice questions the sheet worker WROTE,
// held for Adrian's vetting before they can join the bank.
//
//   POST  { runId?, sheetJobId?, level, topics[], questionText, … }  → { proposal }
//   GET   ?status=pending&limit=                                     → { proposals }
//   PATCH { id, action:'approve'|'reject', notes? }                  → { ok }
//
// Why this exists: every practice question on every sheet so far was invented,
// used once inside one student's DOCX, and lost. The bank never grew, so the next
// sheet on the same skill invented the same question again. The skill now searches
// the bank first (qb-search) and authors only on a genuine miss — and a genuine
// miss is worth keeping, because it says what the bank lacks.
//
// Approving does NOT publish. It marks the question fit to publish; moving it into
// `questions` is a separate deliberate step, because that table feeds the kiosk,
// worksheets and the portal, and a question reaching students by way of a queue
// nobody re-read is exactly the accident this table exists to prevent.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sanitizeProposal, MAX_LIST } from '@/lib/question-proposals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }

  const clean = sanitizeProposal(body);
  if ('error' in clean) return NextResponse.json({ error: clean.error }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('authored_question_proposals').insert(clean.row).select('id, status').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposal: data });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const status = q.get('status') || 'pending';
  const limit = Math.min(Number(q.get('limit')) || 100, MAX_LIST);

  let query = getSupabaseAdmin()
    .from('authored_question_proposals').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as { id?: number; action?: string; notes?: string }));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  // Guarded on 'pending': a proposal already ruled on stays ruled on, so a stale
  // tab cannot silently reverse a decision.
  const { data, error } = await getSupabaseAdmin()
    .from('authored_question_proposals')
    .update({
      status: body.action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(),
      ...(typeof body.notes === 'string' && body.notes.trim() ? { notes: body.notes.trim().slice(0, 2000) } : {}),
    })
    .eq('id', id).eq('status', 'pending')
    .select('id, status').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'that proposal was already reviewed' }, { status: 409 });
  return NextResponse.json({ ok: true, ...data });
}
