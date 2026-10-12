// /trial/done — where Stripe sends a parent after paying the trial fee (12 Oct 2026,
// SPEC-TRIAL-BOOKING.md). The booking itself happens on the webhook, not here.
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Payment received</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 28rem; margin: 18vh auto; padding: 0 1.25rem; color: #111827; line-height: 1.5;">
<h1 style="font-size: 1.3rem; margin: 0 0 0.75rem;">Payment received ✅</h1>
<p style="margin: 0 0 0.6rem; color: #374151;">Thank you. The trial lesson is being booked now.</p>
<p style="margin: 0; color: #374151;">The confirmation will arrive on WhatsApp in a minute. You can close this page.</p>
</body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
}
