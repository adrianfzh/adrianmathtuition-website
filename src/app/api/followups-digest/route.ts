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
    // Actionable = overdue, due today, or no date set — these nag daily with
    // buttons. Future-dated items are deferred (that's what ⏰ +3d means): shown
    // compactly for awareness, no buttons, until their date arrives.
    const overdue = open.filter(f => f.due && f.due < today);
    const dueToday = open.filter(f => f.due === today);
    const noDate = open.filter(f => !f.due);
    const later = open.filter(f => f.due && f.due > today)
      .sort((a, b) => a.due!.localeCompare(b.due!));
    const actionable = [...overdue, ...dueToday, ...noDate]; // numbering matches message order

    const line = (f: typeof open[number], n: number) =>
      `${n}. ${f.student ? `<b>${esc(f.student)}</b> — ` : ''}${esc(f.note)}${f.due ? ` <i>(due ${f.due})</i>` : ''}`;

    let n = 0;
    const parts: string[] = [`📌 <b>Parent follow-ups</b> (${open.length} open)`];
    if (overdue.length) parts.push(`\n⚠️ <b>Overdue:</b>\n${overdue.map(f => line(f, ++n)).join('\n')}`);
    if (dueToday.length) parts.push(`\n📅 <b>Due today:</b>\n${dueToday.map(f => line(f, ++n)).join('\n')}`);
    if (noDate.length) parts.push(`\n📍 <b>No date — until done:</b>\n${noDate.map(f => line(f, ++n)).join('\n')}`);
    if (later.length) parts.push(`\n🗂 <b>Later:</b>\n${later.map(f => `· ${f.student ? `<b>${esc(f.student)}</b> — ` : ''}${esc(f.note)} <i>(${f.due})</i>`).join('\n')}`);
    if (actionable.length) parts.push(`\nTap ✓ when done (Undo appears) · ⏰ pushes it 3 days out.`);

    // ✓ / ⏰ button rows only for actionable items, numbered to match the list.
    const buttons = actionable.slice(0, 12).map((f, i) => ([
      { text: `✓ Done ${i + 1}`, callback_data: `fu_done:${f.id}` },
      { text: `⏰ +3d ${i + 1}`, callback_data: `fu_snz:${f.id}` },
    ]));

    await sendTelegramWithButtons(parts.join('\n'), buttons);
    return NextResponse.json({ ok: true, sent: true, open: open.length, overdue: overdue.length, dueToday: dueToday.length, later: later.length });
  } catch (e) {
    // Table not created yet → quiet no-op so the cron doesn't error daily.
    if (e instanceof Error && /NOT_FOUND|TABLE_NOT_FOUND|404/i.test(e.message)) return NextResponse.json({ ok: true, sent: false, tableMissing: true });
    console.error('[followups-digest] failed:', e);
    return NextResponse.json({ error: 'digest failed' }, { status: 500 });
  }
}
