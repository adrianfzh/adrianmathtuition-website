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
import { worksheetAudienceFor } from '@/lib/worksheet-audience';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
    return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
  }

  const level = new URL(req.url).searchParams.get('level') || '';
  const cfg = KIOSK_LEVELS[level];
  if (!cfg) return NextResponse.json({ error: 'unknown kiosk level' }, { status: 400 });

  // Hard-lock: students only see their own level's topics (admin bypasses).
  const student = studentFromRequest(req);
  if (!verifyAdminAuth(req)) {
    if (!student) return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
    if (!student.entitlements.practice.includes(level)) {
      return NextResponse.json({ error: 'Not your level', forbidden: true }, { status: 403 });
    }
  }

  const supa = getSupabaseAdmin();
  // Sub-group AUDIENCE (2026-09-02): a topic exists for an audience only while
  // it has a visible sub-group, so the picker must be drawn for the PAIRED
  // student — or an IP student never sees Modulus Functions to pick, whatever
  // /api/kiosk/worksheet would serve. Same resolution as the worksheet route
  // (lib/worksheet-audience.ts); unpaired admin preview stays ordinary.
  const audience = await worksheetAudienceFor(supa, { studentId: student?.id });
  const { data, error } = await supa.rpc('practice_topics', {
    p_level: cfg.topicsKey,
    p_is_ip: audience.isIp,
    p_admin: audience.admin,
  });
  if (error) return NextResponse.json({ error: error.message, topics: [] }, { status: 500 });

  // RPC returns { topic, n } — normalise to { topic, count }.
  const topics = (data || []).map((r: { topic: string; n: number }) => ({ topic: r.topic, count: Number(r.n) }));
  return NextResponse.json({ topics, level });
}
