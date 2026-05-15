// GET /api/june-revision-followup
// One-time cron: runs 25 May 2026 at 9am SGT (1am UTC).
// Queries Airtable for S4 and JC2 students with June Revision 2026 = 'No Response'
// and sends a Telegram alert to Adrian to follow up.
// Remove after June 2026.

import { NextRequest, NextResponse } from 'next/server';
import { airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  return isVercelCron ||
    !!(cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    !!(adminPassword && authHeader === `Bearer ${adminPassword}`);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch S4 + JC2 students who haven't responded
  const formula = encodeURIComponent(
    `AND({Status}='Active',OR({Level}='Sec4',{Level}='JC2',{Level}='Sec 4',{Level}='JC 2'),OR({June Revision 2026}='No Response',{June Revision 2026}=''))`
  );
  const students = await airtableRequestAll('Students',
    `?filterByFormula=${formula}&fields[]=Student Name&fields[]=Level&fields[]=Parent Name&fields[]=Parent Contact&fields[]=June Revision 2026`
  );

  if (!students.records.length) {
    await sendTelegram(`✅ June Revision Sprint — all S4 and JC2 students have responded. No follow-up needed.`);
    return NextResponse.json({ count: 0 });
  }

  const sec4 = students.records.filter(r => {
    const lvl = (r.fields['Level'] || '').replace(/\s+/g, '').toUpperCase();
    return lvl === 'SEC4' || lvl === 'S4';
  });
  const jc2 = students.records.filter(r => {
    const lvl = (r.fields['Level'] || '').replace(/\s+/g, '').toUpperCase();
    return lvl === 'JC2' || lvl === 'J2';
  });

  const fmt = (r: any) => {
    const name = r.fields['Student Name'] || '?';
    const parent = r.fields['Parent Name'] || '';
    const contact = r.fields['Parent Contact'] || '';
    return `• ${name}${parent ? ` · Parent: ${parent}` : ''}${contact ? ` ${contact}` : ''}`;
  };

  let msg = `🔔 <b>June Revision Sprint — pending sign-ups</b>\n`;
  msg += `Students who haven't responded yet (please follow up by 28 May — lessons start 1 June):\n\n`;

  if (sec4.length) {
    msg += `<b>Sec 4 students:</b>\n${sec4.map(fmt).join('\n')}\n\n`;
  }
  if (jc2.length) {
    msg += `<b>JC2 students:</b>\n${jc2.map(fmt).join('\n')}\n\n`;
  }

  msg += `Total: ${students.records.length} student${students.records.length !== 1 ? 's' : ''} yet to respond.`;

  await sendTelegram(msg);
  return NextResponse.json({ sent: true, count: students.records.length, sec4: sec4.length, jc2: jc2.length });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
