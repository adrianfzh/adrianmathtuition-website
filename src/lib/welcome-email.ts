// Welcome email sent to the parent right after a successful signup.
// Content mirrors the website FAQ (no material fees, WhatsApp questions,
// replacement lessons) and the invoice flow (PayNow 9139 7985, invoices
// emailed mid-month). Non-fatal by design — signup never fails on email.

const WHATSAPP = '9139 7985';
const WA_LINK = 'https://wa.me/6591397985';

export interface WelcomeEmailData {
  parentName: string;
  parentEmail: string;
  studentName: string;
  slotLabel: string;   // e.g. "Sunday 11am-1pm"
  startDate: string;   // YYYY-MM-DD
}

function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildWelcomeEmailHtml(d: WelcomeEmailData): { subject: string; html: string } {
  const studentFirst = d.studentName.trim().split(/\s+/)[0];
  const parentFirst = d.parentName.trim().split(/\s+/)[0];
  const subject = `Welcome to Adrian's Math Tuition, ${studentFirst}! 🎉`;

  const section = (title: string, body: string) => `
    <tr><td style="padding:0 32px 22px">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#b48a2c">${title}</p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#33415c">${body}</p>
    </td></tr>`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f6f4ee;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ee;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(30,42,73,0.08)">
        <tr><td style="background:#1e3a5f;padding:28px 32px">
          <p style="margin:0;font-size:20px;font-weight:800;color:#fdf6e3;letter-spacing:0.02em">ADRIAN'S <span style="font-weight:400;opacity:0.85">math tuition</span></p>
        </td></tr>
        <tr><td style="padding:30px 32px 22px">
          <p style="margin:0 0 12px;font-size:22px;font-weight:700;color:#1e3a5f">Welcome aboard, ${studentFirst}! 🎉</p>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#33415c">
            Hi ${parentFirst}, thank you for enrolling <strong>${d.studentName}</strong> — I'm really looking forward to working together.
            Here's everything you need to know to get started.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 22px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6e3;border:1px solid #f0e2bb;border-radius:10px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 2px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#b48a2c">First lesson</p>
              <p style="margin:0;font-size:17px;font-weight:700;color:#1e3a5f">${formatDateLong(d.startDate)}</p>
              <p style="margin:2px 0 0;font-size:14px;color:#33415c">Weekly slot: ${d.slotLabel}</p>
            </td></tr>
          </table>
        </td></tr>
        ${section('What to bring', `Just writing materials and a calculator — all worksheets and learning materials are provided, with <strong>no material fees</strong>.`)}
        ${section('Questions between lessons', `${studentFirst} is welcome (and encouraged!) to WhatsApp me questions anytime — stuck on homework, confused by something from school, anything. <a href="${WA_LINK}" style="color:#1e3a5f;font-weight:600">Message me at ${WHATSAPP}</a>.`)}
        ${section('If a lesson is missed', `No worries — we'll arrange a replacement lesson at any other available time slot. Just drop me a WhatsApp message.`)}
        ${section('Payment', `Invoices are emailed monthly (around the middle of the month) and payable by <strong>PayNow to ${WHATSAPP.replace(/ /g, '')}</strong>. Your first invoice will arrive separately.`)}
        <tr><td style="padding:6px 32px 30px">
          <p style="margin:0;font-size:15px;line-height:1.65;color:#33415c">
            If there's anything at all — exam dates, topics ${studentFirst} is struggling with, schedule questions — just WhatsApp me.
            See you in class!<br/><br/>
            <strong style="color:#1e3a5f">Adrian</strong><br/>
            <span style="font-size:13.5px;color:#8a94a6">Adrian's Math Tuition · ${WHATSAPP} · adrianmathtuition.com</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

/** Send the welcome email via Resend; log to EmailLog. Never throws. */
export async function sendWelcomeEmail(d: WelcomeEmailData): Promise<{ sent: boolean; error?: string }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !d.parentEmail) return { sent: false, error: 'no api key or recipient' };
    const { subject, html } = buildWelcomeEmailHtml(d);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: "Adrian's Math Tuition <hello@adrianmathtuition.com>",
        to: d.parentEmail,
        subject,
        html,
      }),
    });
    if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = await res.json() as { id?: string };

    // Log to EmailLog (non-fatal; typecast creates the 'welcome' Type option)
    try {
      const { airtableRequest } = await import('@/lib/airtable');
      await airtableRequest('EmailLog', '', {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            'Email ID': `welcome-${Date.now()}`,
            'Sent At': new Date().toISOString(),
            'Type': 'welcome',
            'To Email': d.parentEmail,
            'Subject': subject,
            'Body HTML': html,
            'Status': 'sent',
            ...(data.id ? { 'Resend ID': data.id } : {}),
          },
          typecast: true,
        }),
      });
    } catch (logErr) {
      console.error('[welcome-email] EmailLog write failed (non-fatal):', (logErr as Error).message);
    }

    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
