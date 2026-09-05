// POST /api/resend-webhook
// Receives Resend delivery events (sent/delivered/bounced/complained/delayed),
// updates the matching EmailLog row's Status by Resend ID, and pings Telegram
// when an email is NOT delivered (bounced/complained) — so a parent-facing
// non-delivery is never silent.
//
// SETUP: in the Resend dashboard → Webhooks, add this URL
//   https://www.adrianmathtuition.com/api/resend-webhook
// subscribe to ALL FIVE of email.sent / email.delivered / email.bounced /
// email.complained / email.delivery_delayed, and put the signing secret in
// RESEND_WEBHOOK_SECRET.
//
// ⚠ The endpoint existing is not the same as it working. From 3 Jun to 1 Sep 2026
// this webhook was live, enabled, pointed at the right URL — and subscribed to
// `email.delivery_delayed` ALONE. 279 EmailLog rows, not one ever left `sent`.
// Nothing was broken enough to notice; the answer to "did the parent get it?"
// simply never arrived. If you touch this route, re-check the SUBSCRIPTION too:
//   GET https://api.resend.com/webhooks   (needs a Full-access Resend key)
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
// Every notification from this file belongs in the money topic (6 Sept 2026; falls back to the DM when unbound).
const notify_money = (text: string) => sendTelegram(text, 'money');
import { STATUS_BY_EVENT, statusPatchBody } from '@/lib/email-status';

export const runtime = 'nodejs';

// Verify Svix signature (Resend uses Svix). Returns true if no secret is set
// (so events still flow before the secret is configured) — but we only ever act
// on events whose email_id matches a row we actually sent, so spoofing is inert.
function verifySvix(headers: Headers, payload: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true;
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64');
    const expBuf = Buffer.from(expected);
    return sigHeader.split(' ').some(part => {
      const sig = part.split(',')[1];
      if (!sig) return false;
      const sBuf = Buffer.from(sig);
      return sBuf.length === expBuf.length && crypto.timingSafeEqual(sBuf, expBuf);
    });
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!verifySvix(req.headers, payload)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(payload); } catch { return NextResponse.json({ ok: true }); }

  const type: string = event?.type || '';
  const emailId: string = event?.data?.email_id || '';
  if (!type || !emailId) return NextResponse.json({ ok: true });

  // Find the EmailLog row we created for this Resend email.
  let log: any = null;
  try {
    const logs = await airtableRequestAll(
      'EmailLog',
      `?filterByFormula=${encodeURIComponent(`{Resend ID}='${emailId}'`)}&fields[]=To Email&fields[]=Subject&fields[]=Status`,
    );
    log = logs.records?.[0] || null;
  } catch (e: any) {
    console.error('[resend-webhook] EmailLog lookup failed:', e?.message);
  }

  const newStatus = STATUS_BY_EVENT[type];
  if (log && newStatus) {
    await airtableRequest('EmailLog', `/${log.id}`, {
      method: 'PATCH',
      body: JSON.stringify(statusPatchBody(newStatus)),
    }).catch((e: any) => console.error('[resend-webhook] status patch failed:', e?.message));
  }

  // Alert on genuine non-delivery.
  if (type === 'email.bounced' || type === 'email.complained') {
    const to = event?.data?.to?.[0] || log?.fields?.['To Email'] || '(unknown)';
    const subj = log?.fields?.['Subject'] || event?.data?.subject || '(no subject)';
    const reason = event?.data?.bounce?.message
      || event?.data?.bounce?.subType
      || (type === 'email.complained' ? 'marked as spam' : 'bounced');
    await notify_money(
      `⚠️ <b>Email NOT delivered</b>\n` +
      `${type.replace('email.', '').toUpperCase()}: ${subj}\n` +
      `To: ${to}\nReason: ${reason}\n\n` +
      `Verify the address / clear the suppression in Resend, then resend from the Email Log.`,
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
