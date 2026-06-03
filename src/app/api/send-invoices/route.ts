import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { getInvoiceMonth } from '@/lib/invoice-month';
import { copy } from '@vercel/blob';
import { generateAndStoreInvoicePdf } from '@/lib/invoice-pdf';

export const runtime = 'nodejs';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const validCron = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
  const validAdmin = !!(adminPassword && authHeader === `Bearer ${adminPassword}`);
  return isVercelCron || validCron || validAdmin;
}

function buildEmailHtml(invoice: {
  studentName: string;
  month: string;
  finalAmount: number;
  dueDate: string;
  paymentRef: string;
}) {
  return `
    <p>Dear Parent/Student,</p>
    <p>Please find attached the invoice for ${invoice.studentName} for ${invoice.month} — <strong>$${invoice.finalAmount}</strong>, due by <strong>${invoice.dueDate}</strong>.</p>
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${invoice.paymentRef}</strong>.</p>
    <p>Please feel free to reach out if you have any questions.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 14px; color: #6b7280;"><strong>🤖 AdrianMath Telegram Bot</strong></p>
    <p style="font-size: 14px; color: #6b7280;">Your child can message our Telegram bot anytime for help with math questions — just snap a photo or type the question and get step-by-step solutions instantly.</p>
    <p style="font-size: 14px; color: #6b7280;">Parents and students can also use the bot to:</p>
    <ul style="font-size: 14px; color: #6b7280; padding-left: 20px;">
      <li>Reschedule upcoming lessons</li>
      <li>Book makeup lessons for missed classes</li>
      <li>Switch to a different regular timeslot</li>
      <li>Book additional lessons</li>
    </ul>
    <p style="font-size: 14px; color: #6b7280;">Search <strong>@AdrianMathBot</strong> on Telegram to get started. If you haven't registered yet, ask Adrian for your registration code.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

// ── First-invoice welcome template ───────────────────────────────────────────
// Used for a new student's first invoice (detected via the "First invoice" flag
// in Auto Notes). Adds a welcome intro + a plain-English proration explainer.
function buildFirstInvoiceEmailHtml(invoice: {
  studentName: string;
  month: string;
  finalAmount: number;
  dueDate: string;
  paymentRef: string;
  lessonsCount?: number;
  firstLessonDate?: string;
}) {
  const { studentName, month, finalAmount, dueDate, paymentRef, lessonsCount, firstLessonDate } = invoice;
  const dueFmt = dueDate
    ? new Date(dueDate + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : dueDate;
  const firstFmt = firstLessonDate
    ? new Date(firstLessonDate + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
  const prorationLine = (lessonsCount && firstFmt)
    ? `<p>As this is the first invoice, it's <strong>prorated</strong> — it covers only the <strong>${lessonsCount} lesson${lessonsCount !== 1 ? 's' : ''}</strong> from <strong>${firstFmt}</strong> to the end of the month, rather than a full month.</p>`
    : '';
  return `
    <p>Dear Parent/Student,</p>
    <p>A warm welcome to Adrian's Math Tuition — delighted to have <strong>${studentName}</strong> onboard!</p>
    <p>Please find attached <strong>${studentName}'s first invoice</strong> for ${month} — <strong>$${finalAmount}</strong>, due by <strong>${dueFmt}</strong>.</p>
    ${prorationLine}
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${paymentRef}</strong>.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 14px; color: #6b7280;"><strong>🤖 AdrianMath Telegram Bot</strong></p>
    <p style="font-size: 14px; color: #6b7280;">Your child can message our Telegram bot anytime for help with math questions — just snap a photo or type the question and get step-by-step solutions instantly.</p>
    <p style="font-size: 14px; color: #6b7280;">Parents and students can also use the bot to:</p>
    <ul style="font-size: 14px; color: #6b7280; padding-left: 20px;">
      <li>Reschedule upcoming lessons</li>
      <li>Book makeup lessons for missed classes</li>
      <li>Switch to a different regular timeslot</li>
      <li>Book additional lessons</li>
    </ul>
    <p style="font-size: 14px; color: #6b7280;">Search <strong>@AdrianMathBot</strong> on Telegram to get started. If you haven't registered yet, ask Adrian for your registration code.</p>
    <p>I am looking forward to working with ${studentName}. Please reach out anytime if you have any questions.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

// ── June 2026 revision sprint templates ──────────────────────────────────────
// Only used when invoice.month === 'June 2026'. Remove after July 2026.
function buildJune2026EmailHtml(invoice: {
  studentName: string; month: string; finalAmount: number;
  dueDate: string; paymentRef: string; level: string;
}): string {
  const { studentName, finalAmount, dueDate, paymentRef, level } = invoice;
  const dueFmt = dueDate
    ? new Date(dueDate + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : dueDate;
  const encodedMsg = encodeURIComponent(`Hi Adrian, I'd like to sign up ${studentName} for the June Holiday Revision Sprint.`);
  const waLink = `https://wa.me/6591397985?text=${encodedMsg}`;
  const amt = typeof finalAmount === 'number' ? finalAmount.toFixed(2) : finalAmount;
  const lvl = level.replace(/\s+/g, '').toUpperCase();

  const header = `
    <p>Dear Parent/Student,</p>
    <p>Please find attached the invoice for ${studentName} for June 2026 — <strong>$${amt}</strong>, due by <strong>${dueFmt}</strong>.</p>
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${paymentRef}</strong>.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />`;

  const signOff = `
    <p>Please feel free to reach out if you have any questions.</p>
    <p>Best regards,<br>Adrian</p>`;

  if (lvl === 'SEC4' || lvl === 'S4') {
    return header + `
    <p>🏃 <strong>June Holiday Revision Sprint — Sec 4 (EM &amp; AM)</strong></p>
    <p>To prepare students for their upcoming O Levels, I'm running a focused 4-week revision sprint over the June holidays, covering the major topics in the Sec 4 syllabus. Each session is split into concept teaching in the first hour, followed by guided practice for the rest of the lesson.</p>
    <ul>
      <li><strong>EM:</strong> Every Tue &amp; Fri, 10am–12pm (2–19 Jun) — 6 lessons, $420</li>
      <li><strong>AM:</strong> Every Tue &amp; Fri, 1pm–3pm (2–26 Jun) — 8 lessons, $560</li>
    </ul>
    <p>📅 Full revision schedule: <a href="https://www.adrianmathtuition.com/june-revision/sec4">adrianmathtuition.com/june-revision/sec4</a></p>
    <p>I'd recommend students attend if they can, as the revision sprint gives comprehensive coverage of the major topics tested.</p>
    <p><strong>How it works:</strong></p>
    <ul>
      <li>Revision lessons replace regular lessons in June. If you sign up for the June revision sprint, there will be no regular June lessons. You can disregard the attached June invoice; a new separate invoice will be sent for the revision sign-up.</li>
      <li>If you prefer not to attend the revision lessons, then it will be regular lessons in June as usual, and the attached invoice stands.</li>
      <li>Regular lessons will resume in July.</li>
    </ul>
    <p>To sign up: <a href="${waLink}">${waLink}</a></p>` + signOff;
  }

  if (lvl === 'JC2' || lvl === 'J2') {
    return header + `
    <p>🏃 <strong>June Holiday Revision Sprint — JC2 H2 Mathematics</strong></p>
    <p>To prepare students for their upcoming A Levels, I'm running a focused 4-week revision sprint over the June holidays, covering the major topics in the H2 Math syllabus — Functions, Calculus, Vectors, Complex Numbers, Probability, and Distributions. Each session is split into concept teaching in the first hour, followed by guided practice for the rest of the lesson.</p>
    <ul>
      <li>Every Mon &amp; Thu, 12pm–2.30pm (1–25 Jun) — 8 lessons, $640</li>
    </ul>
    <p>📅 Full revision schedule: <a href="https://www.adrianmathtuition.com/june-revision/jc2">adrianmathtuition.com/june-revision/jc2</a></p>
    <p>I'd recommend students attend if they can, as the revision sprint gives comprehensive coverage of the major topics tested.</p>
    <p><strong>How it works:</strong></p>
    <ul>
      <li>Revision lessons replace regular lessons in June. If you sign up for the June revision sprint, there will be no regular June lessons. You can disregard the attached June invoice; a new separate invoice will be sent for the revision sign-up.</li>
      <li>If you prefer not to attend the revision lessons, then it will be regular lessons in June as usual, and the attached invoice stands.</li>
      <li>Regular lessons will resume in July.</li>
    </ul>
    <p>To sign up: <a href="${waLink}">${waLink}</a></p>` + signOff;
  }

  // Junior levels (S1, S2, S3, JC1) — flexible attendance note (unchanged)
  return header + `
    <p>🏖️ <strong>June Holidays — Flexible Attendance (Policy Update)</strong></p>
    <p>A quick note: we've updated our terms &amp; conditions to include June as a flexible-attendance month, since many families travel during this period. Lessons are now optional in June — if you have travel plans or would like a short break, you can skip lessons without penalty.</p>
    <p>Fees will be prorated based on lessons attended in June — the adjustment will be reflected in the July invoice. Just give me a heads up in advance so I can plan class sizes.</p>
    <p>That said, I do encourage attending regular lessons where possible. Steady, consistent learning is far more effective than catching up later — the pace tends to pick up after June and it's always easier to learn ahead than to play catch-up.</p>
    <p>Let me know if you'd like to adjust your June lessons.</p>` + signOff;
}


