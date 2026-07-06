import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results: Record<string, string> = {};

  for (const access of ['private', 'public'] as const) {
    try {
      const blob = await put(`probe/test-${access}.txt`, `probe-${access}`, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      results[access] = `OK: ${blob.url.slice(0, 60)}`;
      await del(blob.url).catch(() => {});
    } catch (err) {
      results[access] = `FAIL: ${String(err).slice(0, 120)}`;
    }
  }

  return NextResponse.json(results);
}
