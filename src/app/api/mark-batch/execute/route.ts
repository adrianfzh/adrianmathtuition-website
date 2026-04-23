import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  return req.headers.get('authorization') === `Bearer ${pw}`;
}

// ── POST — fire execute-batch on Fly worker (fire-and-forget) ────────────────
//
// Stays well within Vercel's 60 s limit: just verify the batch exists in Supabase
// and hand off to the Fly worker which has no timeout.

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { batchId: string; studentLevel?: 'JC' | 'SECONDARY' | 'unknown' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { batchId, studentLevel = 'unknown' } = body;
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  // Verify batch exists in Supabase and is in a markable state
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('marking_batches')
    .select('status')
    .eq('id', batchId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  if (data.status === 'marking') {
    return NextResponse.json({ error: 'Batch is already being marked' }, { status: 409 });
  }
  if (data.status === 'marked' || data.status === 'finalized') {
    return NextResponse.json({ error: 'Batch has already been marked' }, { status: 409 });
  }

  // Fire Fly worker (await 202 to confirm accepted; marking is async on Fly side)
  const flyUrl = process.env.FLY_WORKER_URL || 'https://adrianmath-telegram-math-bot.fly.dev';
  const flySecret = process.env.FLY_WORKER_SECRET || '';

  let flyRes: Response;
  try {
    flyRes = await fetch(`${flyUrl}/internal/execute-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': flySecret },
      body: JSON.stringify({ batchId, studentLevel }),
    });
  } catch (err) {
    console.error('[execute] Failed to reach Fly worker:', err);
    return NextResponse.json({ error: 'Processing worker unavailable' }, { status: 503 });
  }

  if (!flyRes.ok) {
    const errText = await flyRes.text().catch(() => '');
    console.error(`[execute] Fly worker rejected: ${flyRes.status} ${errText}`);
    return NextResponse.json({ error: 'Processing worker rejected the request' }, { status: 502 });
  }

  // 202 — marking has been accepted by Fly, poll /get for status='marked'
  return NextResponse.json({ batchId, status: 'marking', message: 'Marking started — poll /api/mark-batch/get for status' }, { status: 202 });
}
