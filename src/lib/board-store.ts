// 🧑‍🏫 The shared board — the database half (server only). Pure rules: lib/shared-board.ts.
//
// Who may open a board: the tutor who owns it (their signed cookie, lib/tutor-auth), or
// whoever holds its private link (the `x-board-key` header, compared in constant time,
// and only while the link is switched on). Every route goes through boardAccess().
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { currentTutor } from '@/lib/tutor-auth';
import { safeEqual } from '@/lib/safe-equal';
import type { BoardPage, BoardRole } from '@/lib/shared-board';
import type { InkPages } from '@/lib/student-ink';

export interface BoardRow {
  id: string; tutor_id: string; tutor_student_id: string; title: string; source_paper_id: string | null;
  pages: BoardPage[]; tutor_ink: InkPages; student_ink: InkPages;
  tutor_ink_at: string | null; student_ink_at: string | null;
  link_key: string; link_on: boolean; created_at: string; updated_at: string;
}
export const BOARD_COLUMNS = 'id, tutor_id, tutor_student_id, title, source_paper_id, pages, tutor_ink, student_ink, tutor_ink_at, student_ink_at, link_key, link_on, created_at, updated_at';

export const newLinkKey = () => randomBytes(18).toString('base64url');
const UUID = /^[0-9a-f-]{36}$/i;
const KEY = /^[A-Za-z0-9_-]{20,40}$/;

/** The live channel's name: unguessable, and it changes when the tutor makes a new link (so an old link stops hearing the board). */
export function channelName(board: Pick<BoardRow, 'id' | 'link_key'>): string {
  return 'board-' + createHash('sha256').update(`${board.id}:${board.link_key}`).digest('hex').slice(0, 32);
}

export type BoardAccess = { board: BoardRow; role: BoardRole; tutorName: string };

/** The tutor's own board by id, or the board whose link key the request carries. */
export async function boardAccess(req: Request, id?: string | null): Promise<BoardAccess | null> {
  const sb = getSupabaseAdmin();
  const key = req.headers.get('x-board-key') || '';
  if (key) {
    if (!KEY.test(key)) return null;
    const { data } = await sb.from('shared_boards').select(BOARD_COLUMNS).eq('link_key', key).maybeSingle();
    const b = data as BoardRow | null;
    if (!b || !b.link_on || !safeEqual(b.link_key, key)) return null;
    const { data: t } = await sb.from('tutor_accounts').select('display_name, active').eq('id', b.tutor_id).maybeSingle();
    if (!t || !(t as { active: boolean }).active) return null;
    return { board: b, role: 'student', tutorName: (t as { display_name: string }).display_name };
  }
  if (!id || !UUID.test(id)) return null;
  const tutor = await currentTutor();
  if (!tutor) return null;
  const { data } = await sb.from('shared_boards').select(BOARD_COLUMNS).eq('id', id).eq('tutor_id', tutor.id).maybeSingle();
  return data ? { board: data as BoardRow, role: 'tutor', tutorName: tutor.display_name } : null;
}

/** The public address of a board's link (the site the request came to, so the test site shares test links). */
export function boardLink(req: Request, key: string): string {
  return `${new URL(req.url).origin}/b/${key}`;
}
