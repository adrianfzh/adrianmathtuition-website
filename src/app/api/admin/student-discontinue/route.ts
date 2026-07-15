import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

// POST /api/admin/student-discontinue  { studentId, effectiveDate }
// Discontinue a student in one atomic action (the manual version of this was
// error-prone — a missed Active enrollment kept the bot's Monday cron generating
// lessons and the invoice generator billing them; see Ze Kai, Jul 2026):
//   1. End ALL Active enrollments (Status='Ended', End Date = day before effectiveDate)
//   2. Delete future Regular lessons (Date >= effectiveDate, Status='Scheduled').
//      Completed/Absent history is kept; Makeup/Rescheduled/etc. are untouched —
//      owed makeups survive discontinuation.
//   3. Set the Students record Status='Inactive'.
//   4. Report (NOT auto-void) any live invoices for the effective month onwards,
//      so the admin can review/void — a sent invoice may need a parent message.
// effectiveDate = the first day with no more regular lessons.

function dayBefore(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthKey(label: string): number {
  const m = (label || '').trim().match(/^(\w+)\s+(\d{4})$/);
  if (!m) return 0;
  const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  return idx < 0 ? 0 : Number(m[2]) * 12 + idx;
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId, effectiveDate, reason, voidUnsent, emailParent } = await req.json().catch(() => ({}));
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate || '')) {
    return NextResponse.json({ error: 'studentId and effectiveDate (YYYY-MM-DD) required' }, { status: 400 });
  }

  const result = { enrollmentsEnded: 0, lessonsDeleted: 0, studentInactive: false, invoicesVoided: 0, invoicesToReview: [] as any[], emailSent: false };

  // Student record (name / parent email / existing notes) for the notes append, email, and summary.
  let studentName = '', parentEmail = '', existingNotes = '';
  try {
    const s = await airtableRequest('Students', `/${studentId}`);
    studentName = s.fields['Student Name'] || '';
    parentEmail = s.fields['Parent Email'] || '';
    existingNotes = s.fields['Notes'] || '';
  } catch { /* non-fatal */ }

  // 1. End all Active enrollments (linked-record gotcha: filter by Status, match student in JS)
  const enr = await airtableRequestAll('Enrollments', `?filterByFormula=${encodeURIComponent(`{Status}='Active'`)}&fields[]=Student&fields[]=Status`);
  const mine = (enr.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
  for (const r of mine) {
    await airtableRequest('Enrollments', `/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Status: 'Ended', 'End Date': dayBefore(effectiveDate) } }),
    });
    result.enrollmentsEnded++;
  }

  // 2. Delete future Scheduled Regular lessons
  const lesFormula = encodeURIComponent(`AND({Type}='Regular',{Status}='Scheduled',{Date}>='${effectiveDate}')`);
  const les = await airtableRequestAll('Lessons', `?filterByFormula=${lesFormula}&fields[]=Student&fields[]=Date`);
  const hisLessons = (les.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId);
  for (let i = 0; i < hisLessons.length; i += 10) {
    const qs = hisLessons.slice(i, i + 10).map((r: any) => `records[]=${r.id}`).join('&');
    await airtableRequest('Lessons', `?${qs}`, { method: 'DELETE' });
  }
  result.lessonsDeleted = hisLessons.length;

  // 3. Student -> Inactive, and log the discontinue reason to Notes.
  const stamp = `[Discontinued ${effectiveDate}${reason ? ` — ${String(reason).trim()}` : ''}]`;
  const newNotes = existingNotes ? `${existingNotes}\n${stamp}` : stamp;
  await airtableRequest('Students', `/${studentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Status: 'Inactive', Notes: newNotes } }),
  });
  result.studentInactive = true;

  // 4. Invoices FROM the effective month onwards cover lessons that won't happen,
  //    so void them all (Draft/Approved AND already-sent), unpaid only. Older
  //    unpaid invoices (< effective month) are genuinely owed for delivered
  //    lessons — never touched here. Paid invoices are excluded by the query.
  //    Track any *sent* invoice we void so the parent can be told to disregard it.
  const effKey = monthKey(`${MONTHS[new Date(effectiveDate + 'T00:00:00Z').getUTCMonth()]} ${new Date(effectiveDate + 'T00:00:00Z').getUTCFullYear()}`);
  const inv = await airtableRequestAll('Invoices',
    `?filterByFormula=${encodeURIComponent(`AND({Status}!='Voided',NOT({Is Paid}))`)}&fields[]=Student&fields[]=Month&fields[]=Status&fields[]=Final Amount&fields[]=Invoice Type`);
  const mineInv = (inv.records || []).filter((r: any) => r.fields['Student']?.[0] === studentId && monthKey(r.fields['Month']) >= effKey);
  const voidedSentMonths: string[] = []; // sent invoices we voided → tell parent to disregard
  for (const r of mineInv) {
    const status = r.fields['Status'];
    if (voidUnsent) {
      try {
        await airtableRequest('Invoices', `/${r.id}`, { method: 'PATCH', body: JSON.stringify({ fields: { Status: 'Voided' } }) });
        result.invoicesVoided++;
        if (status === 'Sent' || status === 'Overdue') voidedSentMonths.push(r.fields['Month']);
        continue;
      } catch { /* fall through to report */ }
    }
    result.invoicesToReview.push({ id: r.id, month: r.fields['Month'], status, amount: r.fields['Final Amount'], type: r.fields['Invoice Type'] });
  }

  // 5. Optional farewell email to the parent (opt-in).
  if (emailParent && parentEmail && process.env.RESEND_API_KEY) {
    try {
      // Use the full name (can't reliably tell a given name from a full-name
      // string — Chinese put the surname first, Western last) and "them/their".
      const name = studentName || 'your child';
      const dateFmt = (() => { try { return new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return effectiveDate; } })();
      const disregard = voidedSentMonths.length
        ? `<p style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px"><strong>Please disregard the invoice issued for ${[...new Set(voidedSentMonths)].join(' and ')}.</strong> It has been cancelled, as it covered lessons from ${dateFmt} that will no longer take place, and no payment is required.</p>`
        : '';
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#33415c;line-height:1.6;max-width:560px;margin:0 auto;padding:16px">
        <p>Thank you for the time we've spent teaching <strong>${name}</strong> at Adrian's Math Tuition.</p>
        <p>The last lesson with us is before <strong>${dateFmt}</strong>. It's been a real pleasure, and they're always welcome back — just message me anytime.</p>
        ${disregard}
        <p>Wishing them all the very best.</p>
        <p style="margin-top:18px"><strong style="color:#1e3a5f">Adrian</strong><br/><span style="font-size:13px;color:#8a94a6">Adrian's Math Tuition · 9139 7985 · adrianmathtuition.com</span></p>
      </body></html>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: "Adrian's Math Tuition <hello@adrianmathtuition.com>", to: parentEmail, subject: studentName ? `${studentName} — end of lessons at Adrian's Math Tuition` : `End of lessons — Adrian's Math Tuition`, html }),
      });
      result.emailSent = res.ok;
    } catch { /* non-fatal */ }
  }

  // 6. Telegram summary to admin (silent to parents).
  try {
    const reviewLine = result.invoicesToReview.length
      ? `\n⚠️ Review ${result.invoicesToReview.length} sent invoice(s): ${result.invoicesToReview.map((i: any) => `${i.month} $${i.amount} (${i.status})`).join(', ')}`
      : '';
    await sendTelegram(
      `⏹ <b>Discontinued: ${studentName}</b>\n` +
      `Effective: ${effectiveDate}${reason ? `\nReason: ${String(reason).trim()}` : ''}\n` +
      `Enrolments ended: ${result.enrollmentsEnded} · Future lessons removed: ${result.lessonsDeleted}\n` +
      `Invoices auto-voided: ${result.invoicesVoided}${result.emailSent ? '\n📧 Farewell email sent to parent' : ''}` +
      reviewLine
    );
  } catch { /* non-fatal */ }

  return NextResponse.json({ success: true, ...result });
}
