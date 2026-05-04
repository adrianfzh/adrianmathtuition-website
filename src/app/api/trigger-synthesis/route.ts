import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Called by Vercel cron every 2 days — triggers synthesis on the bot
export async function GET(req: NextRequest) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const botUrl    = process.env.BOT_BASE_URL;
  const botSecret = process.env.BOT_INTERNAL_SECRET;
  if (!botUrl || !botSecret) {
    return NextResponse.json({ error: 'BOT_BASE_URL or BOT_INTERNAL_SECRET not configured' }, { status: 500 });
  }

  try {
    const r = await fetch(`${botUrl}/api/synthesise`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
    });
    const data = await r.json().catch(() => ({}));
    console.log('[trigger-synthesis] bot responded:', r.status, data);
    return NextResponse.json({ ok: r.ok, status: r.status, data });
  } catch (err: any) {
    console.error('[trigger-synthesis] fetch failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
