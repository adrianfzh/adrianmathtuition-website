import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const validCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const validAdmin = !!(adminPassword && authHeader === `Bearer ${adminPassword}`);
  return isVercelCron || validCron || validAdmin;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await sendTelegram(
    `💰 <b>Payment Reminder</b>\n\n` +
      `Remember to check payments received and update Airtable before ` +
      `invoices generate tomorrow at 7am.\n\n` +
      `Go to Airtable → Invoices → tick Is Paid for received payments.`
  );
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
