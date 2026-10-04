// GET /api/admin/library — the extracted-papers index (5 Oct 2026; /admin/library).
//   (no params)   → { summary, lines, builtAt, warnings }  (cached five minutes; ?fresh=1 rebuilds)
//   ?notes=id,id  → { notes: [{ file, status, notes }] } — the workers' notes for one paper, read on tap
// Admin cookie or bearer. Pure logic: lib/paper-index.ts; reads: lib/paper-index-store.ts.
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { loadPaperIndex, loadPaperNotes } from '@/lib/paper-index-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  try {
    const notes = url.searchParams.get('notes');
    if (notes !== null) {
      return NextResponse.json({ notes: await loadPaperNotes(notes.split(',').map(s => s.trim()).filter(Boolean)) });
    }
    const idx = await loadPaperIndex(url.searchParams.get('fresh') === '1');
    return NextResponse.json(idx, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
