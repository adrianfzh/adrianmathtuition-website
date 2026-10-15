// GET /api/cron/email-stuck — emails that never arrived and never bounced (15 Oct 2026).
//
// Daily 9am SGT. Bounces and spam reports already alert from /api/resend-webhook;
// this catches the rest: an EmailLog row still `sent` / `delayed` a day after it
// went out (lib/email-stuck.ts). Each one is read back from Resend first — if the
// webhook simply missed the `delivered` event, the row is corrected and no alert
// goes. Silent when nothing is stuck. Stamps job_runs.
// Auth: CRON_SECRET bearer, x-vercel-cron, or ADMIN_PASSWORD bearer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { logJobRun } from '@/lib/job-log';
import { sendTelegram } from '@/lib/telegram';
import { airtableRequest, airtableRequestAll } from '@/lib/airtable';
import { checkDelivery } from '@/lib/resend-verify';
import { statusPatchBody } from '@/lib/email-status';
import { stuckEmails, stuckAlertText, type EmailLogRow } from '@/lib/email-stuck';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET, admin = process.env.ADMIN_PASSWORD;
  if (req.headers.get('x-vercel-cron')) return true;
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return true;
  if (admin && safeEqual(auth, `Bearer ${admin}`)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const formula = `AND(IS_AFTER({Sent At}, DATEADD(NOW(), -3, 'days')), OR({Status}='sent', {Status}='delayed'))`;
    const res = await airtableRequestAll('EmailLog',
      `?filterByFormula=${encodeURIComponent(formula)}&fields[]=Sent At&fields[]=Status&fields[]=Resend ID&fields[]=To Email&fields[]=Subject`);
    const rows: EmailLogRow[] = (res.records ?? []).map((r: any) => ({
      id: r.id,
      sentAt: r.fields['Sent At'] || r.createdTime,
      status: r.fields['Status'] || '',
      resendId: r.fields['Resend ID'] || '',
      to: r.fields['To Email'] || '(unknown)',
      subject: r.fields['Subject'] || '(no subject)',
    }));
    const candidates = stuckEmails(rows, Date.now());

    const key = (process.env.RESEND_API_KEY || '').trim();
    const stuck: { to: string; subject: string; event: string }[] = [];
    let corrected = 0;
    for (const r of candidates) {
      const v = key ? await checkDelivery(r.resendId, key) : null;
      if (v?.kind === 'ok' && v.event === 'delivered') {
        await airtableRequest('EmailLog', `/${r.id}`, { method: 'PATCH', body: JSON.stringify(statusPatchBody('delivered')) }).catch(() => {});
        corrected++;
        continue;
      }
      stuck.push({ to: r.to, subject: r.subject, event: v && v.kind !== 'unavailable' ? v.event : r.status });
    }

    if (stuck.length) await sendTelegram(stuckAlertText(stuck), 'money').catch(() => {});
    const summary = `${candidates.length} unconfirmed, ${corrected} were delivered, ${stuck.length} alerted`;
    await logJobRun('email-stuck', true, summary);
    return NextResponse.json({ ok: true, candidates: candidates.length, corrected, stuck });
  } catch (e: any) {
    await logJobRun('email-stuck', false, e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
