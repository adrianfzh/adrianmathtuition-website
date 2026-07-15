// Kiosk ↔ WhatsApp QR pairing.
//
//   1. Kiosk (device cookie)  POST {action:'create'}   → { code, waUrl, expiresAt }
//   2. Student scans QR → WhatsApp opens prefilled "KIOSK-<code>" → taps Send.
//   3. Bot (x-render-secret)  POST {code, studentId, studentName, level, subjects}
//        → claims the pairing after identify(phone) resolved the student.
//   4. Kiosk (device cookie)  GET ?code=  → {pending:true} until claimed, then
//        one-shot {student, token} (consumed_at set — single use).
//
// The signed student token embeds the entitlement set (lib/kiosk-student.ts);
// content routes enforce it server-side, so the kiosk is hard-locked to the
// student's own level.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isKioskOpen } from '@/lib/kiosk-config';
import { verifyKioskAuth } from '@/lib/kiosk-session';
import { deriveEntitlements, signStudentToken } from '@/lib/kiosk-student';

export const runtime = 'nodejs';

const CODE_TTL_MS = 3 * 60 * 1000; // QR valid 3 min, kiosk regenerates on expiry

function botSecretOk(req: NextRequest): boolean {
  const expected = process.env.RENDER_MARKING_SECRET;
  const given = req.headers.get('x-render-secret');
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const supa = getSupabaseAdmin();

  // ── Bot claim (Fly → Vercel, shared secret) ────────────────────────────────
  if (body.code && body.studentId) {
    if (!botSecretOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const code = String(body.code);
    const { data, error } = await supa
      .from('kiosk_pairings')
      .update({
        claimed_at: new Date().toISOString(),
        student_id: String(body.studentId),
        student_name: String(body.studentName || ''),
        level: String(body.level || ''),
        subjects: Array.isArray(body.subjects) ? body.subjects.map(String) : [],
      })
      .eq('code', code)
      .is('claimed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('code')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Code expired or already used' }, { status: 410 });
    return NextResponse.json({ ok: true });
  }

  // ── Kiosk creates a pairing code (device cookie / admin) ──────────────────
  if (body.action === 'create') {
    if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!verifyAdminAuth(req) && !(await isKioskOpen())) {
      return NextResponse.json({ error: 'Kiosk closed', closed: true }, { status: 403 });
    }
    // Opportunistic cleanup of dead codes.
    await supa.from('kiosk_pairings').delete().lt('expires_at', new Date(Date.now() - 60_000).toISOString());

    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const { error } = await supa.from('kiosk_pairings').insert({ code, expires_at: expiresAt });
      if (!error) {
        const waNumber = (process.env.KIOSK_WA_NUMBER || '').replace(/[^\d]/g, '');
        const waUrl = waNumber
          ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`KIOSK-${code}`)}`
          : null; // kiosk shows "not configured" guidance
        return NextResponse.json({ code, waUrl, expiresAt });
      }
      // 23505 unique violation → retry with a fresh code; anything else → fail.
      if (!/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ error: 'Could not allocate code' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}

// ── Kiosk polls for the claim ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!verifyKioskAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const code = new URL(req.url).searchParams.get('code') || '';
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const supa = getSupabaseAdmin();
  // Atomic consume: only the first poll after the claim gets the student.
  const { data, error } = await supa
    .from('kiosk_pairings')
    .update({ consumed_at: new Date().toISOString() })
    .eq('code', code)
    .not('claimed_at', 'is', null)
    .is('consumed_at', null)
    .select('student_id, student_name, level, subjects')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    // Distinguish "still waiting" from "gone" so the kiosk can regenerate.
    const { data: row } = await supa
      .from('kiosk_pairings')
      .select('expires_at, claimed_at, consumed_at')
      .eq('code', code)
      .maybeSingle();
    if (!row || (!row.claimed_at && new Date(row.expires_at).getTime() < Date.now()) || row.consumed_at) {
      return NextResponse.json({ expired: true });
    }
    return NextResponse.json({ pending: true });
  }

  const entitlements = deriveEntitlements(data.level || '', (data.subjects as string[]) || []);
  if (entitlements.practice.length === 0 && entitlements.notes.length === 0) {
    return NextResponse.json({
      error: `No kiosk content mapped for level "${data.level}" — tell Adrian`,
      unmapped: true,
    });
  }
  const student = {
    id: data.student_id as string,
    name: (data.student_name as string) || 'Student',
    level: (data.level as string) || '',
    entitlements,
  };
  return NextResponse.json({ student, token: signStudentToken(student) });
}
