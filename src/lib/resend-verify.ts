// ─── "Resend accepted it" ≠ "it was delivered" ─────────────────────────────────
//
// Resend returns 200 + an email id even when it SUPPRESSES the send (the address
// is blocked because a prior email to it hard-bounced or was marked spam). The
// only way to tell is to read the email back and look at `last_event` — which is
// what every send path here does before it marks an invoice Sent.
//
// The trap this module exists to close: that read-back can itself stop working.
// A Resend API key whose permission is downgraded to "Sending access" answers
// 403 to every GET, and the old inline guard was written as `if (st.ok) { … }` —
// so a 403 fell straight through as "nothing wrong here" and the invoice was
// marked Sent unverified. The guard did not look broken; it looked like it had
// passed, which is the worst way for a safety net to fail.
//
// So the verdict has THREE states, not two. A check that could not run is not a
// check that passed, and a check that can NEVER run (401/403 — a config fault)
// is not the same as one that hit a slow night (timeout, 429, 5xx). Permanent
// faults alarm; transient ones stay quiet and leave it to the webhook.

/** `last_event` values that mean the mail will never arrive. */
export const NOT_DELIVERED_EVENTS = ['suppressed', 'failed', 'bounced'] as const;

export type DeliveryVerdict =
  /** Read back fine, and the event is not a non-delivery one. */
  | { kind: 'ok'; event: string }
  /** Read back fine, and the provider says it will never arrive. */
  | { kind: 'not-delivered'; event: string }
  /** The check could not run. `permanent` = a config fault that will never fix itself. */
  | { kind: 'unavailable'; reason: string; permanent: boolean };

/**
 * Pure: HTTP status + parsed body → verdict. Kept separate from the fetch so the
 * 403-falls-through-as-pass case is a unit test rather than a production incident.
 */
export function classifyDeliveryCheck(status: number, body: unknown): DeliveryVerdict {
  if (status === 401 || status === 403) {
    // Resend's restricted ("Sending access") keys answer 403 code 1010 to every
    // read. Nothing retries its way out of this — the key needs Full access.
    return {
      kind: 'unavailable',
      permanent: true,
      reason: `Resend key cannot read email status (HTTP ${status}) — give it Full access in the Resend dashboard`,
    };
  }
  if (status === 404) {
    // Sent-but-not-queryable-yet, or aged out of Resend's retention. Not a fault.
    return { kind: 'unavailable', permanent: false, reason: 'email id not found (HTTP 404)' };
  }
  if (status < 200 || status >= 300) {
    return { kind: 'unavailable', permanent: false, reason: `HTTP ${status}` };
  }
  const event = String((body as { last_event?: unknown } | null)?.last_event ?? '');
  if (!event) return { kind: 'unavailable', permanent: false, reason: 'no last_event in response' };
  return (NOT_DELIVERED_EVENTS as readonly string[]).includes(event)
    ? { kind: 'not-delivered', event }
    : { kind: 'ok', event };
}

/**
 * Read an email back from Resend and classify it. Never throws — a monitoring
 * failure must not be able to fail a send that has already left.
 */
export async function checkDelivery(
  resendId: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<DeliveryVerdict> {
  if (!resendId) return { kind: 'unavailable', permanent: false, reason: 'no Resend id' };
  try {
    const res = await fetch(`https://api.resend.com/emails/${resendId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => null);
    return classifyDeliveryCheck(res.status, body);
  } catch (e) {
    return { kind: 'unavailable', permanent: false, reason: (e as Error).message.slice(0, 120) };
  }
}

/**
 * Telegram Adrian when delivery verification has gone blind. Only ever called for
 * `permanent: true` — a slow night is not worth a message, but a guard that has
 * silently stopped guarding is, because the alternative is finding out months
 * later that every invoice since was marked Sent on nothing but Resend's 200.
 *
 * Best-effort and non-fatal by construction: the send already happened.
 */
export async function alertVerificationBlind(where: string, reason: string, count = 1): Promise<void> {
  try {
    const { sendTelegram } = await import('./telegram');
    await sendTelegram(
      `⚠️ <b>Email delivery verification is OFF</b>\n` +
      `${where}: ${reason}\n\n` +
      `${count === 1 ? 'That email was' : `${count} emails were`} sent UNVERIFIED — Resend's 200 is ` +
      `all we have, so a suppressed or blocked address would look identical to a delivered one.`,
      'money', // invoice/receipt email delivery → the Money topic (6 Sept 2026)
    );
  } catch { /* the alarm is best-effort; never fail a completed send on it */ }
}
