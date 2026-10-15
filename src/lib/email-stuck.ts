// ─── Emails that never arrived and never bounced (15 Oct 2026) ──────────────────
//
// Adrian: "will any undelivered emails be brought to my attention automatically?"
// A bounce or a spam report already pings Telegram (/api/resend-webhook). The gap
// is the email the receiving provider keeps deferring: it never bounces, never
// arrives, and its EmailLog row just sits at `sent` / `delayed`. The daily
// /api/cron/email-stuck picks those out with this rule and alerts once.
//
// Pure: EmailLog rows + the clock → the rows to alert on.
// The window is 24–48 hours old, so a daily run sees each email exactly once.

export type EmailLogRow = {
  id: string;
  sentAt: string;          // ISO
  status: string;          // EmailLog Status
  resendId: string;
  to: string;
  subject: string;
};

/** Statuses that mean "left us, not yet confirmed at the other end". */
export const UNCONFIRMED_STATUSES = ['sent', 'delayed'] as const;

export const STUCK_AFTER_HOURS = 24;
export const STUCK_WINDOW_HOURS = 24;

export function stuckEmails(rows: EmailLogRow[], nowMs: number): EmailLogRow[] {
  const newest = nowMs - STUCK_AFTER_HOURS * 3600_000;
  const oldest = newest - STUCK_WINDOW_HOURS * 3600_000;
  return rows.filter(r => {
    if (!r.resendId) return false; // never reached Resend — the send itself reported it
    if (!(UNCONFIRMED_STATUSES as readonly string[]).includes(r.status)) return false;
    const t = Date.parse(r.sentAt);
    return Number.isFinite(t) && t > oldest && t <= newest;
  });
}

export function stuckAlertText(rows: { to: string; subject: string; event: string }[]): string {
  const lines = rows.map(r => `• ${r.to} — ${r.subject} (${r.event === 'delayed' || r.event === 'delivery_delayed' ? 'still being retried' : 'no delivery confirmation'})`);
  return `⚠️ <b>${rows.length} email${rows.length === 1 ? '' : 's'} not delivered after a day</b>\n` +
    `No bounce, but no "delivered" either:\n${lines.join('\n')}\n\n` +
    `Check the address, or resend from the Email Log.`;
}
