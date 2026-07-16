import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { airtableRequest } from '@/lib/airtable';
import { sendTelegram } from '@/lib/telegram';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { dropboxConfigured, listFolder } from '@/lib/dropbox';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Synthetic monitoring of the parent/student-facing surfaces (cron: every 6h).
// Each check probes a real dependency the way production traffic would; any
// failure fires a Telegram alert naming exactly what broke. Quiet when green.
//
// Adding a feature with a new parent-facing surface? Add a check here —
// see CLAUDE.md "Testing & monitoring policy".

function checkAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return verifyAdminAuth(req);
}

type Result = { name: string; ok: boolean; ms: number; info?: string };

async function timed(name: string, fn: () => Promise<string | void>): Promise<Result> {
  const t0 = Date.now();
  try {
    const info = await fn();
    return { name, ok: true, ms: Date.now() - t0, ...(info ? { info } : {}) };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, info: (e as Error).message.slice(0, 160) };
  }
}

const T = (ms: number) => AbortSignal.timeout(ms);

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const base = process.env.WEBSITE_URL || 'https://www.adrianmathtuition.com';

  // Airtable first — its slot feeds the signup-link check.
  let firstSlotId = '';
  const results: Result[] = [];
  results.push(await timed('airtable', async () => {
    const d = await airtableRequest('Slots', `?filterByFormula=${encodeURIComponent('{Is Active}=1')}&maxRecords=1`);
    if (!d.records?.length) throw new Error('no active slots returned');
    firstSlotId = d.records[0].id;
    return `${d.records.length} slot`;
  }));

  const parallelChecks = await Promise.all([
    // Public schedule the homepage renders
    timed('public-schedule', async () => {
      const r = await fetch(`${base}/api/schedule`, { signal: T(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!Array.isArray(d.slots) || d.slots.length === 0) throw new Error('no slots in response');
      return `${d.slots.length} slots`;
    }),
    // Signup link validation — the exact HMAC handshake a parent's link performs
    timed('signup-link', async () => {
      if (!firstSlotId || !process.env.SIGNUP_SECRET) throw new Error('no slot/secret to test with');
      const params = new URLSearchParams();
      params.set('slotId', firstSlotId);
      params.set('level', 'Sec 3');
      params.set('subjects', 'E Math');
      params.set('expires', String(Date.now() + 10 * 60 * 1000));
      const sig = createHmac('sha256', process.env.SIGNUP_SECRET).update(params.toString()).digest('hex').slice(0, 16);
      params.set('sig', sig);
      const r = await fetch(`${base}/api/signup-data?${params.toString()}`, { signal: T(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.slotName) throw new Error('no slotName in response');
      return d.slotName;
    }),
    // Invoice PDF storage — a stored invoice PDF must still download
    timed('invoice-pdf', async () => {
      const d = await airtableRequest('Invoices', `?filterByFormula=${encodeURIComponent(`NOT({PDF URL}='')`)}&maxRecords=1&fields[]=PDF%20URL`);
      const url = d.records?.[0]?.fields?.['PDF URL'];
      if (!url) return 'no stored PDFs to probe (skipped)';
      const r = await fetch(url, { signal: T(10000) });
      if (!r.ok) throw new Error(`blob HTTP ${r.status}`);
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 5_000) throw new Error(`blob suspiciously small (${buf.byteLength}b)`);
      return `${Math.round(buf.byteLength / 1024)}KB`;
    }),
    // Dropbox notes (admin/kiosk printing)
    timed('dropbox-notes', async () => {
      if (!dropboxConfigured()) return 'not configured (skipped)';
      const entries = await listFolder('/EM');
      const pdfs = entries.filter(e => e.tag === 'file').length;
      if (pdfs === 0) throw new Error('EM folder returned 0 files');
      return `${pdfs} files`;
    }),
    // Resend (welcome emails, invoices, receipts)
    timed('resend', async () => {
      if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
      const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: T(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
    // Kiosk status endpoint
    timed('kiosk', async () => {
      const r = await fetch(`${base}/api/kiosk/status`, { signal: T(10000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    }),
    // Telegram bot machine on Fly (deploys have left it stopped before)
    timed('telegram-bot', async () => {
      const r = await fetch('https://adrianmath-telegram-math-bot.fly.dev/', { signal: T(15000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status} — machine down?`);
    }),
  ]);
  results.push(...parallelChecks);

  const failures = results.filter(r => !r.ok);
  if (failures.length) {
    try {
      await sendTelegram(
        `🚨 <b>Health check FAILED</b> (${failures.length}/${results.length})\n\n` +
        failures.map(f => `❌ <b>${f.name}</b>: ${f.info || 'failed'}`).join('\n') +
        `\n\n✅ passing: ${results.filter(r => r.ok).map(r => r.name).join(', ') || 'none'}`
      );
    } catch { /* alert is best-effort */ }
  }

  return NextResponse.json({ ok: failures.length === 0, results });
}
