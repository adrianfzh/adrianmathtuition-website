// POST /api/bot/trial-refund {trialId} — the bot calls this when Adrian presses 💸 Refund on a
// trial card in Telegram (12 Oct 2026, SPEC-TRIAL-BOOKING.md). Money leaves only from here, only
// on his tap, at most once per booking (lib/trial-booking.ts refundCheck + a Stripe
// Idempotency-Key on the trial id).
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { getSupabaseAdmin } from '@/lib/supabase';
import { refundCheck, type TrialRow } from '@/lib/trial-booking';
import { refundPayment } from '@/lib/stripe-api';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { trialId } = (await req.json().catch(() => ({}))) as { trialId?: string };
  if (!trialId) return NextResponse.json({ error: 'trialId required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: row, error } = await db.from('trial_bookings')
    .select('id, status, amount_cents, created_at, payment_intent, refunded_at, invoice_id').eq('id', trialId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const check = refundCheck(row as TrialRow | null);
  if (!check.ok) return NextResponse.json({ ok: false, reason: check.reason }, { status: 409 });

  try {
    const r = await refundPayment(row!.payment_intent!, trialId);
    const now = new Date().toISOString();
    await db.from('trial_bookings').update({ status: 'refunded', refunded_at: now, stripe_refund_id: r.id, updated_at: now }).eq('id', trialId);
    return NextResponse.json({ ok: true, refundId: r.id, status: r.status, amount: row!.amount_cents / 100 });
  } catch (e) {
    console.error('[trial-refund]', (e as Error).message);
    return NextResponse.json({ ok: false, reason: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
