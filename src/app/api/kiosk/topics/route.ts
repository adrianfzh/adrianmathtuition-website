// GET /api/kiosk/topics?level=EM|AM|JC2
// Topics (with answerable-question counts) for the kiosk picker, via the
// practice_topics RPC (service role — the bank is anon-locked, so we serve it).
// Auth: valid kiosk device cookie OR admin. 401 otherwise.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { verifyKioskAuth, KIOSK_LEVELS } from '@/lib/kiosk-session';
import { studentFromRequest } from '@/lib/kiosk-student';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const level = new URL(req.url).searchParams.get('level') || '';
  const cfg = KIOSK_LEVELS[level];
  if (!cfg) return NextResponse.json({ error: 'level must be EM, AM or JC2' }, { status: 400 });

  // Hard-lock: students only see their own level's topics (admin bypasses).
  if (!verifyAdminAuth(req)) {
    const student = studentFromRequest(req);
    if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
    if (!student.entitlements.practice.includes(level)) {
      return NextResponse.json({ error: 'Not your level', forbidden: true }, { status: 403 });
    }
  }

  const { data, error } = await getSupabaseAdmin().rpc('practice_topics', { p_level: cfg.topicsKey });
  if (error) return NextResponse.json({ error: error.message, topics: [] }, { status: 500 });

  // RPC returns { topic, n } — normalise to { topic, count }.
  const topics = (data || []).map((r: { topic: string; n: number }) => ({ topic: r.topic, count: Number(r.n) }));
  return NextResponse.json({ topics, level });
}
