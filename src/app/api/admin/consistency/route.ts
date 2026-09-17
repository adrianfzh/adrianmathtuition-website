// /api/admin/consistency — how far the marking has moved (17 Sep 2026).
//
//   GET ?all=1 → { papers: [...], rollups: [...], line, readings }
//
// Per paper in the consistency set: the latest SHADOW reading against the
// previous shadow (the week-on-week move, which is what the Monday line
// reports), and against the marking the student actually has (the standing gap
// — whether a released paper would still be marked the way it was).
//
// Reads only. The readings are written by the bot when a Mac slot hands a shadow
// back; the Sunday cron (/api/cron/consistency-remark) is what asks for them.
// Auth: admin session cookie or Bearer ADMIN_PASSWORD. Health check probes the 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { consistencyReport, weeklyRollups } from '@/lib/consistency-set';
import { consistencyLine } from '@/lib/shadow-diff';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const all = new URL(req.url).searchParams.get('all') === '1';
    const papers = await consistencyReport(!all);
    const rollups = weeklyRollups(papers);
    return NextResponse.json({
      papers,
      rollups,
      line: consistencyLine(rollups),
      readings: papers.reduce((s, p) => s + p.readings, 0),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