function buildRevisionSprintEmailHtml(invoice: {
  studentName: string; finalAmount: number; dueDate: string; paymentRef: string;
  lineItemsText: string;
}): string {
  const { studentName, finalAmount, dueDate, paymentRef, lineItemsText } = invoice;
  const dueFmt = dueDate
    ? new Date(dueDate + 'T00:00:00Z').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : dueDate;
  const amt = finalAmount.toFixed(2);
  return `
    <p>Dear Parent/Student,</p>
    <p>Thank you for signing up for the <strong>June 2026 Revision Sprint</strong>!</p>
    <p>Please find attached the invoice for ${studentName} — <strong>$${amt}</strong>, due by <strong>${dueFmt}</strong>.</p>
    <p>Please disregard the regular June 2026 invoice sent earlier — it has been voided and this invoice replaces it.</p>
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${paymentRef}</strong>.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
    <p><strong>What you've signed up for:</strong></p>
    ${lineItemsText}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
    <p>Please feel free to reach out if you have any questions.</p>
    <p>Best regards,<br>Adrian</p>`;
}

function buildAmendedEmailHtml(invoice: {
  studentName: string;
  month: string;
  finalAmount: number;
  dueDate: string;
  paymentRef: string;
}) {
  return `
    <p>Dear Parent/Student,</p>
    <p>Please find attached the <strong>amended invoice</strong> for ${invoice.studentName} for ${invoice.month} — <strong>${invoice.finalAmount.toFixed(2)}</strong>, due by <strong>${invoice.dueDate}</strong>.</p>
    <p>This replaces the previously sent invoice. Please disregard the earlier email.</p>
    <p>To pay, PayNow to <strong>91397985</strong> with reference <strong>${invoice.paymentRef}</strong>.</p>
    <p>Please feel free to reach out if you have any questions.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 14px; color: #6b7280;"><strong>🤖 AdrianMath Telegram Bot</strong></p>
    <p style="font-size: 14px; color: #6b7280;">Your child can message our Telegram bot anytime for help with math questions — just snap a photo or type the question and get step-by-step solutions instantly.</p>
    <p style="font-size: 14px; color: #6b7280;">Parents and students can also use the bot to:</p>
    <ul style="font-size: 14px; color: #6b7280; padding-left: 20px;">
      <li>Reschedule upcoming lessons</li>
      <li>Book makeup lessons for missed classes</li>
      <li>Switch to a different regular timeslot</li>
      <li>Book additional lessons</li>
    </ul>
    <p style="font-size: 14px; color: #6b7280;">Search <strong>@AdrianMathBot</strong> on Telegram to get started. If you haven't registered yet, ask Adrian for your registration code.</p>
    <p>Best regards,<br>Adrian</p>
  `;
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (err: any) {
    console.error('[send-invoices] PDF download error:', err.message);
    return null;
  }
}

