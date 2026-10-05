// GET  /api/admin/suggestions                      → { suggestions }
// PATCH /api/admin/suggestions { id, status?, adminNote? } → { suggestion }
//
// 💡 The students' suggestions for /admin/suggestions (5 Oct 2026). Admin session or
// Bearer ADMIN_PASSWORD; anonymous → 401 (the health check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isSuggestionStatus } from '@/lib/suggestions';
import { listSuggestions, updateSuggestion } from '@/lib/suggestions-store';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ suggestions: await listSuggestions() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown; adminNote?: unknown };
  const id = String(body.id ?? '');
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch: { status?: 'new' | 'planned' | 'done' | 'no'; admin_note?: string | null } = {};
  if (body.status !== undefined) {
    if (!isSuggestionStatus(body.status)) return NextResponse.json({ error: 'bad status' }, { status: 400 });
    patch.status = body.status;
  }
  if (body.adminNote !== undefined) patch.admin_note = String(body.adminNote ?? '').trim().slice(0, 1000) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 });
  try {
    const row = await updateSuggestion(id, patch);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ suggestion: row });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
