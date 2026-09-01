import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramWithButtons } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logJobRun } from '@/lib/job-log';
import { nudgeMessage, RIPE_DAYS } from '@/lib/question-proposals';

export const runtime = 'nodejs';

// Weekly nudge: questions the self-study sheets wrote are waiting to be vetted.
//
// WEEKLY, not daily, and SILENT when there is nothing ripe. The queue only fills
// when a sheet searches the bank and finds nothing — a handful of questions a
// month at most — so a daily "0 pending" would be pure noise, and a reminder that
// cries wolf gets muted, which is worse than no reminder. The rule is: say
// something only when there is something to say, and only once it has waited long
// enough that Adrian genuinely forgot rather than simply not got to it yet.
//
// Stamps job_runs either way (docs/OPS.md contract) — the ops board shows it ran,
// and JOB_RHYTHMS alarms if it stops. A quiet week and a dead cron look identical
// on Telegram; they do not on the board.

function checkAuth(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true;
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return verifyAdminAuth(req);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('authored_question_proposals')
      .select('id, level, topics, skill, student_name, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const msg = nudgeMessage(rows, Date.now());

    if (msg) {
      await sendTelegramWithButtons(msg, [[{
        text: '📥 Vet them',
        url: 'https://www.adrianmathtuition.com/admin/question-proposals',
      }]]);
    }
    await logJobRun('question-proposals-nudge', true,
      msg ? `${rows.length} pending, nudged` : `${rows.length} pending, nothing ripe (${RIPE_DAYS}d)`);

    return NextResponse.json({ ok: true, pending: rows.length, nudged: !!msg });
  } catch (e) {
    const message = (e as Error).message;
    await logJobRun('question-proposals-nudge', false, message).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
