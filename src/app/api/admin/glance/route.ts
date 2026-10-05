// GET /api/admin/glance — the admin dashboard in one read (5 Oct 2026, Adrian:
// "make the dashboard 'at a glance' - like a monitoring dashboard").
//
// Counts only (lib/glance-store.ts reads them, lib/glance.ts turns them into
// tiles). Held in memory for 60 s so a page left open and refreshing every
// minute costs one round of reads a minute, however many tabs are open.
// `?fresh=1` skips the cache. Admin session or Bearer ADMIN_PASSWORD; anonymous
// → 401 (the health check probes it).
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadGlanceFacts } from '@/lib/glance-store';
import { buildGlance, type Glance } from '@/lib/glance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TTL_MS = 60_000;
let cache: { at: number; glance: Glance } | null = null;
let inflight: Promise<Glance> | null = null;

async function fresh(): Promise<Glance> {
  const now = Date.now();
  const glance = buildGlance(await loadGlanceFacts(now), now);
  cache = { at: now, glance };
  return glance;
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const skip = req.nextUrl.searchParams.get('fresh') === '1';
  try {
    if (!skip && cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.glance);
    inflight ??= fresh().finally(() => { inflight = null; });
    return NextResponse.json(await inflight);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
