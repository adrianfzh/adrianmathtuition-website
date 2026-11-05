// 🧑‍🏫 The shared board — one door for the tutor (signed cookie + ?id=) and the student
// (the private link's key in the `x-board-key` header). SPEC-TUTOR-TOOLS §8.
//   GET  /api/board/open[?id=]                 the board: pages (signed, 6 h), both layers, the live channel
//   GET  /api/board/poll[?id=]                 the other side's layer + the page count (the slow fallback)
//   POST /api/board/ink     { id?, pages }     save MY layer (each side writes only its own)
//   GET  /api/board/upload-token[?id=]&filename=   a signed upload for a photo
//   POST /api/board/photo   { id?, url }       add that photo as the next page
//   GET  /api/board/pdf[?id=]                  the whole board as a PDF, both layers drawn in
//   GET  /api/board/versions[?id=]             earlier versions (when, why, how much each side had written)
//   POST /api/board/restore { id?, versionId, which: 'mine' | 'both' }   bring a version back ('both' = tutor only)
//   POST /api/board/page    { id?, paper }     add a template page (lib/shared-board BOARD_PAPERS)
//   POST /api/board/sticker { id?, change }    add / move / resize / remove a photo sticker
//   GET  /api/board/summary[?id=]              the student's summary, and whether the board changed since
//   POST /api/board/summary { id? }            make it (the STUDENT only; again only when the board changed)
import { NextResponse, after } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { getSupabaseAdmin } from '@/lib/supabase';
import { boardAccess, boardLink, channelName, type BoardAccess } from '@/lib/board-store';
import { createDownloadUrls, createUploadUrl, handinKey, keyFromUrl, safeExt } from '@/lib/student-files';
import { tutorRunStudentId } from '@/lib/tutor-portal';
import { validateInkPages, type InkPages } from '@/lib/student-ink';
import { applyStickerOp, BOARD_PAPERS, displayPageCount, lastInkedPage, pagesToRead, type PageText, MAX_BOARD_PAGES, MAX_VERSIONS, paperUrl, parseStickerOp, strokeCount, versionReason, withPhotoAppended, type Sticker, type VersionReason } from '@/lib/shared-board';
import { contentDisposition } from '@/lib/marked-pdf-filename';
import { renderBoardPage } from '@/lib/board-render';
import { readBoard } from '@/lib/board-read';
import { makeSummary } from '@/lib/board-summary-store';
import { summarySig, type BoardSummary } from '@/lib/board-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 120 s: a summary reads the board, then the writer thinks (up to two tries).
export const maxDuration = 120;

type Sb = ReturnType<typeof getSupabaseAdmin>;
/** Keep a snapshot of both layers (lib/shared-board versionReason says when), and only the newest MAX_VERSIONS. */
async function keepVersion(sb: Sb, boardId: string, tutor: InkPages, student: InkPages, reason: VersionReason) {
  const { error } = await sb.from('shared_board_versions').insert({
    board_id: boardId, tutor_ink: tutor ?? {}, student_ink: student ?? {},
    tutor_strokes: strokeCount(tutor), student_strokes: strokeCount(student), reason,
  });
  if (error) { console.warn('[board version]', error.message); return; }
  const { data: old } = await sb.from('shared_board_versions').select('id').eq('board_id', boardId)
    .order('created_at', { ascending: false }).range(MAX_VERSIONS, MAX_VERSIONS + 50);
  if (old?.length) await sb.from('shared_board_versions').delete().in('id', old.map(o => o.id as string));
}

/** A cheap fingerprint of the sticker list, so the poll can tell a screen that missed a live change. */
const stickerStamp = (l: Sticker[]) => l.map(x => `${x.id}:${x.x},${x.y},${x.w},${x.h}`).join('|');

/** The saved summary, and whether the board changed since it was made (a page written on, or read since). */
async function summaryState(boardId: string): Promise<{ summary: BoardSummary | null; stale: boolean }> {
  const { data } = await getSupabaseAdmin().from('shared_boards').select('pages, tutor_ink, student_ink, stickers, page_text, summary').eq('id', boardId).single();
  const b = data as { pages: { url: string | null }[]; tutor_ink: InkPages; student_ink: InkPages; stickers: Sticker[]; page_text: PageText; summary: BoardSummary | null };
  if (!b.summary) return { summary: null, stale: true };
  const behind = pagesToRead(b, b.page_text ?? {}, Date.now(), 0).length > 0;
  return { summary: b.summary, stale: behind || summarySig(b.page_text ?? {}) !== b.summary.sig };
}

