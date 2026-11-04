import { NextResponse } from 'next/server';
import { raiseAlert, clearAlert } from '@/lib/alert-notices';

// Called every 5 minutes by Vercel cron (see vercel.json).
// Pings the bot's /health endpoint and sends a Telegram alert to Adrian if it's down.
//
// 🧹 4 Nov 2026 (Adrian: "if it's okay, why not just delete the message?" → "Yes, as a rule"):
// every ⚠️/🚨 line is kept under the key 'bot-health' (src/lib/alert-notices.ts) and DELETED on the
// next run that finds the bot healthy; a "✅ … again" line only when one is too old to delete.
// The 15-minute repeat gap is read from that table (it was in memory, lost on every cold start).

const BOT_HEALTH_URL = 'https://adrianmath-telegram-math-bot.fly.dev/health';
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // only alert once per 15 min to avoid spam
const KEY = 'bot-health';

const alert = (text: string) => raiseAlert(KEY, undefined, text, { repeatEveryMs: ALERT_COOLDOWN_MS, plain: true });

export async function GET() {
  try {
    const resp = await fetch(BOT_HEALTH_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const sent = await alert(
        `⚠️ Bot unhealthy! /health returned ${resp.status}\npolling: ${body.polling}, lastPing: ${Math.round((body.lastPingMs || 0) / 1000)}s ago\n\nRun: fly machine start`
      );
      return NextResponse.json({ status: sent ? 'alert_sent' : 'alert_open', httpStatus: resp.status });
    }

    const cleared = await clearAlert(KEY, '✅ The bot is healthy again.');
    return NextResponse.json({ status: 'ok', ...(cleared && cleared.open ? { cleared } : {}) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const sent = await alert(
      `🚨 Bot is DOWN — cannot reach /health\nError: ${message}\n\nRun: fly machine start`
    );
    return NextResponse.json({ status: sent ? 'alert_sent' : 'alert_open', error: message });
  }
}
