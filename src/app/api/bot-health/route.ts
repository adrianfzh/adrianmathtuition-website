import { NextResponse } from 'next/server';

// Called every 5 minutes by Vercel cron (see vercel.json).
// Pings the bot's /health endpoint and sends a Telegram alert to Adrian if it's down.

const BOT_HEALTH_URL = 'https://adrianmath-telegram-math-bot.fly.dev/health';
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // only alert once per 15 min to avoid spam

// In-memory dedup (resets on cold start — acceptable, since Vercel cron keeps this warm)
let lastAlertAt = 0;

async function sendTelegramAlert(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}

export async function GET() {
  try {
    const resp = await fetch(BOT_HEALTH_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const now = Date.now();
      if (now - lastAlertAt > ALERT_COOLDOWN_MS) {
        lastAlertAt = now;
        await sendTelegramAlert(
          `⚠️ Bot unhealthy! /health returned ${resp.status}\npolling: ${body.polling}, lastPing: ${Math.round((body.lastPingMs || 0) / 1000)}s ago\n\nRun: fly machine start`
        );
      }
      return NextResponse.json({ status: 'alert_sent', httpStatus: resp.status });
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const now = Date.now();
    if (now - lastAlertAt > ALERT_COOLDOWN_MS) {
      lastAlertAt = now;
      await sendTelegramAlert(
        `🚨 Bot is DOWN — cannot reach /health\nError: ${message}\n\nRun: fly machine start`
      );
    }
    return NextResponse.json({ status: 'alert_sent', error: message });
  }
}