const notFound = () => NextResponse.json({ error: 'This board is closed or the link has changed. Ask your tutor for the new link.' }, { status: 404 });
const idOf = (req: Request) => new URL(req.url).searchParams.get('id');
const layers = (a: BoardAccess) => a.role === 'tutor'
  ? { mine: a.board.tutor_ink, other: a.board.student_ink, otherAt: a.board.student_ink_at }
  : { mine: a.board.student_ink, other: a.board.tutor_ink, otherAt: a.board.tutor_ink_at };

async function signedPages(pages: { url: string | null }[]) {
  const keys = pages.map(p => keyFromUrl(p.url)).filter((k): k is string => !!k);
  const signed = new Map<string, string | null>();
  if (keys.length) for (const s of await createDownloadUrls(keys, 6 * 3600)) signed.set(s.key, s.url);
  return pages.map((p, index) => {
    const k = keyFromUrl(p.url);
    // `ref` = the stored reference: the page keeps its signed address while ref is unchanged (SharedBoard).
    return { index, ref: p.url, url: p.url == null ? null : k ? signed.get(k) ?? null : p.url };
  });
}

async function signedStickers(list: Sticker[]) {
  const keys = list.map(s => keyFromUrl(s.url)).filter((k): k is string => !!k);
  const signed = new Map<string, string | null>();
  if (keys.length) for (const x of await createDownloadUrls(keys, 6 * 3600)) signed.set(x.key, x.url);
  return list.map(s => { const k = keyFromUrl(s.url); return { ...s, ref: s.url, url: k ? signed.get(k) ?? null : s.url }; });
}
const ownFile = (url: string | undefined, studentId: string) => {
  const key = keyFromUrl(url);
  return !!key && key.startsWith(`handins/${tutorRunStudentId(studentId)}/`);
};