// Of the given invoices, which have ALREADY been delivered with a PDF — i.e.
// a prior EmailLog entry for them carries an archived PDF URL. Only such a prior
// COMPLETE delivery makes a re-send an "amendment"; a first send that went out
// without a PDF (legacy) does NOT count. (Can't filter linked records by ID in
// Airtable, so fetch the small set of logs that carry a PDF and match in JS.)
async function fetchDeliveredWithPdf(invoiceIds: string[]): Promise<Set<string>> {
  const want = new Set(invoiceIds);
  const out = new Set<string>();
  if (!want.size) return out;
  try {
    const logs = await airtableRequestAll('EmailLog',
      `?filterByFormula=${encodeURIComponent(`NOT({PDF URL}='')`)}&fields[]=Related Invoice&fields[]=PDF URL`);
    for (const r of logs.records || []) {
      const id = r.fields['Related Invoice']?.[0];
      if (id && want.has(id)) out.add(id);
    }
  } catch (e: any) {
    console.error('[send-invoices] delivered-with-pdf check failed:', e?.message);
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, RESEND_API_KEY } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !RESEND_API_KEY) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
  }

  const at = (table: string, path: string, options?: RequestInit) =>
    airtableRequest(table, path, options);

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const { recordId: singleRecordId, recordIds } = body;

  // ── Preview mode: build the email for ONE invoice and RETURN it (no send) ──
  // Used by the bot's "Review & Send" flow so the admin sees the exact message
  // before approving. Reuses the same subject/html builders as the real send.
  if (body.preview === true && singleRecordId) {
    try {
      const rec = await at('Invoices', `/${singleRecordId}`);
      const sid = rec.fields['Student']?.[0];
      const stu = sid ? await at('Students', `/${sid}`) : { fields: {} };
      const month = (rec.fields['Month'] || '') as string;
      const studentName = (stu.fields['Student Name'] || '') as string;
      const invoice = {
        id: rec.id,
        studentName,
        parentEmail: (stu.fields['Parent Email'] || '') as string,
        month,
        finalAmount: rec.fields['Final Amount'] || 0,
        dueDate: rec.fields['Due Date'],
        paymentRef: `${studentName.toUpperCase()} – ${month.toUpperCase()}`,
        level: (stu.fields['Level'] || '') as string,
      };
      const isAmended = (await fetchDeliveredWithPdf([rec.id])).has(rec.id);
      const isFirstInvP = ((rec.fields['Auto Notes'] || '') as string).toLowerCase().includes('first invoice');
      const subject = isAmended
        ? `AMENDED Invoice for ${month} – ${studentName}`
        : isFirstInvP
          ? `Welcome to Adrian's Math Tuition — First Invoice for ${studentName} (${month})`
          : `Invoice for ${month} – ${studentName}`;
      const customMessage = (rec.fields['Custom Email Message'] || '') as string;
      const invoiceType = (rec.fields['Invoice Type'] || 'Regular') as string;
      let html: string;
      if (customMessage.trim()) {
        html = `<p>${customMessage.trim().replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
      } else if (invoiceType === 'Revision Sprint') {
        let lineItems: { description?: string; amount?: number }[] = [];
        try { lineItems = JSON.parse(rec.fields['Line Items'] || '[]'); } catch { /* ignore */ }
        const lineItemsText = lineItems.map(li =>
          `<p>• ${li.description || 'Revision lessons'} — <strong>$${(li.amount || 0).toFixed(2)}</strong></p>`).join('');
        html = buildRevisionSprintEmailHtml({ ...invoice, lineItemsText });
      } else if (isAmended) {
        html = buildAmendedEmailHtml(invoice);
      } else if (isFirstInvP) {
        let firstLessonDate = '';
        try { const li = JSON.parse(rec.fields['Line Items'] || '[]'); firstLessonDate = li[0]?.date || ''; } catch { /* ignore */ }
        html = buildFirstInvoiceEmailHtml({ ...invoice, lessonsCount: rec.fields['Lessons Count'] || 0, firstLessonDate });
      } else if (month === 'June 2026') {
        html = buildJune2026EmailHtml(invoice);
      } else {
        html = buildEmailHtml(invoice);
      }
      // HTML → readable plain text for Telegram
      const text = html
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li>/gi, '\n• ')
        .replace(/<\/li>/gi, '')
        .replace(/<hr[^>]*>/gi, '\n———\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .split('\n').map((l) => l.trim()).join('\n')  // drop the template's indentation
        .replace(/[ \t]+\n/g, '\n')                    // strip trailing spaces
        .replace(/\n{2,}(• )/g, '\n$1')                // single-space bullet lists
        .replace(/\n{3,}/g, '\n\n')                    // collapse runs of blank lines
        .trim();
      return NextResponse.json({ preview: true, recipient: invoice.parentEmail, subject, text });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Preview failed' }, { status: 500 });
    }
  }

  try {
    let invoiceRecords: any[];
    // True cron: called by Vercel scheduler (x-vercel-cron header) or CRON_SECRET
    // Manual send from admin UI uses ADMIN_PASSWORD — pause flag should NOT block it
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const isActualCron = req.headers.get('x-vercel-cron') === '1' ||
      !!(cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (Array.isArray(recordIds) && recordIds.length) {
      invoiceRecords = await Promise.all(recordIds.map((id: string) => at('Invoices', `/${id}`)));
    } else if (singleRecordId) {
      invoiceRecords = [await at('Invoices', `/${singleRecordId}`)];
    } else {
      // Cron path — check pause flag ONLY for actual cron calls, not manual admin sends
      const settingsData = await airtableRequest('Settings',
        `?filterByFormula=${encodeURIComponent(`{Setting Name}='pause_auto_send'`)}&maxRecords=1`
      ).catch(() => ({ records: [] }));
      const pauseRecord = settingsData.records?.[0];
      if (isActualCron && pauseRecord?.fields?.['Value'] === 'true') {
        console.log('[send-invoices] auto-send paused by admin — skipping cron send');
        // Auto-clear the flag after it fires so it doesn't block next month
        airtableRequest('Settings', `/${pauseRecord.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { Value: '' } }),
        }).catch(() => {});
        return NextResponse.json({ sent: 0, failed: 0, errors: [], paused: true });
      }
      // Scope to current invoice month only so stale Approved
      // rows from previous cycles don't get re-sent automatically.
      const invoiceMonth = getInvoiceMonth();
      const formula = `AND({Status}='Approved',{Month}='${invoiceMonth.label}')`;
      const data = await airtableRequestAll('Invoices', `?filterByFormula=${encodeURIComponent(formula)}`);
      invoiceRecords = data.records || [];
    }

    if (!invoiceRecords.length) {
      return NextResponse.json({ sent: 0, failed: 0, errors: [] });
    }

    const studentIds = [
      ...new Set(invoiceRecords.map((r: any) => r.fields['Student']?.[0]).filter(Boolean)),
    ] as string[];
    const studentsData = studentIds.length
      ? await airtableRequestAll('Students', `?filterByFormula=OR(${studentIds.map((id) => `RECORD_ID()='${id}'`).join(',')})&fields[]=Student Name&fields[]=Parent Email&fields[]=Parent Name&fields[]=Level`)
      : { records: [] };
    const studentsById: Record<string, any> = Object.fromEntries(
      studentsData.records.map((r: any) => [r.id, r.fields])
    );

    const pdfBuffers = await Promise.all(
      invoiceRecords.map(async (record: any) => {
        const pdfUrl = record.fields['PDF URL'];
        if (pdfUrl) return downloadPdf(pdfUrl);
        // No blob PDF yet (e.g. a signup invoice — its PDF lives only as an
        // Airtable attachment). Generate one now so the email never goes out
        // without its invoice, and so it gets archived. Also updates the
        // in-memory record so the post-send archive step picks up the new URL.
        try {
          const studentName = studentsById[record.fields['Student']?.[0]]?.['Student Name'] || '';
          const { buffer, url } = await generateAndStoreInvoicePdf(record, studentName);
          record.fields['PDF URL'] = url;
          return buffer;
        } catch (e: any) {
          console.error('[send-invoices] inline PDF generation failed:', e?.message);
          return null;
        }
      })
    );

    // Which of these invoices already had a COMPLETE (PDF-carrying) delivery —
    // checked before this send archives anything, so it reflects prior sends only.
    const deliveredWithPdf = await fetchDeliveredWithPdf(invoiceRecords.map((r: any) => r.id));

    const emails: any[] = [];
    const invoiceMap = new Map<string, any>();

    for (let i = 0; i < invoiceRecords.length; i++) {
      const invoiceRecord = invoiceRecords[i];
      const studentId = invoiceRecord.fields['Student']?.[0];
      const student = studentsById[studentId];
      if (!student) continue;

      const invoice = {
        id: invoiceRecord.id,
        studentName: student['Student Name'],
        parentEmail: student['Parent Email'],
        month: invoiceRecord.fields['Month'],
        finalAmount: invoiceRecord.fields['Final Amount'] || 0,
        dueDate: invoiceRecord.fields['Due Date'],
        paymentRef: `${(student['Student Name'] || '').toUpperCase()} \u2013 ${(invoiceRecord.fields['Month'] || '').toUpperCase()}`,
        level: (student['Level'] || '') as string,
      };

      const pdfBuffer = pdfBuffers[i];
      const isAmended = deliveredWithPdf.has(invoiceRecord.id);
      const isFirstInv = ((invoiceRecord.fields['Auto Notes'] || '') as string).toLowerCase().includes('first invoice');
      const subject = isAmended
        ? `AMENDED Invoice for ${invoice.month} \u2013 ${invoice.studentName}`
        : isFirstInv
          ? `Welcome to Adrian's Math Tuition \u2014 First Invoice for ${invoice.studentName} (${invoice.month})`
          : `Invoice for ${invoice.month} \u2013 ${invoice.studentName}`;
      const customMessage = (invoiceRecord.fields['Custom Email Message'] || '') as string;
      const invoiceType = (invoiceRecord.fields['Invoice Type'] || 'Regular') as string;
      let html: string;
      if (customMessage.trim()) {
        html = `<p>${customMessage.trim().replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
      } else if (invoiceType === 'Revision Sprint') {
        // Parse line items to build a readable summary
        let lineItems: {description?: string; amount?: number}[] = [];
        try { lineItems = JSON.parse(invoiceRecord.fields['Line Items'] || '[]'); } catch { /* ignore */ }
        const lineItemsText = lineItems.map(li =>
          `<p>• ${li.description || 'Revision lessons'} — <strong>$${(li.amount || 0).toFixed(2)}</strong></p>`
        ).join('');
        html = buildRevisionSprintEmailHtml({ ...invoice, lineItemsText });
      } else if (isAmended) {
        html = buildAmendedEmailHtml(invoice);
      } else if (((invoiceRecord.fields['Auto Notes'] || '') as string).toLowerCase().includes('first invoice')) {
        let firstLessonDate = '';
        try { const li = JSON.parse(invoiceRecord.fields['Line Items'] || '[]'); firstLessonDate = li[0]?.date || ''; } catch { /* ignore */ }
        html = buildFirstInvoiceEmailHtml({ ...invoice, lessonsCount: invoiceRecord.fields['Lessons Count'] || 0, firstLessonDate });
      } else if (invoice.month === 'June 2026') {
        html = buildJune2026EmailHtml(invoice);
      } else {
        html = buildEmailHtml(invoice);
      }

      const emailData: any = {
        from: "Adrian's Math Tuition <invoices@adrianmathtuition.com>",
        reply_to: "adrianmathtuition@gmail.com",
        to: invoice.parentEmail,
        subject,
        html,
      };
      if (pdfBuffer) {
        emailData.attachments = [{
          filename: invoiceType === 'Revision Sprint'
            ? `AdrianMathTuition-Revision-Sprint-${(invoice.studentName || '').replace(/\s+/g, '-')}-June-2026.pdf`
            : `AdrianMathTuition-Invoice-${(invoice.studentName || '').replace(/\s+/g, '-')}-${(invoice.month || '').replace(/\s+/g, '-')}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf',
          disposition: 'attachment',
        }];
      }
      emails.push(emailData);
      const autoNotes = (invoiceRecord.fields['Auto Notes'] || '') as string;
      const isFirstInvoice = autoNotes.toLowerCase().includes('first invoice');
      invoiceMap.set(invoice.id, {
        record: invoiceRecord,
        studentName: invoice.studentName,
        month: invoice.month,
        isFirstInvoice,
      });
    }

    if (!emails.length) {
      return NextResponse.json({ sent: 0, failed: 0, errors: [] });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors: any[] = [];
    const sentDetails: { studentName: string; month: string; isFirstInvoice: boolean }[] = [];
    const invoiceIds = Array.from(invoiceMap.keys());

    for (let i = 0; i < invoiceIds.length; i++) {
      const invoiceId = invoiceIds[i];
      const emailData = emails[i];
      try {
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData),
        });
        if (!sendRes.ok) throw new Error('Resend send failed: ' + await sendRes.text());
        const sendData = await sendRes.json().catch(() => ({}));
        const resendId = (sendData as any).id || '';

        // Resend returns 200 + an id even when the address is SUPPRESSED (blocked
        // because a prior email to it hard-bounced or was marked spam) — the mail
        // is never delivered. Verify the status so we don't mark undelivered mail
        // as "Sent" (this is what silently dropped Ian's invoice).
        if (resendId) {
          try {
            const st = await fetch(`https://api.resend.com/emails/${resendId}`, {
              headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
            });
            if (st.ok) {
              const ev = (await st.json())?.last_event;
              if (ev === 'suppressed' || ev === 'failed' || ev === 'bounced') {
                throw new Error(`NOT DELIVERED (${ev}) — recipient blocked by the email provider. Verify the address or clear the suppression in Resend, then resend.`);
              }
            }
          } catch (e: any) {
            if (typeof e?.message === 'string' && e.message.includes('NOT DELIVERED')) throw e;
            // status-check network error → don't block the send; the webhook still catches async failures
          }
        }

        await at('Invoices', `/${invoiceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: { 'Status': 'Sent', 'Sent At': new Date().toISOString() } }),
        });
        sentCount++;
        const sentMeta = invoiceMap.get(invoiceId);
        if (sentMeta) {
          sentDetails.push({
            studentName: sentMeta.studentName,
            month: sentMeta.month,
            isFirstInvoice: sentMeta.isFirstInvoice,
          });
        }

        // Archive the exact PDF that was just sent to a permanent (never-overwritten)
        // path, so it's preserved even after a future amendment overwrites the
        // invoice's working PDF URL. Stored on the EmailLog row → one email = one PDF.
        let archivedPdfUrl = '';
        const currentPdfUrl = invoiceMap.get(invoiceId)?.record?.fields?.['PDF URL'] as string | undefined;
        if (currentPdfUrl) {
          try {
            const archived = await copy(currentPdfUrl, `invoices/archive/${invoiceId}-${Date.now()}.pdf`, {
              access: 'public', contentType: 'application/pdf',
            });
            archivedPdfUrl = archived.url;
          } catch (e: any) {
            console.error('[send-invoices] PDF archive failed (non-fatal):', e.message);
          }
        }

        // Log to EmailLog (non-fatal)
        const isAmendedEmail = deliveredWithPdf.has(invoiceId);
        at('EmailLog', '', {
          method: 'POST',
          body: JSON.stringify({ fields: {
            'Email ID': `invoice-${invoiceId}-${Date.now()}`,
            'Sent At': new Date().toISOString(),
            'Type': isAmendedEmail ? 'amended_invoice' : 'invoice',
            'To Email': emailData.to || '',
            'Subject': emailData.subject || '',
            'Body HTML': emailData.html || '',
            'Related Invoice': [invoiceId],
            'Status': 'sent',
            ...(archivedPdfUrl ? { 'PDF URL': archivedPdfUrl } : {}),
            ...(resendId ? { 'Resend ID': resendId } : {}),
          }}),
        }).catch((e: any) => console.error('[send-invoices] EmailLog failed:', e.message));
      } catch (err: any) {
        failedCount++;
        const studentName = invoiceMap.get(invoiceId)?.studentName ?? invoiceId;
        console.error(`[send-invoices] Failed to send invoice for ${studentName} (${invoiceId}):`, err.message);
        errors.push({ invoiceId, studentName, error: err.message });

        at('EmailLog', '', {
          method: 'POST',
          body: JSON.stringify({ fields: {
            'Email ID': `invoice-${invoiceId}-${Date.now()}`,
            'Sent At': new Date().toISOString(),
            'Type': deliveredWithPdf.has(invoiceId) ? 'amended_invoice' : 'invoice',
            'To Email': emailData.to || '',
            'Subject': emailData.subject || '',
            'Related Invoice': [invoiceId],
            'Status': 'failed',
            'Error': err.message,
          }}),
        }).catch(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    const currentMonth = emails[0]?.subject?.match(/for (.+) \u2013/)?.[1] ?? getInvoiceMonth().label;
    const failedLines = errors.map((e) => `• ${e.studentName ?? e.invoiceId}: ${e.error}`).join('\n');
    const sentLines = sentDetails
      .map((d) => `• ${d.studentName} (${d.month})${d.isFirstInvoice ? ' \u{1F195} New student' : ''}`)
      .join('\n');
    await sendTelegram(
      `${failedCount > 0 ? '\u26a0\ufe0f <b>Invoices \u2014 DELIVERY ISSUES</b>' : '\u2705 <b>Invoices delivered</b>'} \u2014 ${currentMonth}\n\n` +
        `Delivered: ${sentCount} | Not delivered: ${failedCount}` +
        (sentLines ? `\n\n${sentLines}` : '') +
        (failedCount > 0
          ? `\n\n\u26a0\ufe0f NOT delivered (fix + resend):\n${failedLines}`
          : '\n\nAll invoices delivered successfully.')
    );

    return NextResponse.json({ sent: sentCount, failed: failedCount, errors, total: emails.length });
  } catch (err: any) {
    console.error('[send-invoices] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
