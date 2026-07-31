import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { airtableRequest } from '@/lib/airtable';
import { isOurBlobUrl } from '@/lib/blob-url';

// Email a marked PDF to a student — the "no amendments needed" fast path on
// /admin/mark-paper. WhatsApp sending is deliberately NOT here: Adrian sends those
// himself from his personal number on the Mac (the business number's 24h window makes
// bot-sent WhatsApp unreliable), which is what the sibling download route serves.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET ?studentId=recXXX → the addresses on file, for prefilling the send form.
// Single-record GET ignores fields[] (CLAUDE.md gotcha) — fetch all, pick in JS.
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('studentId') || '';
  if (!/^rec[a-zA-Z0-9]{14}$/.test(id)) return NextResponse.json({ error: 'bad studentId' }, { status: 400 });
  try {
    const r = await airtableRequest('Students', `/${id}`);
    const f = (r as { fields?: Record<string, unknown> }).fields || {};
    return NextResponse.json({
      name: (f['Student Name'] as string) || '',
      studentEmail: (f['Student Email'] as string) || '',
      parentEmail: (f['Parent Email'] as string) || '',
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PUT — save the typed address the moment it's entered, without sending anything
// (Adrian, 1 Aug 2026: "can it be saved automatically? before sending?"). Same
// typecast PATCH and the same graceful degrade as the post-send save.
export async function PUT(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { studentId?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = (body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  if (!body.studentId || !/^rec[a-zA-Z0-9]{14}$/.test(body.studentId)) return NextResponse.json({ error: 'bad studentId' }, { status: 400 });
  try {
    await airtableRequest('Students', `/${body.studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Student Email': email }, typecast: true }),
    });
    return NextResponse.json({ saved: true });
  } catch (e) {
    const hint = (e as Error).message?.includes('UNKNOWN_FIELD_NAME')
      ? "Add a 'Student Email' field (type: email) to the Students table in Airtable."
      : (e as Error).message;
    return NextResponse.json({ saved: false, hint });
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'Resend not configured' }, { status: 503 });

  let body: { pdfUrl?: string; filename?: string; to?: string; studentId?: string; saveEmail?: boolean; paperLabel?: string; score?: string; studentName?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const to = (body.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  if (!body.pdfUrl || !isOurBlobUrl(body.pdfUrl)) return NextResponse.json({ error: 'Bad PDF URL' }, { status: 400 });

  // Fetch the PDF to attach. Resend's total-message cap is 40MB; leave headroom.
  const pdfRes = await fetch(body.pdfUrl);
  if (!pdfRes.ok) return NextResponse.json({ error: `PDF fetch failed (${pdfRes.status})` }, { status: 502 });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  if (pdfBuf.length > 35 * 1024 * 1024) return NextResponse.json({ error: 'PDF too large to email (>35MB) — use Download and send it manually' }, { status: 413 });

  const label = (body.paperLabel || 'your paper').slice(0, 120);
  const score = (body.score || '').slice(0, 20);
  const firstName = (body.studentName || '').trim().split(/\s+/)[0] || 'there';
  const filename = (body.filename || 'marked-paper.pdf').replace(/[^\w.\- ()]/g, '').slice(0, 120) || 'marked-paper.pdf';

  const emailData = {
    // Same verified domain as invoices; a marking-specific local part so student inboxes
    // don't thread marked papers under invoice mail.
    from: "Adrian's Math Tuition <marking@adrianmathtuition.com>",
    reply_to: 'adrianmathtuition@gmail.com',
    to,
    subject: `Marked paper — ${label}${score ? ` (${score})` : ''}`,
    html:
      `<p>Hi ${firstName},</p>` +
      `<p>Attached is your marked paper: <b>${label}</b>${score ? ` — <b>${score}</b>` : ''}.</p>` +
      `<p>Go through the red-pen comments and the worked solutions for anything you dropped marks on, and bring questions to your next lesson.</p>` +
      `<p>Adrian<br/>Adrian's Math Tuition</p>`,
    attachments: [{ filename, content: pdfBuf.toString('base64'), type: 'application/pdf', disposition: 'attachment' }],
  };

  try {
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData),
    });
    if (!sendRes.ok) throw new Error('Resend send failed: ' + (await sendRes.text()).slice(0, 300));
    const resendId = ((await sendRes.json().catch(() => ({}))) as { id?: string }).id || '';

    // Resend returns 200 + an id even when the address is SUPPRESSED — the mail is never
    // delivered. Same guard as send-invoices; "Resend accepted it" ≠ "delivered".
    if (resendId) {
      try {
        const st = await fetch(`https://api.resend.com/emails/${resendId}`, { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } });
        if (st.ok) {
          const ev = ((await st.json()) as { last_event?: string }).last_event;
          if (ev === 'suppressed' || ev === 'failed' || ev === 'bounced') {
            throw new Error(`NOT DELIVERED (${ev}) — the address is blocked by the email provider. Check it, or clear the suppression in Resend, then resend.`);
          }
        }
      } catch (e) {
        if ((e as Error).message?.includes('NOT DELIVERED')) throw e;
        // status-check network error → don't block; the Resend webhook still alerts on async bounces
      }
    }

    // Remember the address for next time. Metadata must never fail the send that already
    // happened: a missing 'Student Email' field (Adrian hasn't added it yet) degrades to
    // emailSaved:false + a hint, same UNKNOWN_FIELD_NAME pattern as Booked Via.
    let emailSaved = false, saveHint = '';
    if (body.saveEmail && body.studentId && /^rec[a-zA-Z0-9]{14}$/.test(body.studentId)) {
      try {
        await airtableRequest('Students', `/${body.studentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { 'Student Email': to }, typecast: true }),
        });
        emailSaved = true;
      } catch (e) {
        saveHint = (e as Error).message?.includes('UNKNOWN_FIELD_NAME')
          ? "Add a 'Student Email' field (type: email) to the Students table in Airtable to remember addresses."
          : `Could not save the address: ${(e as Error).message}`;
      }
    }
    return NextResponse.json({ delivered: true, emailSaved, ...(saveHint ? { saveHint } : {}) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
