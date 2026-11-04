// /api/portal/parent-link — the student's side of the weekly parent report
// (SPEC-PARENT-REPORT.md). GET: who is linked / waiting. POST: make a 7-day link
// to send a parent. DELETE {id}: cancel a link the parent has not confirmed yet.
// A confirmed link is stopped by the parent (or by us) — the student sees it,
// and is told plainly that a parent gets the report.
// Cookie session (the website) or Bearer (the app shell).
import { NextRequest, NextResponse } from 'next/server';
import { bearerAccount, portalIdentity, sessionAccount, type PortalAccount } from '@/lib/portal-auth';
import { parentReportVisible } from '@/lib/portal-beta';
import { createServiceClient } from '@/lib/supabase-server';
import { INVITE_DAYS, newInviteCode } from '@/lib/parent-report';
import { SITE, linksForStudent, type LinkRow } from '@/lib/parent-report-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LINKS = 3; // parents/guardians per child, pending + active

async function caller(req: NextRequest): Promise<PortalAccount | null> {
  return (await bearerAccount(req)) ?? (await sessionAccount());
}

function shape(l: LinkRow) {
  const pending = l.status === 'pending';
  return {
    id: l.id, status: l.status,
    since: l.linked_at ?? l.created_at,
    url: pending && l.invite_code ? `${SITE}/parent/join/${l.invite_code}` : null,
    expires: pending ? l.invite_expires_at : null,
  };
}

async function visibleLinks(identity: string) {
  const sb = createServiceClient();
  const now = Date.now();
  const rows = (await linksForStudent(sb, identity)).filter(l => l.status === 'active' || (l.invite_expires_at && new Date(l.invite_expires_at).getTime() > now));
  return { sb, rows };
}

export async function GET(req: NextRequest) {
  const account = await caller(req);
  if (!account) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const identity = portalIdentity(account);
  if (!(await parentReportVisible(identity))) return NextResponse.json({ open: false, links: [] });
  const { rows } = await visibleLinks(identity);
  return NextResponse.json({ open: true, links: rows.map(shape) });
}

export async function POST(req: NextRequest) {
  const account = await caller(req);
  if (!account) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const identity = portalIdentity(account);
  if (!(await parentReportVisible(identity))) return NextResponse.json({ error: 'Not available yet.' }, { status: 403 });
  const { sb, rows } = await visibleLinks(identity);
  const waiting = rows.find(l => l.status === 'pending');
  if (waiting) return NextResponse.json({ link: shape(waiting) }); // one waiting link at a time
  if (rows.length >= MAX_LINKS) return NextResponse.json({ error: `Up to ${MAX_LINKS} parents can be linked.` }, { status: 400 });
  for (let tries = 0; tries < 3; tries++) {
    const { data, error } = await sb.from('parent_links').insert({
      student_identity: identity, status: 'pending', invite_code: newInviteCode(),
      invite_expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    }).select('id, student_identity, parent_id, status, invite_code, invite_expires_at, linked_at, ended_at, created_at').single();
    if (!error && data) return NextResponse.json({ link: shape(data as LinkRow) });
    if (error && !/duplicate|unique/i.test(error.message)) { console.error('[parent-link] create:', error.message); break; }
  }
  return NextResponse.json({ error: 'Could not make a link just now — try again.' }, { status: 500 });
}

export async function DELETE(req: NextRequest) {
  const account = await caller(req);
  if (!account) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const identity = portalIdentity(account);
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: 'Which link?' }, { status: 400 });
  const sb = createServiceClient();
  const { data } = await sb.from('parent_links')
    .update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: 'student', invite_code: null })
    .eq('id', id).eq('student_identity', identity).eq('status', 'pending').select('id');
  if (!data?.length) return NextResponse.json({ error: 'Only a link your parent has not confirmed can be cancelled here.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
