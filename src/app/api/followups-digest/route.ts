import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { sendTelegramWithButtons } from '@/lib/telegram';
import { verifyAdminAuth, localToday } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';

// Daily 8am SGT Telegram digest of open parent follow-ups (cron in vercel.json).
// Lists overdue + due-today prominently, then the upcoming/undated tail. Sends
// nothing when there are no open follow-ups (quiet by default).

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return verifyAdminAuth(req);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [fuData, stuData] = await Promise.all([
      airtableRequestAll('Follow-ups', `?filterByFormula=${encodeURIComponent('NOT({Done})')}&fields[]=Note&fields[]=Student&fields[]=Due`),
      airtableRequestAll('Students', `?fields[]=Student Name`),
    ]);
    const nameById: Record<string, string> = Object.fromEntries((stuData.records || []).map((r: any) => [r.id, r.fields['Student Name'] || '?']));
    const open = (fuData.records || []).map((r: any) => ({
      id: r.id as string,
      note: (r.fields['Note'] || '') as string,
      due: (r.fields['Due'] as string) || null,
      student: r.fields['Student']?.[0] ? (nameById[r.fields['Student'][0]] || '?') : null,
    }));
    if (!open.length) return NextResponse.json({ ok: true, sent: false, open: 0 });

    const today = localToday();
    const overdue = open.filter(f => f.due && f.due < today);
    const dueToday = open.filter(f => f.due === today);
    const rest = open.filter(f => !f.due || f.due > today)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const ordered = [...overdue, ...dueToday, ...rest]; // numbering matches message order

    const line = (f: typeof open[number], n: number) =>
      `${n}. ${f.student ? `<b>${esc(f.student)}</b> — ` : ''}${esc(f.note)}${f.due ? ` <i>(due ${f.due})</i>` : ''}`;

    let n = 0;
    const parts: string[] = [`📌 <b>Parent follow-ups</b> (${open.length} open)`];
    if (overdue.length) parts.push(`\n⚠️ <b>Overdue:</b>\n${overdue.map(f => line(f, ++n)).join('\n')}`);
    if (dueToday.length) parts.push(`\n📅 <b>Due today:</b>\n${dueToday.map(f => line(f, ++n)).join('\n')}`);
    if (rest.length) parts.push(`\n🗂 <b>Upcoming / no date:</b>\n${rest.map(f => line(f, ++n)).join('\n')}`);
    parts.push(`\nTap ✓ when you've done one — it drops out of tomorrow's digest.`);

    // One ✓ / ⏰ button row per item (numbered to match), handled by the bot's
    // fu_done / fu_snz callbacks. Cap at 12 rows to stay well inside Telegram limits.
    const buttons = ordered.slice(0, 12).map((f, i) => ([
      { text: `✓ Done ${i + 1}`, callback_data: `fu_done:${f.id}` },
      { text: `⏰ +3d ${i + 1}`, callback_data: `fu_snz:${f.id}` },
    ]));

    await sendTelegramWithButtons(parts.join('\n'), buttons);
    return NextResponse.json({ ok: true, sent: true, open: open.length, overdue: overdue.length, dueToday: dueToday.length });
  } catch (e) {
    // Table not created yet → quiet no-op so the cron doesn't error daily.
    if (e instanceof Error && /NOT_FOUND|TABLE_NOT_FOUND|404/i.test(e.message)) return NextResponse.json({ ok: true, sent: false, tableMissing: true });
    console.error('[followups-digest] failed:', e);
    return NextResponse.json({ error: 'digest failed' }, { status: 500 });
  }
}
