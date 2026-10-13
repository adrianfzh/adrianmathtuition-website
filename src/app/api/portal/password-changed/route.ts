// POST /api/portal/password-changed { where: 'reset' | 'settings' } → { ok }
//
// 🔑 Adrian, 13 Oct 2026: "notify me when student changes password". The reset page and
// Settings call this after updateUser({ password }) works. A signed-in student only; the
// line is sent only when the login really changed in the last few minutes (auth
// updated_at — lib/password-changed changedRecently), so a stray call sends nothing.
// One line to the students topic; a Telegram hiccup never fails the student. Always
// { ok: true } once signed in. Anonymous caller → 401 (health check `portal-password-changed`).
import { NextRequest, NextResponse } from 'next/server';
import { sessionAccount } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { changedRecently, passwordChangedLine } from '@/lib/password-changed';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { where?: unknown };
  const where = body.where === 'reset' ? 'reset' : 'settings';
  try {
    const { data } = await createServiceClient().auth.admin.getUserById(account.id);
    if (changedRecently(data.user?.updated_at, Date.now())) {
      await sendTelegram(passwordChangedLine({ name: account.display_name, email: account.email, where }), 'students').catch(() => false);
    }
  } catch (e) {
    console.error('[password-changed]', (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
