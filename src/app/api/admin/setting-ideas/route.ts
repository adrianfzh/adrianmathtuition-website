// GET   /api/admin/setting-ideas                          → { ideas }
// PATCH /api/admin/setting-ideas { id, status?, adminNote? } → { ideas }
//
// ⚙️ Setting ideas the Telegram bot collected (5 Nov 2026) for /admin/setting-ideas. Admin session
// or Bearer ADMIN_PASSWORD; anonymous → 401 (the health check probes it). 'approved' only puts an
// idea on the to-build list — nothing is built or switched on.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { isIdeaStatus, type IdeaStatus } from '@/lib/setting-ideas';
import { listIdeas, updateIdea } from '@/lib/setting-ideas-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ideas: await listIdeas() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown; adminNote?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const patch: { status?: IdeaStatus; admin_note?: string | null } = {};
  if (body.status !== undefined) {
    if (!isIdeaStatus(body.status)) return NextResponse.json({ error: 'bad status' }, { status: 400 });
    patch.status = body.status;
  }
  if (body.adminNote !== undefined) patch.admin_note = String(body.adminNote ?? '').trim().slice(0, 1000) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 });
  try {
    if (!(await updateIdea(id, patch))) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ideas: await listIdeas() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
