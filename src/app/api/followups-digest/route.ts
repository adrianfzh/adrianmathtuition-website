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
    const buttons: { text: string; url?: string; callback_data?: string }[][] = actionable.slice(0, 12).map((f, i) => ([
      { text: `✓ Done ${i + 1}`, callback_data: `fu_done:${f.id}` },
      { text: `⏰ +3d ${i + 1}`, callback_data: `fu_snz:${f.id}` },
    ]));

    // ── Waitlist awareness — waiting prospects don't get forgotten. The bot's
    // 9am cron already alerts when a preferred slot OPENS (with a crafted
    // message); this section is the standing daily reminder, with a 💬 button
    // carrying a gentle check-in the parent can be sent as-is.
    try {
      const [wl, slotsData] = await Promise.all([
        airtableRequestAll('Waitlist', `?filterByFormula=${encodeURIComponent(`{Status}='Waiting'`)}&fields[]=Student Name&fields[]=Contact&fields[]=Parent Contact&fields[]=Preferred Slot&fields[]=Level&fields[]=Added Date`),
        airtableRequestAll('Slots', `?fields[]=Day&fields[]=Time`),
      ]);
      const slotById: Record<string, string> = Object.fromEntries((slotsData.records || []).map((r: any) =>
        [r.id, `${String(r.fields['Day'] || '').replace(/^\d+\s+/, '')} ${r.fields['Time'] || ''}`.trim()]));
      const waiting = (wl.records || []);
      if (waiting.length) {
        const wlLines = waiting.map((r: any) => {
          const f = r.fields;
          const slot = f['Preferred Slot']?.[0] ? (slotById[f['Preferred Slot'][0]] || '') : '';
          const days = f['Added Date'] ? Math.max(0, Math.floor((Date.now() - new Date(f['Added Date']).getTime()) / 86400000)) : null;
          return `· <b>${esc(f['Student Name'] || '?')}</b>${f['Level'] ? ` (${f['Level']})` : ''}${slot ? ` — wants ${esc(slot)}` : ''}${days !== null ? ` · waiting ${days}d` : ''}`;
        });
        parts.splice(parts.length - 1, 0, `\n⏳ <b>Waitlist (${waiting.length}):</b>\n${wlLines.join('\n')}`);
        for (const r of waiting.slice(0, 6)) {
          const f = r.fields;
          const contact = String(f['Parent Contact'] || f['Contact'] || '').replace(/\D/g, '');
          if (!contact) continue;
          const phone = contact.length === 8 ? `65${contact}` : contact;
          const slot = f['Preferred Slot']?.[0] ? (slotById[f['Preferred Slot'][0]] || 'a suitable slot') : 'a suitable slot';
          const msg = encodeURIComponent(`Hi! Just an update from Adrian's Math Tuition — ${f['Student Name'] || 'your child'} is still on our waitlist for ${slot}. I'll message you the moment a space opens up. Thanks for your patience!`);
          buttons.push([{ text: `💬 Check in — ${String(f['Student Name'] || '?').slice(0, 20)}`, url: `https://wa.me/${phone}?text=${msg}` }]);
        }
      }
    } catch { /* waitlist section is best-effort */ }

    await sendTelegramWithButtons(parts.join('\n'), buttons);
    return NextResponse.json({ ok: true, sent: true, open: open.length, overdue: overdue.length, dueToday: dueToday.length, later: later.length });
  } catch (e) {
    // Table not created yet → quiet no-op so the cron doesn't error daily.
    if (e instanceof Error && /NOT_FOUND|TABLE_NOT_FOUND|404/i.test(e.message)) return NextResponse.json({ ok: true, sent: false, tableMissing: true });
    console.error('[followups-digest] failed:', e);
    return NextResponse.json({ error: 'digest failed' }, { status: 500 });
  }
}
