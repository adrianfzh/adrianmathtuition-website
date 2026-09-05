// /api/portal/notebook/mistakes — the Notebook's fading mistakes list
// (SPEC-PORTAL-V2 §6).
//
//   GET  → { entries }                       the caller's own rows (401 anonymous);
//                                            the 14-day student_fixed sweep runs on read
//   POST { id, action: 'corrected' } → { ok, entry }
//                                            the student's "Corrected" tap; 404 unless the
//                                            row is the caller's own
//
// Access model: notebook_mistakes has RLS enabled with NO policies — every
// query goes through the service client scoped by the session's portal
// identity (lib/portal-auth.portalIdentity), never by anything the client sent.
// The Notebook page itself renders server-side from the same store; this route
// exists for the button and for the health-check probe (`notebook-mistakes`:
// anonymous GET must 401).
import { NextRequest, NextResponse } from 'next/server';
import { portalIdentity, sessionAccount } from '@/lib/portal-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { loadMistakes, markMistakeCorrected } from '@/lib/notebook-mistakes-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function identityOr401(): Promise<string | NextResponse> {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return portalIdentity(account);
}

export async function GET() {
  const sid = await identityOr401();
  if (sid instanceof NextResponse) return sid;
  try {
    const rows = await loadMistakes(createServiceClient(), sid);
    // Placeholders (linked before any evidence) are not a mistake the student has made yet.
    return NextResponse.json({ entries: rows.filter(r => r.seen_count > 0) });
  } catch (e) {
    console.error('[notebook/mistakes] read failed:', (e as Error).message);
    return NextResponse.json({ error: 'Could not load your mistakes list right now — try again in a moment.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sid = await identityOr401();
  if (sid instanceof NextResponse) return sid;

  let body: { id?: unknown; action?: unknown } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const id = typeof body.id === 'string' ? body.id : '';
  if (body.action !== 'corrected') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const entry = await markMistakeCorrected(createServiceClient(), sid, id);
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    console.error('[notebook/mistakes] corrected failed:', (e as Error).message);
    return NextResponse.json({ error: 'Could not save that — give it a moment and try again.' }, { status: 500 });
  }
}
