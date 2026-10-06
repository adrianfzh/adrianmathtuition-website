// GET /api/agent/recrop/image?path=<flag path>&view=orig|grid|new — the pictures a cloud
// session looks at (7 Oct 2026, lib/recrop-door.ts): the original crop, the same with the
// 0–1000 grid the judge answers on, and the new picture once it has been cut. Only for a
// figure that is in `figure_recrops` — this is not an open proxy to the bucket.
import { NextRequest, NextResponse } from 'next/server';
import { recropDoor, sci, fetchScienceObject } from '@/lib/recrop-door';
import { judgeView } from '@/lib/figure-blemish';
import { forModel, flatPng } from '@/lib/figure-recrop-cut';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const path = String(sp.get('path') || ''); const view = String(sp.get('view') || 'orig');
  const denied = await recropDoor(req, 'image', { path, view });
  if (denied) return denied;
  if (!path || !['orig', 'grid', 'new'].includes(view)) return NextResponse.json({ error: 'path and view=orig|grid|new' }, { status: 400 });
  try {
    const { data: row } = await sci().from('figure_recrops').select('path, new_path').eq('path', path).maybeSingle();
    if (!row) return NextResponse.json({ error: 'not a figure in the re-crop list' }, { status: 404 });
    if (view === 'new' && !row.new_path) return NextResponse.json({ error: 'no new picture yet — call cut first' }, { status: 409 });
    const src = await flatPng(await fetchScienceObject(view === 'new' ? (row.new_path as string) : path));
    const out = await forModel(view === 'grid' ? await judgeView(src) : src);
    return new NextResponse(new Uint8Array(out), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
