// 🧑‍🏫 /api/admin/tutors — Adrian's door for the invite-only tutor portal (SPEC-TUTOR-TOOLS.md §7).
//   GET                                          → every tutor, this month's papers / cap, students
//   POST  { email, name, cap?, note? }           → makes the account, returns a one-time invite link
//   PATCH { id, cap?, active?, newInvite? }      → change the cap, switch off/on, or a fresh invite link
// Nothing here shows a tutor's student names — those belong to the tutor.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { cleanEmail, cleanName, INVITE_DAYS, newInviteToken, sgtMonthKey, USD_PER_PAPER } from '@/lib/tutor-portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inviteLink(req: NextRequest, token: string): string {
  return `${new URL(req.url).origin}/tutor/invite/${token}`;
}
const inviteExpiry = () => new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
const capOf = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null;
};

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const month = sgtMonthKey();
  const [{ data: tutors }, { data: papers }, { data: students }] = await Promise.all([
    sb.from('tutor_accounts').select('id, email, display_name, monthly_paper_cap, active, note, created_at, last_login_at, password_hash, invite_expires_at').order('created_at'),
    sb.from('tutor_papers').select('tutor_id, month, status'),
    sb.from('tutor_students').select('tutor_id').is('archived_at', null),
  ]);
  const rows = ((tutors ?? []) as Record<string, unknown>[]).map(t => {
    const mine = ((papers ?? []) as { tutor_id: string; month: string; status: string }[]).filter(p => p.tutor_id === t.id);
    const thisMonth = mine.filter(p => p.month === month).length;
    return {
      id: t.id, email: t.email, name: t.display_name, cap: t.monthly_paper_cap, active: t.active, note: t.note,
      createdAt: t.created_at, lastLoginAt: t.last_login_at,
      joined: !!t.password_hash, inviteOpen: !t.password_hash && !!t.invite_expires_at && Date.parse(String(t.invite_expires_at)) > Date.now(),
      students: ((students ?? []) as { tutor_id: string }[]).filter(s => s.tutor_id === t.id).length,
      papersThisMonth: thisMonth, papersAllTime: mine.length,
      waiting: mine.filter(p => p.status === 'waiting').length,
      costThisMonthUsd: Math.round(thisMonth * USD_PER_PAPER * 100) / 100,
    };
  });
  return NextResponse.json({ month, tutors: rows });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { email?: unknown; name?: unknown; cap?: unknown; note?: unknown };
  const email = cleanEmail(body.email);
  const name = cleanName(body.name);
  if (!email || !name) return NextResponse.json({ error: 'Email and name are needed.' }, { status: 400 });
  const cap = body.cap === undefined ? 20 : capOf(body.cap);
  if (cap === null) return NextResponse.json({ error: 'Cap must be a whole number 0–1000.' }, { status: 400 });
  const { token, hash } = newInviteToken();
  const { data, error } = await getSupabaseAdmin().from('tutor_accounts').insert({
    email, display_name: name, monthly_paper_cap: cap, note: cleanName(body.note, 200),
    invite_token_hash: hash, invite_expires_at: inviteExpiry(),
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That email already has an account.' : error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id, inviteLink: inviteLink(req, token), expiresInDays: INVITE_DAYS });
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: unknown; cap?: unknown; active?: unknown; newInvite?: unknown };
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.cap !== undefined) {
    const cap = capOf(body.cap);
    if (cap === null) return NextResponse.json({ error: 'Cap must be a whole number 0–1000.' }, { status: 400 });
    patch.monthly_paper_cap = cap;
  }
  if (typeof body.active === 'boolean') patch.active = body.active;
  let link: string | null = null;
  if (body.newInvite === true) {
    // A fresh link also clears the password: the tutor sets a new one (the "forgot password" path).
    const { token, hash } = newInviteToken();
    Object.assign(patch, { invite_token_hash: hash, invite_expires_at: inviteExpiry(), password_hash: null });
    link = inviteLink(req, token);
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('tutor_accounts').update(patch).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(link ? { inviteLink: link, expiresInDays: INVITE_DAYS } : {}) });
}
