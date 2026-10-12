// /trial/pay/<id> — the payment link a new parent gets on WhatsApp after picking a trial slot
// (12 Oct 2026, SPEC-TRIAL-BOOKING.md). PUBLIC: the booking's random id in the address is the
// only proof, and it opens exactly one booking.
//
// GET shows what is being paid for and a Pay button — it never creates anything, because
// WhatsApp's link preview fetches the address before the parent taps it. POST (the button)
// opens a Stripe Checkout page and sends the parent there.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { payPageAction, type TrialRow } from '@/lib/trial-booking';
import { createTrialCheckout } from '@/lib/stripe-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = 'https://www.adrianmathtuition.com';

type Row = TrialRow & { student_name: string; level: string; subjects: string; slot_label: string | null; trial_date: string };

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 28rem; margin: 12vh auto; padding: 0 1.25rem; color: #111827; line-height: 1.5;">
<h1 style="font-size: 1.3rem; margin: 0 0 1rem;">${esc(title)}</h1>
${body}
</body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

const line = (s: string) => `<p style="margin: 0 0 0.6rem; color: #374151;">${s}</p>`;
const EXPIRED = () => page('This link no longer works', line('It is more than two days old. Please message us on WhatsApp and say "trial" to pick a time again.'), 410);
const MISSING = () => page('This link does not work', line('Please message us on WhatsApp and say "trial" to book a trial lesson.'), 404);
const PAID = () => page('Already paid ✅', line('This trial lesson is paid for and booked. The confirmation is on WhatsApp.'));
const TRY_AGAIN = () => page('Please try again in a moment', line('We could not open the payment page just now. If it keeps happening, message us on WhatsApp.'), 503);

function whenLabel(r: Row): string {
  const d = new Date(`${r.trial_date}T00:00:00Z`).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return r.slot_label ? `${d}, ${r.slot_label}` : d;
}

async function load(id: string): Promise<Row | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await getSupabaseAdmin().from('trial_bookings')
    .select('id, status, amount_cents, created_at, payment_intent, refunded_at, invoice_id, student_name, level, subjects, slot_label, trial_date')
    .eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row) || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let row: Row | null;
  try { row = await load(id); } catch (e) { console.error('[trial/pay] load', (e as Error).message); return TRY_AGAIN(); }
  const act = payPageAction(row, Date.now());
  if (act === 'missing') return MISSING();
  if (act === 'expired') return EXPIRED();
  if (act === 'paid') return PAID();
  const r = row!;
  const dollars = (r.amount_cents / 100).toFixed(0);
  const cancelled = req.nextUrl.searchParams.get('cancelled') ? line('<b>The payment was not finished.</b> You can try again below.') : '';
  return page('Book the trial lesson', `
${cancelled}
${line(`<b>Student:</b> ${esc(r.student_name)}`)}
${line(`<b>Class:</b> ${esc(r.level)} ${esc(r.subjects)}`)}
${line(`<b>When:</b> ${esc(whenLabel(r))}`)}
${line(`<b>Trial fee:</b> $${dollars}`)}
<p style="margin: 1rem 0; padding: 0.75rem 1rem; background: #f3f4f6; border-radius: 0.5rem; color: #374151;">
If the student continues, the $${dollars} is taken off the first bill.<br>If not, it is refunded in full.</p>
<form method="post"><button type="submit" style="width: 100%; padding: 0.9rem; font-size: 1.05rem; font-weight: 600; color: #fff; background: #1e3a5f; border: 0; border-radius: 0.6rem; cursor: pointer;">Pay $${dollars}</button></form>
<p style="margin: 0.75rem 0 0; font-size: 0.85rem; color: #6b7280;">The booking is confirmed on WhatsApp as soon as the payment goes through.</p>`);
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let row: Row | null;
  try { row = await load(id); } catch (e) { console.error('[trial/pay] load', (e as Error).message); return TRY_AGAIN(); }
  const act = payPageAction(row, Date.now());
  if (act === 'missing') return MISSING();
  if (act === 'expired') return EXPIRED();
  if (act === 'paid') return PAID();
  const r = row!;
  try {
    const s = await createTrialCheckout({ trialId: r.id, amountCents: r.amount_cents, studentName: r.student_name, level: r.level, whenLabel: whenLabel(r), baseUrl: BASE });
    await getSupabaseAdmin().from('trial_bookings').update({ stripe_session_id: s.id, updated_at: new Date().toISOString() }).eq('id', r.id);
    return NextResponse.redirect(s.url, 303);
  } catch (e) {
    console.error('[trial/pay] checkout', (e as Error).message);
    return TRY_AGAIN();
  }
}
