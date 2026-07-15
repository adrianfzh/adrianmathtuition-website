// Kiosk print gate + log. The client calls this immediately before
// window.print(); a 403 means the student hit the daily cap and the print
// button stays disabled. Counting is per SGT calendar day.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { studentFromRequest } from '@/lib/kiosk-student';

export const runtime = 'nodejs';

const DAILY_PRINT_CAP = 4;

// Start of today in SGT (UTC+8, no DST) as an ISO instant.
function sgtDayStartISO(): string {
  const nowSgt = new Date(Date.now() + 8 * 3600_000);
  const dayStartSgt = Date.UTC(nowSgt.getUTCFullYear(), nowSgt.getUTCMonth(), nowSgt.getUTCDate());
  return new Date(dayStartSgt - 8 * 3600_000).toISOString();
}

export async function POST(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = verifyAdminAuth(req);
  const student = studentFromRequest(req);
  if (!student && !isAdmin) {
    return NextResponse.json({ error: 'Scan to start', studentRequired: true }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const supa = getSupabaseAdmin();

  // Admin test prints aren't capped or logged against a student.
  if (!student) return NextResponse.json({ ok: true, used: 0, remaining: DAILY_PRINT_CAP });

  const since = sgtDayStartISO();
  const { count, error: cErr } = await supa
    .from('kiosk_prints')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
    .gte('printed_at', since);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const used = count ?? 0;
  if (used >= DAILY_PRINT_CAP) {
    return NextResponse.json(
      { error: `Daily limit reached (${DAILY_PRINT_CAP} worksheets). Back tomorrow!`, capReached: true, used, remaining: 0 },
      { status: 403 },
    );
  }

  const { error } = await supa.from('kiosk_prints').insert({
    student_id: student.id,
    student_name: student.name,
    level: String(body.level || ''),
    topic: String(body.topic || ''),
    tier: body.tier ? String(body.tier) : null,
    count: Number(body.count) || 0,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, used: used + 1, remaining: DAILY_PRINT_CAP - used - 1 });
}

// GET → current usage (for the "2/4 today" indicator on the kiosk).
export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const student = studentFromRequest(req);
  if (!student) return NextResponse.json({ used: 0, remaining: DAILY_PRINT_CAP });

  const { count, error } = await getSupabaseAdmin()
    .from('kiosk_prints')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
    .gte('printed_at', sgtDayStartISO());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const used = count ?? 0;
  return NextResponse.json({ used, remaining: Math.max(0, DAILY_PRINT_CAP - used) });
}
