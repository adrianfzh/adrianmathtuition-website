// /api/admin/extraction-queue — the door extraction workers claim through.
//
// The queue is paper_library (kind='source'; docs/EXTRACTION-QUEUE.md). This
// route exists so a worker on ANY machine — in-app session, Mac A launchd, a
// cloud session — needs only the admin bearer and curl, never the service key
// or a bucket credential:
//   GET  ?status=queued|claimed|done|flagged|all&limit=50   → the rows
//   POST {action:'claim',   runner}                          → one row + a 1-hour signed download URL (204 when the queue is empty)
//   POST {action:'download', id}                             → a fresh signed URL for a row you hold
//   POST {action:'finish',  id, runner, status, notes?}      → done | skipped | flagged | failed (claimant only)
//   POST {action:'requeue', id, notes?}                      → back to 'queued', claim cleared (admin)
// Claims are atomic and leased (claim_extraction_paper: FOR UPDATE SKIP LOCKED,
// 3-hour lease, oldest first) — the replacement for renaming a file in a shared
// folder. Health-check probes the 401.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BUCKET = 'paper-library';
const SIGNED_URL_SECONDS = 3600;
const STATUSES = new Set(['queued', 'claimed', 'done', 'skipped', 'flagged', 'failed']);

async function signedUrl(storagePath: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`signed url: ${error?.message || 'none'}`);
  return data.signedUrl;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = req.nextUrl.searchParams.get('status') || 'queued';
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 50)));
  let q = getSupabaseAdmin().from('paper_library')
    .select('id, key, status, source_file, level, year, school, exam_type, paper, size_bytes, sha256, storage_path, inbox_path, claimed_by, claimed_at, finished_at, notes, indexed_at')
    .eq('kind', 'source').order('indexed_at', { ascending: true }).limit(limit);
  if (status !== 'all') {
    if (!STATUSES.has(status)) return NextResponse.json({ error: `status must be one of ${[...STATUSES].join('|')}|all` }, { status: 400 });
    q = q.eq('status', status);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const { data: counts } = await getSupabaseAdmin().from('paper_library').select('status').eq('kind', 'source');
  const byStatus: Record<string, number> = {};
  for (const r of counts ?? []) byStatus[String(r.status)] = (byStatus[String(r.status)] || 0) + 1;
  return NextResponse.json({ ok: true, status, counts: byStatus, rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '');
  const sb = getSupabaseAdmin();

  if (action === 'claim') {
    const runner = String(body.runner || '').trim().slice(0, 80);
    if (!runner) return NextResponse.json({ error: 'runner required' }, { status: 400 });
    const lease = Number.isFinite(Number(body.leaseHours)) ? Math.min(24, Math.max(1, Number(body.leaseHours))) : 3;
    const { data, error } = await sb.rpc('claim_extraction_paper', { p_runner: runner, p_lease_hours: lease });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return new NextResponse(null, { status: 204 });
    try {
      return NextResponse.json({ ok: true, row, downloadUrl: await signedUrl(String(row.storage_path)), expiresInSeconds: SIGNED_URL_SECONDS });
    } catch (e) {
      // Never leave a claim you cannot hand over.
      await sb.rpc('finish_extraction_paper', { p_id: row.id, p_runner: runner, p_status: 'queued', p_notes: `claim handed back: ${(e as Error).message.slice(0, 120)}` });
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  if (action === 'download') {
    const id = String(body.id || '');
    const { data: row, error } = await sb.from('paper_library').select('id, storage_path, status').eq('id', id).eq('kind', 'source').maybeSingle();
    if (error || !row) return NextResponse.json({ error: error?.message || 'no such source' }, { status: 404 });
    try { return NextResponse.json({ ok: true, downloadUrl: await signedUrl(String(row.storage_path)), expiresInSeconds: SIGNED_URL_SECONDS }); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
  }

  if (action === 'finish' || action === 'requeue') {
    const id = String(body.id || '');
    const runner = String(body.runner || 'admin').trim().slice(0, 80);
    const status = action === 'requeue' ? 'queued' : String(body.status || '');
    if (action === 'finish' && !['done', 'skipped', 'flagged', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'status must be done|skipped|flagged|failed' }, { status: 400 });
    }
    const notes = body.notes == null ? null : String(body.notes).slice(0, 2000);
    const { data, error } = await sb.rpc('finish_extraction_paper', { p_id: id, p_runner: runner, p_status: status, p_notes: notes });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return NextResponse.json({ error: 'no such claim for this runner (or not a source row)' }, { status: 409 });
    return NextResponse.json({ ok: true, row });
  }

  return NextResponse.json({ error: 'action must be claim|download|finish|requeue' }, { status: 400 });
}