export async function GET(req: Request, ctx: { params: Promise<{ op: string }> }) {
  const { op } = await ctx.params;
  const a = await boardAccess(req, idOf(req));
  if (!a) return notFound();
  const { board, role } = a;
  const sb = getSupabaseAdmin();

  if (op === 'open') {
    const { data: st } = await sb.from('tutor_students').select('name').eq('id', board.tutor_student_id).maybeSingle();
    const { mine, other, otherAt } = layers(a);
    return NextResponse.json({
      id: board.id, role, title: board.title, tutorName: a.tutorName,
      studentName: role === 'tutor' ? (st as { name: string } | null)?.name ?? 'Student' : null,
      pages: await signedPages(board.pages ?? []),
      mine, other, otherAt,
      stickers: await signedStickers(board.stickers ?? []),
      channel: channelName(board),
      rt: { url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || null },
      ...(role === 'tutor' ? { link: boardLink(req, board.link_key), linkOn: board.link_on } : {}),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (op === 'poll') {
    // `since` = the other side's save time the page already has: unchanged → the layer is left out.
    const { other, otherAt } = layers(a);
    const since = new URL(req.url).searchParams.get('since');
    const same = !!since && since === otherAt;
    return NextResponse.json({ pageCount: (board.pages ?? []).length, stickerStamp: stickerStamp(board.stickers ?? []), otherAt, ...(same ? {} : { other }) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (op === 'upload-token') {
    const ext = safeExt(new URL(req.url).searchParams.get('filename') || '', ['jpg', 'jpeg', 'png', 'webp'], 'jpg');
    try {
      const u = await createUploadUrl(handinKey(tutorRunStudentId(board.tutor_student_id), ext));
      return NextResponse.json({ uploadUrl: u.uploadUrl, key: u.key, url: u.url });
    } catch (e) {
      console.error('[board upload-token]', (e as Error).message);
      return NextResponse.json({ error: 'Could not start the upload — try again.' }, { status: 503 });
    }
  }

  if (op === 'pdf') {
    const count = Math.max(1, displayPageCount((board.pages ?? []).length, board.tutor_ink, board.student_ink) - 1);
    const pdf = await PDFDocument.create();
    const PAGE_W = 595;
    for (let i = 0; i < count; i++) {
      const jpg = await renderBoardPage(board, i);
      const e = await pdf.embedJpg(jpg);
      const drawH = Math.round(PAGE_W * (e.height / e.width));
      pdf.addPage([PAGE_W, drawH]).drawImage(e, { x: 0, y: 0, width: PAGE_W, height: drawH });
    }
    const name = `${board.title.replace(/[^\w .()·-]+/g, ' ').trim() || 'board'}.pdf`;
    return new NextResponse(Buffer.from(await pdf.save()), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(name, 'attachment'), 'Cache-Control': 'private, no-store' },
    });
  }
  if (op === 'summary') {
    const s = await summaryState(board.id);
    return NextResponse.json(s, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (op === 'versions') {
    const { data } = await sb.from('shared_board_versions').select('id, created_at, reason, tutor_strokes, student_strokes')
      .eq('board_id', board.id).order('created_at', { ascending: false }).limit(MAX_VERSIONS);
    return NextResponse.json({ versions: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.json({ error: 'unknown' }, { status: 404 });
}

export async function POST(req: Request, ctx: { params: Promise<{ op: string }> }) {
  const { op } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { id?: string; pages?: unknown; url?: string; versionId?: string; which?: string; paper?: string; change?: unknown };
  const a = await boardAccess(req, body.id ?? idOf(req));
  if (!a) return notFound();
  const { board, role } = a;
  const sb = getSupabaseAdmin();

  if (op === 'ink') {
    const v = validateInkPages(body.pages);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    if (lastInkedPage(v.pages) >= MAX_BOARD_PAGES) return NextResponse.json({ error: 'too many pages' }, { status: 400 });
    // An earlier version of the board as it was just before this save, when it is time for one.
    const { data: last } = await sb.from('shared_board_versions').select('created_at').eq('board_id', board.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const before = role === 'tutor' ? board.tutor_ink : board.student_ink;
    const why = versionReason({ before: before ?? {}, after: v.pages, lastVersionAt: last ? Date.parse(last.created_at as string) : null, now: Date.now() });
    if (why) await keepVersion(sb, board.id, board.tutor_ink, board.student_ink, why);
    const now = new Date().toISOString();
    const col = role === 'tutor' ? { tutor_ink: v.pages, tutor_ink_at: now } : { student_ink: v.pages, student_ink_at: now };
    const { error } = await sb.from('shared_boards').update({ ...col, updated_at: now }).eq('id', board.id);
    if (error) { console.error('[board ink]', error.message); return NextResponse.json({ error: 'Could not save — it tries again with your next stroke.' }, { status: 500 }); }
    // Search your handwriting: read the pages that changed, once the writing on them has rested a moment (lib/board-read).
    after(async () => { try { await readBoard(board.id); } catch (e) { console.warn('[board read]', (e as Error).message); } });
    return NextResponse.json({ ok: true, at: now });
  }

  if (op === 'photo') {
    if (!ownFile(body.url, board.tutor_student_id)) return NextResponse.json({ error: 'bad photo' }, { status: 400 });
    // Read the newest pages and ink, so a photo never lands on a page someone just wrote on.
    const { data: fresh } = await sb.from('shared_boards').select('pages, tutor_ink, student_ink').eq('id', board.id).single();
    const f = fresh as { pages: { url: string | null }[]; tutor_ink: InkPages; student_ink: InkPages };
    const pages = withPhotoAppended(f.pages ?? [], body.url!, f.tutor_ink, f.student_ink);
    if (!pages) return NextResponse.json({ error: 'This board is full — start a new board.' }, { status: 409 });
    const { error } = await sb.from('shared_boards').update({ pages, updated_at: new Date().toISOString() }).eq('id', board.id);
    if (error) return NextResponse.json({ error: 'Could not add the photo — try again.' }, { status: 500 });
    return NextResponse.json({ ok: true, index: pages.length - 1 });
  }

  if (op === 'page') {
    const paper = BOARD_PAPERS.find(p => p.key === body.paper);
    if (!paper) return NextResponse.json({ error: 'unknown paper' }, { status: 400 });
    const { data: fresh } = await sb.from('shared_boards').select('pages, tutor_ink, student_ink').eq('id', board.id).single();
    const f = fresh as { pages: { url: string | null }[]; tutor_ink: InkPages; student_ink: InkPages };
    const pages = withPhotoAppended(f.pages ?? [], paperUrl(paper.key), f.tutor_ink, f.student_ink);
    if (!pages) return NextResponse.json({ error: 'This board is full — start a new board.' }, { status: 409 });
    const { error } = await sb.from('shared_boards').update({ pages, updated_at: new Date().toISOString() }).eq('id', board.id);
    if (error) return NextResponse.json({ error: 'Could not add the page — try again.' }, { status: 500 });
    return NextResponse.json({ ok: true, index: pages.length - 1 });
  }

  if (op === 'sticker') {
    const change = parseStickerOp(body.change);
    if (!change) return NextResponse.json({ error: 'bad sticker' }, { status: 400 });
    if (change.op === 'add' && !ownFile(change.sticker.url, board.tutor_student_id)) return NextResponse.json({ error: 'bad photo' }, { status: 400 });
    const { data: fresh } = await sb.from('shared_boards').select('stickers').eq('id', board.id).single();
    const next = applyStickerOp(((fresh as { stickers: Sticker[] } | null)?.stickers) ?? [], change);
    if (!next) return NextResponse.json({ error: change.op === 'add' ? 'This board has too many photos.' : 'That photo was removed.' }, { status: 409 });
    const { error } = await sb.from('shared_boards').update({ stickers: next, updated_at: new Date().toISOString() }).eq('id', board.id);
    if (error) return NextResponse.json({ error: 'Could not save the photo — try again.' }, { status: 500 });
    const mine = change.op === 'add' ? (await signedStickers([change.sticker]))[0] : null;
    return NextResponse.json({ ok: true, sticker: mine });
  }

  if (op === 'summary') {
    // For the student (Adrian, 6 Nov 2026: "for the student, not for the tutor"); the tutor only reads it.
    if (role !== 'student') return NextResponse.json({ error: 'Your student makes the summary from their board.' }, { status: 403 });
    const now = await summaryState(board.id);
    if (now.summary && !now.stale) return NextResponse.json({ summary: now.summary, stale: false });
    const made = await makeSummary(board.id).catch(e => { console.error('[board summary]', (e as Error).message); return null; });
    if (!made) return NextResponse.json({ error: 'Could not make your summary just now — try again in a minute.' }, { status: 502 });
    if ('empty' in made) return NextResponse.json({ error: 'There is not enough maths on the board yet for a summary.' }, { status: 409 });
    return NextResponse.json({ summary: made.summary, stale: false });
  }

  if (op === 'restore') {
    if (!body.versionId || !/^[0-9a-f-]{36}$/i.test(body.versionId)) return NextResponse.json({ error: 'version is required' }, { status: 400 });
    const both = body.which === 'both';
    if (both && role !== 'tutor') return NextResponse.json({ error: 'Only the tutor can bring back everyone\'s writing.' }, { status: 403 });
    const { data: ver } = await sb.from('shared_board_versions').select('tutor_ink, student_ink').eq('id', body.versionId).eq('board_id', board.id).maybeSingle();
    if (!ver) return NextResponse.json({ error: 'That version is gone.' }, { status: 404 });
    // The board as it is now becomes a version first — so this can be undone the same way.
    await keepVersion(sb, board.id, board.tutor_ink, board.student_ink, 'before-restore');
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (both || role === 'tutor') { patch.tutor_ink = ver.tutor_ink ?? {}; patch.tutor_ink_at = now; }
    if (both || role === 'student') { patch.student_ink = ver.student_ink ?? {}; patch.student_ink_at = now; }
    const { error } = await sb.from('shared_boards').update(patch).eq('id', board.id);
    if (error) return NextResponse.json({ error: 'Could not bring it back — try again.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'unknown' }, { status: 404 });
}
