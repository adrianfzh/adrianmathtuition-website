// GET /api/tutor/boards/search?student=<id>&q=<words> — 🧑‍🏫 search your handwriting on a student's boards
// (SPEC-TUTOR-TOOLS §8; Adrian, 5 Nov 2026: "yes build search your handwriting"). First reads any page that
// is behind (at most MAX_READS_PER_SEARCH, lib/board-read), then finds every page with all the words.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { readBoard } from '@/lib/board-read';
import { MAX_READS_PER_SEARCH, pagesToRead, searchBoards, type PageText } from '@/lib/shared-board';
import type { RenderableBoard } from '@/lib/board-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = RenderableBoard & { id: string; title: string; updated_at: string; page_text: PageText };

export async function GET(req: Request) {
  const tutor = await currentTutor();
  if (!tutor) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const student = url.searchParams.get('student') || '';
  const q = (url.searchParams.get('q') || '').slice(0, 120);
  if (!/^[0-9a-f-]{36}$/i.test(student)) return NextResponse.json({ error: 'student is required' }, { status: 400 });
  const sb = getSupabaseAdmin();
  const load = async () => ((await sb.from('shared_boards').select('id, title, updated_at, pages, tutor_ink, student_ink, stickers, page_text')
    .eq('tutor_id', tutor.id).eq('tutor_student_id', student).order('updated_at', { ascending: false }).limit(50)).data ?? []) as Row[];
  let rows = await load();
  // Catch up first: pages written since they were last read (newest boards first).
  let budget = MAX_READS_PER_SEARCH, readAny = false;
  for (const b of rows) {
    if (budget <= 0) break;
    const behind = pagesToRead(b, b.page_text ?? {}, Date.now(), 0).length;
    if (!behind) continue;
    const n = await readBoard(b.id, { gapMs: 0, max: Math.min(budget, 3) });
    budget -= Math.max(1, n); readAny = readAny || n > 0;
  }
  if (readAny) rows = await load();
  const behind = rows.reduce((n, b) => n + pagesToRead(b, b.page_text ?? {}, Date.now(), 0).length, 0);
  return NextResponse.json({ hits: searchBoards(rows, q), stillReading: behind });
}
