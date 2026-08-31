// GET /api/admin/questions — the Question Bank browser API (22 Aug 2026).
// Adrian's phone-first replacement for digging through Dropbox PDFs: search the
// 26k-question bank, open any question WITH its worked solution, or reconstruct
// a whole paper in reading order. ADMIN ONLY — solutions never leave admin auth.
//
// Modes (all GET, discriminated by params):
//   ?id=<uuid>                                  → one question, full detail incl. solution
//   ?school=&year=&level=&paper=&exam_type=     → the whole paper, questions in natural order
//   ?papers=1[&level=&year=&q=]                 → the papers index (grouped, with counts)
//   ?q=&level=&year=&school=&topic=&hasFigure=  → search cards (paginated via offset)
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { imgSrc, isPlausibleImagePath, cropUrls } from '@/lib/kiosk-worksheet-images';
import { compareQnum, excerptText, searchTerms, normalizeForSearch } from '@/lib/qb-browser';
import { flattenParts, type Part } from '@/lib/kiosk-worksheet-images';
import { renderBotWorksheetPDF, type BotWorksheetQuestion } from '@/lib/render-bot-worksheet';
import { renderSolutionsPDF, type SolutionsItem, type SolutionsPart } from '@/lib/render-solutions-pdf';
import { rollupSolution } from '@/lib/solution-rollup';
import { renderPaperPDF, PAPER_PDF_RENDER_VERSION, type PaperPdfQuestion } from '@/lib/render-paper-pdf';
import { createHash } from 'crypto';
import { assessCoverage, answerKeyLines, type AnswerPart } from '@/lib/paper-reconstruction';
import { KIOSK_LEVELS } from '@/lib/kiosk-session';
import { put } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';
import { cleanScan } from '@/lib/figure-clean';

export const runtime = 'nodejs';
export const maxDuration = 60; // the worksheet action renders a Puppeteer PDF

type Row = Record<string, unknown>;

const LIST_COLUMNS =
  'id, question_text, total_marks, school, year, paper, exam_type, question_number, level, topics, has_image, ai_generated, figure_url, image_url';

/** Every image the ADMIN should see — including watermark-flagged ones (badged client-side). */
function resolveImages(row: Row, cap = 6): string[] {
  const urls: string[] = [];
  if (typeof row.figure_url === 'string' && row.figure_url) urls.push(row.figure_url);
  for (const u of cropUrls((row.image_url as string | null) ?? null)) urls.push(u);
  if (!urls.length && Array.isArray(row.images)) {
    for (const p of row.images) if (isPlausibleImagePath(p)) urls.push(imgSrc(p));
  }
  return [...new Set(urls)].slice(0, cap);
}

/** The bucket object name behind a stored figure value (a full public URL or a
 *  bare `question_images/x.png` path), or null if it isn't in our bucket. */
function storageObjectName(stored: string): string | null {
  const i = stored.lastIndexOf('question_images/');
  if (i === -1) return null;
  const name = stored.slice(i + 'question_images/'.length).split('?')[0];
  return name && !name.includes('..') ? name : null;
}

/** The STORED value behind a public figure URL on this row, or null when that
 *  URL is not one of the question's STEM figures (part figures are not ours to
 *  edit here — they live inside the parts jsonb). */
function figurePathOnRow(row: Row, publicUrl: string): string | null {
  if (typeof row.figure_url === 'string' && row.figure_url && row.figure_url === publicUrl) return row.figure_url;
  if (typeof row.image_url === 'string' && row.image_url) {
    try {
      const arr = JSON.parse(row.image_url);
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          const pth = entry && typeof entry === 'object' ? (entry as { url?: unknown }).url : entry;
          if (isPlausibleImagePath(pth) && imgSrc(pth as string) === publicUrl) return pth as string;
        }
      }
    } catch { /* unparseable image_url */ }
  }
  return null;
}

/** The column patch that swaps one stem figure for a new bucket path. Returns
 *  an empty object when the URL matched nothing, so callers can fail closed. */
function repointFigure(row: Row, oldPublicUrl: string, newPath: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (typeof row.figure_url === 'string' && row.figure_url === oldPublicUrl) patch.figure_url = imgSrc(newPath);
  if (typeof row.image_url === 'string' && row.image_url) {
    try {
      const arr = JSON.parse(row.image_url);
      if (Array.isArray(arr)) {
        const next = arr.map((entry: unknown) => {
          const pth = entry && typeof entry === 'object' ? (entry as { url?: unknown }).url : entry;
          if (!isPlausibleImagePath(pth) || imgSrc(pth as string) !== oldPublicUrl) return entry;
          return entry && typeof entry === 'object' ? { ...(entry as object), url: newPath } : newPath;
        });
        if (JSON.stringify(next) !== JSON.stringify(arr)) patch.image_url = JSON.stringify(next);
      }
    } catch { /* unparseable image_url */ }
  }
  return patch;
}

/** The one-line card excerpt. Plenty of papers (the GCE ones especially) carry
 *  an EMPTY question_text with the whole question living in `parts` — those
 *  cards used to render blank, which read as "the question is missing". Fall
 *  back to the first part that has text so no card is ever wordless. */
function cardExcerpt(row: Row): string {
  const stem = excerptText(row.question_text as string);
  if (stem) return stem;
  const firstPartText = (function walk(list: unknown): string {
    if (!Array.isArray(list)) return '';
    for (const pt of list) {
      if (!pt || typeof pt !== 'object') continue;
      const o = pt as { label?: unknown; text?: unknown; subparts?: unknown };
      if (typeof o.text === 'string' && o.text.trim()) {
        return `${typeof o.label === 'string' && o.label ? `${o.label} ` : ''}${o.text}`;
      }
      const deeper = walk(o.subparts);
      if (deeper) return deeper;
    }
    return '';
  })(row.parts);
  return excerptText(firstPartText);
}

/** Part image paths → public URLs, recursively, so the client renders them directly. */
function resolveParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return [];
  return parts.map((pt) => {
    if (!pt || typeof pt !== 'object') return pt;
    const o = { ...(pt as Record<string, unknown>) };
    for (const k of ['image_url', 'image_url_after', 'solution_image'] as const) {
      if (typeof o[k] === 'string' && o[k] && !/^https?:/i.test(o[k] as string) && isPlausibleImagePath(o[k])) {
        o[k] = imgSrc(o[k] as string);
      }
    }
    if (o.subparts) o.subparts = resolveParts(o.subparts);
    // Solutions stay in — this is the ADMIN detail view; every other consumer
    // of parts (kiosk, worksheets) must keep using flattenParts, never this.
    return o;
  });
}

function card(row: Row) {
  return {
    id: row.id,
    excerpt: cardExcerpt(row),
    marks: row.total_marks ?? null,
    school: row.school ?? null,
    year: row.year ?? null,
    paper: row.paper ?? null,
    examType: row.exam_type ?? null,
    qnum: row.question_number ?? null,
    level: row.level ?? null,
    topics: Array.isArray(row.topics) ? row.topics.slice(0, 3) : [],
    hasFigure: row.has_image === true || !!row.figure_url,
    aiGenerated: row.ai_generated === true,
    thumb: resolveImages(row, 1)[0] ?? null,
  };
}

/** Bucket object names with an OPEN redraw flag, for these questions. Fails
 *  open: a flags outage costs the 🚩 highlight, never the question itself. */
async function openFlagPaths(
  supa: ReturnType<typeof getSupabaseAdmin>, questionIds: string[],
): Promise<Set<string>> {
  if (!questionIds.length) return new Set();
  try {
    const { data } = await supa.from('figure_flags')
      .select('path').eq('status', 'open').in('question_id', questionIds);
    return new Set(((data ?? []) as { path: string }[]).map(r => r.path));
  } catch { return new Set(); }
}

/** How deep the figure undo/redo stacks are. Read straight off gen_meta — no
 *  extra query — so every detail payload can light its own buttons. */
function historyDepth(row: Row): { canUndo: number; canRedo: number } {
  const h = (row.gen_meta && typeof row.gen_meta === 'object'
    ? (row.gen_meta as Record<string, unknown>).figure_history : null) as Record<string, unknown> | null;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return { canUndo: len(h?.undo), canRedo: len(h?.redo) };
}

/** One question, everything the detail panel shows.
 *  `flagged` holds bucket object NAMES already flagged for redraw; the caller
 *  fetches them in bulk so opening a paper stays one query, not one per page. */
function detail(row: Row, flagged: Set<string> = new Set()) {
  const images = resolveImages(row);
  return {
    ...card(row),
    ...historyDepth(row),
    flaggedFigures: images.filter((u) => {
      const n = storageObjectName(u);
      return !!n && flagged.has(n);
    }),
    questionMd: row.question_text ?? '',
    parts: resolveParts(row.parts),
    solution: row.solution ?? null,
    answer: row.answer ?? null,
    difficulty: row.difficulty ?? null,
    sourceFile: row.source_file ?? null,
    watermarkStatus: row.image_watermark_status ?? null,
    images,
    solutionImages: Array.isArray(row.solution_images)
      ? row.solution_images.filter(isPlausibleImagePath).map(imgSrc).slice(0, 6)
      : [],
  };
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  const p = req.nextUrl.searchParams;

  // ── one question, full detail ──────────────────────────────────────────────
  const id = p.get('id');
  if (id) {
    const { data: row, error } = await supa
      .from('questions')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !row) return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
    return NextResponse.json({ question: detail(row, await openFlagPaths(supa, [id])) });
  }

  // ── a whole paper, in reading order ───────────────────────────────────────
  const school = p.get('school');
  const year = p.get('year');
  if (school && year && !p.get('papers') && !p.get('q') && p.get('paperView') === '1') {
    // `details=1` returns every question in full so the client can hold the
    // whole paper in memory — opening a question is then instant instead of a
    // round trip per tap. A paper is a few dozen questions, so this stays small.
    // The select stays ONE literal: supabase-js parses it at the type level and
    // a ternary widens it to `string`, losing the row type (same trap as
    // lib/portal-marking.ts). Fetch whole rows, choose the SHAPE below.
    const withDetails = p.get('details') === '1';
    let q = supa
      .from('questions')
      .select('*')
      .is('deleted_at', null)
      .eq('school', school)
      .eq('year', Number(year));
    const level = p.get('level');
    const paper = p.get('paper');
    const examType = p.get('exam_type');
    if (level) q = q.eq('level', level);
    if (paper) q = q.eq('paper', paper);
    if (examType) q = q.eq('exam_type', examType);
    const { data, error } = await q.limit(120);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []).sort((a, b) => compareQnum(a.question_number as string, b.question_number as string));
    const flagged = withDetails ? await openFlagPaths(supa, rows.map(r => r.id as string)) : new Set<string>();
    return NextResponse.json({
      paper: { school, year: Number(year), level, paper, examType },
      questions: withDetails ? rows.map(r => detail(r as Row, flagged)) : rows.map(r => card(r as Row)),
    });
  }

  // ── the papers index ──────────────────────────────────────────────────────
  // Served by the `paper_index` VIEW: the grouping is one database aggregate
  // (milliseconds) instead of pulling 26k question rows a thousand at a time
  // and grouping in JS — that cost 14 SECONDS on every cold cache. Filters push
  // down to the query, and there is no cache to go stale: a freshly ingested
  // paper shows up on the next tap.
  if (p.get('papers') === '1') {
    const level = p.get('level');
    const year = p.get('year');
    const filter = (p.get('q') || '').trim();
    // select('*') so the coverage columns (marks_total/numbered, added to the
    // view 2026-08-26) ride along, and the index still renders counts-only if
    // the view is ever recreated without them — no column-list error to hit.
    let pq = supa.from('paper_index').select('*');
    if (level) pq = pq.eq('level', level);
    if (year) pq = pq.eq('year', Number(year));
    if (filter) pq = pq.ilike('school', `%${filter.replace(/[%_]/g, '')}%`);
    const { data, error } = await pq.order('year', { ascending: false }).order('school').limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const papers = ((data ?? []) as Row[]).map(r => {
      const count = Number(r.count) || 0;
      const marksTotal = typeof r.marks_total === 'number' ? r.marks_total : null;
      const assessed = marksTotal != null
        ? assessCoverage(marksTotal, count, r.level as string | null)
        : null;
      return {
        school: r.school as string,
        year: r.year as number,
        level: r.level as string,
        paper: (r.paper as string | null) ?? null,
        examType: (r.exam_type as string | null) ?? null,
        count,
        marksTotal,
        numbered: typeof r.numbered === 'number' ? r.numbered : null,
        coverage: assessed
          ? { status: assessed.status, missingMarks: assessed.missingMarks, label: assessed.label }
          : null,
      };
    }).sort((a, b) =>
      b.year - a.year || a.school.localeCompare(b.school) || String(a.paper).localeCompare(String(b.paper)));
    return NextResponse.json({ papers: papers.slice(0, 400), total: papers.length });
  }

  // ── search cards ──────────────────────────────────────────────────────────
  let q = supa.from('questions').select(`${LIST_COLUMNS}, parts`).is('deleted_at', null);
  const level = p.get('level');
  if (level) q = q.eq('level', level);
  if (year) q = q.eq('year', Number(year));
  if (school) q = q.ilike('school', `%${school.replace(/[%_]/g, '')}%`);
  const topic = p.get('topic');
  if (topic) q = q.contains('topics', [topic]);
  if (p.get('hasFigure') === '1') q = q.eq('has_image', true);
  for (const term of searchTerms(p.get('q'))) {
    const norm = normalizeForSearch(term);
    if (!norm) continue;
    // search_text is the LaTeX-stripped generated column (trigram-indexed);
    // school still matches raw so "Dunman" works either way.
    q = q.or(`search_text.ilike.%${norm}%,school.ilike.%${term}%`);
  }
  const offset = Math.max(0, Number(p.get('offset')) || 0);
  const { data, error } = await q
    .order('year', { ascending: false, nullsFirst: false })
    .order('school', { ascending: true, nullsFirst: false })
    .range(offset, offset + 29);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: (data ?? []).map(card), offset, pageSize: 30 });
}


// ── POST: semantic/photo search + worksheet-from-basket ──────────────────────
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const supa = getSupabaseAdmin();

  // ♻️ Replace a stem-level figure (detail-panel button): the new image is
  // uploaded as a NEW bucket object — the original stays in question_images,
  // so rollback is just repointing image_url back — then whichever of
  // figure_url / image_url entries resolved to oldUrl is repointed at it.
  // Base64 in JSON keeps well under Vercel's 4.5MB body cap (client caps 3MB).
  // ── stem-figure edit history (undo / redo) ────────────────────────────────
  // Every figure edit is a repoint of two columns; the old bucket object is
  // never deleted, so a full undo only needs the PREVIOUS pair of column
  // values. They live under gen_meta.figure_history, merged in — gen_meta also
  // carries generation metadata on AI questions and must not be clobbered.
  // Capped at HISTORY_MAX so a much-edited figure can't grow the row forever.
  type FigState = { figure_url: string | null; image_url: string | null };
  type FigHistory = { undo: FigState[]; redo: FigState[] };
  const HISTORY_MAX = 10;

  /** Bucket objects this question's figures have already been cleaned INTO. */
  const readCleaned = (genMeta: unknown): string[] => {
    const v = genMeta && typeof genMeta === 'object'
      ? (genMeta as Record<string, unknown>).figure_cleaned : null;
    return Array.isArray(v) ? (v as string[]).filter(x => typeof x === 'string') : [];
  };

  const readHistory = (genMeta: unknown): FigHistory => {
    const h = (genMeta && typeof genMeta === 'object'
      ? (genMeta as Record<string, unknown>).figure_history : null) as Record<string, unknown> | null;
    const arr = (v: unknown): FigState[] => (Array.isArray(v) ? (v as FigState[]) : []);
    return { undo: arr(h?.undo), redo: arr(h?.redo) };
  };
  const withHistory = (genMeta: unknown, hist: FigHistory) => ({
    ...(genMeta && typeof genMeta === 'object' ? (genMeta as Record<string, unknown>) : {}),
    figure_history: { undo: hist.undo.slice(-HISTORY_MAX), redo: hist.redo.slice(-HISTORY_MAX) },
  });
  const stateOf = (row: Record<string, unknown>): FigState => ({
    figure_url: (row.figure_url as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
  });

  /** Re-read the question and hand the client a whole fresh detail — every
   *  figure action returns this, so the client never patches URLs by hand. */
  const freshDetail = async (id: string) => {
    const { data } = await supa.from('questions').select('*').eq('id', id).single();
    return data ? detail(data as Row) : null;
  };

  // ── ✨ clean: lift the white point on a faded scan ─────────────────────────
  // Photocopied graph paper arrives as ink on a grey haze. A white-point lift
  // sends the haze to pure white and stretches the ink down, WITHOUT touching
  // geometry — so unlike a redraw it can never change what the question asks.
  // Deliberately conservative: the default white point is derived from the
  // image's own background (its modal grey), never a fixed guess, because a
  // too-low point eats the light grid lines that a student reads values off.
  if (body.action === 'clean-figure') {
    const id = typeof body.id === 'string' ? body.id : '';
    const url = typeof body.url === 'string' ? body.url : '';
    if (!id || !url) return NextResponse.json({ error: 'id and url required' }, { status: 400 });

    const { data: row, error } = await supa.from('questions')
      .select('id, figure_url, image_url, gen_meta').eq('id', id).single();
    if (error || !row) return NextResponse.json({ error: 'question not found' }, { status: 404 });

    const srcPath = figurePathOnRow(row as Row, url);
    if (!srcPath) return NextResponse.json({ error: 'that figure is not on this question (stem-level figures only)' }, { status: 404 });

    const objName = storageObjectName(srcPath);
    if (!objName) return NextResponse.json({ error: 'that figure is not stored in our bucket, so it cannot be cleaned' }, { status: 400 });
    // A clean is NOT idempotent — the lift re-reads the histogram of its own
    // output, so a second pass would deepen the ink again and a third would
    // crush it. One clean per bucket object; ♻️ Replace or ↩ Undo to start over.
    const cleanedAlready = readCleaned(row.gen_meta);
    if (cleanedAlready.includes(objName)) {
      return NextResponse.json({ alreadyClean: true, question: await freshDetail(id) });
    }
    const dl = await supa.storage.from('question_images').download(objName);
    if (dl.error || !dl.data) return NextResponse.json({ error: `could not read the figure: ${dl.error?.message ?? 'missing'}` }, { status: 502 });
    const src = Buffer.from(await dl.data.arrayBuffer());

    let cleaned: Awaited<ReturnType<typeof cleanScan>>;
    try { cleaned = await cleanScan(src); }
    catch (e) { return NextResponse.json({ error: `clean failed: ${(e as Error).message}` }, { status: 500 }); }
    // Nothing to do, or nothing SAFE to do: change nothing at all — no bucket
    // object, no history entry, so the undo stack still points at the last
    // real edit. `area-tone` is the important one: a lift would wash out a
    // grey fill or a photograph.
    if (!cleaned.ok) {
      return NextResponse.json({ alreadyClean: true, skipReason: cleaned.reason, question: await freshDetail(id) });
    }

    const name = `${crypto.randomUUID()}.png`;
    const up = await supa.storage.from('question_images').upload(name, cleaned.out, { contentType: 'image/png' });
    if (up.error) return NextResponse.json({ error: `upload failed: ${up.error.message}` }, { status: 500 });

    const patch = repointFigure(row as Row, url, `question_images/${name}`);
    const hist = readHistory(row.gen_meta);
    const meta = withHistory(row.gen_meta, { undo: [...hist.undo, stateOf(row as Row)], redo: [] });
    const upd = await supa.from('questions')
      .update({ ...patch, gen_meta: { ...meta, figure_cleaned: [...cleanedAlready, name].slice(-40) } })
      .eq('id', id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    return NextResponse.json({ url: imgSrc(`question_images/${name}`), whitePoint: cleaned.whitePoint, question: await freshDetail(id) });
  }

  // ── ↩ undo / ↪ redo a figure edit ──────────────────────────────────────────
  if (body.action === 'undo-figure' || body.action === 'redo-figure') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const back = body.action === 'undo-figure';

    const { data: row, error } = await supa.from('questions')
      .select('id, figure_url, image_url, gen_meta').eq('id', id).single();
    if (error || !row) return NextResponse.json({ error: 'question not found' }, { status: 404 });

    const hist = readHistory(row.gen_meta);
    const from = back ? hist.undo : hist.redo;
    if (!from.length) return NextResponse.json({ error: back ? 'nothing to undo' : 'nothing to redo' }, { status: 400 });

    const target = from[from.length - 1];
    const rest = from.slice(0, -1);
    const other = [...(back ? hist.redo : hist.undo), stateOf(row as Row)];
    const next: FigHistory = back ? { undo: rest, redo: other } : { undo: other, redo: rest };

    const upd = await supa.from('questions').update({
      figure_url: target.figure_url,
      image_url: target.image_url,
      gen_meta: withHistory(row.gen_meta, next),
    }).eq('id', id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    return NextResponse.json({ question: await freshDetail(id) });
  }

  // ── 🚩 flag for redraw ────────────────────────────────────────────────────
  // A REDRAW is not something to do unattended: the figure library can prove a
  // drawing is internally consistent, but nothing can prove it still matches
  // the exam paper — only a person can. So this queues, it never redraws.
  // Same `figure_flags` table /admin/figures-bank already works from.
  if (body.action === 'flag-redraw') {
    const id = typeof body.id === 'string' ? body.id : '';
    const url = typeof body.url === 'string' ? body.url : '';
    const on = body.flag !== false;
    if (!id || !url) return NextResponse.json({ error: 'id and url required' }, { status: 400 });

    const { data: row, error } = await supa.from('questions')
      .select('id, figure_url, image_url').eq('id', id).single();
    if (error || !row) return NextResponse.json({ error: 'question not found' }, { status: 404 });
    const srcPath = figurePathOnRow(row as Row, url);
    if (!srcPath) return NextResponse.json({ error: 'that figure is not on this question' }, { status: 404 });
    const path = srcPath.replace(/^question_images\//, '');

    if (on) {
      const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : 'redraw requested from /admin/questions';
      const { error: e } = await supa.from('figure_flags').upsert({ path, question_id: id, status: 'open', note });
      if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    } else {
      const { error: e } = await supa.from('figure_flags').delete().eq('path', path);
      if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    }
    return NextResponse.json({ flagged: on });
  }

  if (body.action === 'replace-figure') {
    const id = typeof body.id === 'string' ? body.id : '';
    const oldUrl = typeof body.oldUrl === 'string' ? body.oldUrl : '';
    const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    const mediaType = typeof body.mediaType === 'string' && /^image\/(png|jpeg|webp)$/.test(body.mediaType)
      ? body.mediaType : 'image/png';
    if (!id || !oldUrl || !b64) return NextResponse.json({ error: 'id, oldUrl and imageBase64 required' }, { status: 400 });
    let bytes: Buffer;
    try { bytes = Buffer.from(b64, 'base64'); } catch { return NextResponse.json({ error: 'bad base64' }, { status: 400 }); }
    if (!bytes.length || bytes.length > 3_500_000) return NextResponse.json({ error: 'image must be under 3.5MB' }, { status: 413 });

    const { data: row, error } = await supa.from('questions')
      .select('id, figure_url, image_url, gen_meta').eq('id', id).single();
    if (error || !row) return NextResponse.json({ error: 'question not found' }, { status: 404 });

    // Work out the repoint BEFORE uploading, so a mismatch never orphans a
    // bucket object. newPath is decided up front and only written on success.
    const ext = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png';
    const name = `${crypto.randomUUID()}.${ext}`;
    const newPath = `question_images/${name}`;
    const patch = repointFigure(row as Row, oldUrl, newPath);
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'that figure is not on this question (stem-level figures only)' }, { status: 404 });
    }

    const up = await supa.storage.from('question_images').upload(name, bytes, { contentType: mediaType });
    if (up.error) return NextResponse.json({ error: `upload failed: ${up.error.message}` }, { status: 500 });
    // Snapshot the pre-replace columns so ↩ Undo can put the old figure back —
    // the old bucket object was never deleted, only unreferenced.
    const hist = readHistory(row.gen_meta);
    const upd = await supa.from('questions')
      .update({ ...patch, gen_meta: withHistory(row.gen_meta, { undo: [...hist.undo, stateOf(row as Row)], redo: [] }) })
      .eq('id', id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
    return NextResponse.json({ url: imgSrc(newPath), question: await freshDetail(id) });
  }

  // Smart search: the bot owns the embeddings + OCR (OpenAI key lives there);
  // we send text or a photo, get ranked ids back, and render the cards.
  if (body.action === 'semantic') {
    const botBase = process.env.BOT_BASE_URL;
    const botSecret = process.env.BOT_INTERNAL_SECRET;
    if (!botBase || !botSecret) return NextResponse.json({ error: 'semantic search not configured' }, { status: 503 });
    try {
      const r = await fetch(`${botBase}/api/mark-paper`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'qb-search',
          q: typeof body.q === 'string' ? body.q.slice(0, 2000) : undefined,
          imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
          mediaType: typeof body.mediaType === 'string' ? body.mediaType : undefined,
          level: typeof body.level === 'string' && body.level ? body.level : undefined,
          count: 15,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const d = await r.json();
      if (d.error) return NextResponse.json({ error: d.error }, { status: 502 });
      const ids: string[] = Array.isArray(d.ids) ? d.ids : [];
      if (!ids.length) return NextResponse.json({ results: [], extractedText: d.extractedText ?? null });
      const { data, error } = await supa.from('questions').select(`${LIST_COLUMNS}, parts`).in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
      const results = ids.map((qid) => byId.get(qid)).filter(Boolean).map((row) => card(row as Row));
      return NextResponse.json({ results, extractedText: d.extractedText ?? null });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  // AI-pick → model-curated selection from the eligibility-gated pool into the
  // basket. Same kiosk_pool source of truth as the kiosk worksheet, so every
  // pick is printable; Claude only chooses and orders, never invents ids —
  // returned ids are validated against the candidate set.
  if (body.action === 'ai-pick') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI pick not configured' }, { status: 503 });
    }
    const level = String(body.level || '');
    const topic = String(body.topic || '').trim();
    const count = Math.min(15, Math.max(1, parseInt(String(body.count ?? 10), 10) || 10));
    const instruction = String(body.instruction || '').slice(0, 300);
    const cfg = KIOSK_LEVELS[level];
    if (!cfg) return NextResponse.json({ error: 'unknown level' }, { status: 400 });
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 });

    const SEED: Record<string, string[]> = {
      EM: ['EM', 'S3_EM'], AM: ['AM', 'S3_AM'], JC2: ['JC', 'JC1', 'JC2'], S1: ['S1'], S2: ['S2'],
    };
    const poolRes = await supa.rpc('kiosk_pool', {
      p_tag_levels: SEED[level] ?? cfg.questionLevels,
      p_sg_level: cfg.topicsKey,
      p_topic: topic,
      p_difficulties: null,
    });
    if (poolRes.error) return NextResponse.json({ error: poolRes.error.message }, { status: 500 });

    type Cand = { id: string; marks: number | null; text: string };
    const candidates: Cand[] = [];
    for (const r of poolRes.data || []) {
      const flat = flattenParts((r.question_text as string) ?? '', (r.parts as Part[] | null) ?? null);
      const answer = flat.answer || ((r.answer as string | null) ?? '');
      if (!answer.trim()) continue;                       // must be printable with answers
      candidates.push({
        id: r.id as string,
        marks: (r.total_marks as number | null) ?? null,
        text: flat.text.replace(/\s+/g, ' ').slice(0, 420),
      });
    }
    if (candidates.length < count) {
      return NextResponse.json({ error: `only ${candidates.length} eligible questions for ${topic}` }, { status: 400 });
    }
    // Even sample down to 60 so the prompt stays small but the whole pool is
    // represented — a head-of-list slice would bias every pick to low ids.
    const MAXC = 60;
    const sampled = candidates.length <= MAXC
      ? candidates
      : Array.from({ length: MAXC }, (_, i) => candidates[Math.floor((i * candidates.length) / MAXC)]);

    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system:
        'You curate practice worksheets for a Singapore O-Level/JC math tutor. From the candidate ' +
        'questions, pick exactly the requested number for a coherent worksheet: ramp from easier to ' +
        'harder (use the mark counts and question complexity), cover a spread of distinct skills within ' +
        'the topic, avoid near-duplicate questions. Reply with ONLY a JSON object: ' +
        '{"picks":[{"id":"<uuid>","reason":"<≤12 words>"}]} in worksheet order. Use only ids from the list.',
      messages: [{
        role: 'user',
        content:
          `Topic: ${topic} (${cfg.label}). Pick ${count}.` +
          (instruction ? ` Tutor's instruction: ${instruction}` : '') +
          `\n\nCandidates:\n` +
          sampled.map(c => `id:${c.id} marks:${c.marks ?? '?'} :: ${c.text}`).join('\n'),
      }],
    });
    const raw = msg.content.find(b => b.type === 'text')?.text ?? '';
    let picks: { id: string; reason: string }[] = [];
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      if (Array.isArray(parsed.picks)) picks = parsed.picks;
    } catch {
      return NextResponse.json({ error: 'model returned unparseable picks' }, { status: 502 });
    }
    const valid = new Set(sampled.map(c => c.id));
    const seen = new Set<string>();
    const out = picks
      .filter(p => p && typeof p.id === 'string' && valid.has(p.id) && !seen.has(p.id) && seen.add(p.id))
      .slice(0, count)
      .map(p => ({ id: p.id, reason: String(p.reason || '').slice(0, 120) }));
    if (out.length === 0) return NextResponse.json({ error: 'model picked nothing usable' }, { status: 502 });
    return NextResponse.json({ picks: out, pool: candidates.length });
  }

  // Worksheet basket → house-style PDF of exactly the picked questions, in order.
  if (body.action === 'worksheet') {
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x))
      .slice(0, 20);
    if (!ids.length) return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    const { data, error } = await supa
      .from('questions')
      .select(`${LIST_COLUMNS}, parts, answer, images, image_watermark_status`)
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
    const warnings: string[] = [];
    const questions: BotWorksheetQuestion[] = [];
    for (const qid of ids) {
      const row = byId.get(qid) as Row | undefined;
      if (!row) { warnings.push(`question ${qid.slice(0, 8)} not found — skipped`); continue; }
      const flat = flattenParts((row.question_text as string) ?? '', (row.parts as Part[] | null) ?? null);
      // Printed sheets follow the pool's watermark rule: scan images ride only
      // when swept clean; engine figures (figure_url) are ours and always fine.
      const clean = row.image_watermark_status === 'clean';
      const figureUrl = typeof row.figure_url === 'string' && row.figure_url ? (row.figure_url as string) : null;
      const imageUrls = figureUrl ? [] : (clean ? resolveImages(row, 4) : []);
      if (row.has_image && !figureUrl && !clean) {
        warnings.push(`Q${row.question_number ?? '?'} (${row.school ?? 'bank'}): image not watermark-clean — printed without its figure`);
      }
      questions.push({
        id: qid,
        markdown: flat.text,
        marks: (row.total_marks as number | null) ?? null,
        figureUrl,
        imageUrls,
        answer: flat.answer || ((row.answer as string | null) ?? '') || '—',
      });
    }
    if (!questions.length) return NextResponse.json({ error: 'no usable questions' }, { status: 400 });
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 60) : 'Selected Questions';
    const dateLabel = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
    try {
      const pdf = await renderBotWorksheetPDF({
        title, levelLabel: 'Custom', topic: title, tier: null, dateLabel, questions, answers: body.answers === true,
        workspace: body.workspace !== false,
      });
      const blob = await put(`mark-paper/custom-worksheets/${Date.now()}.pdf`, pdf, {
        access: 'public', contentType: 'application/pdf', token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return NextResponse.json({ url: blob.url, count: questions.length, warnings });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'render failed' }, { status: 500 });
    }
  }

  // Worked-solutions PDF — a whole paper (in reading order) or the basket.
  // Teacher document: stems in grey, solutions in ink, [Ans:] fallback where
  // no worked solution is on file. Admin-authed above; solutions never leave
  // admin auth except inside this generated PDF.
  if (body.action === 'solutions-pdf') {
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x))
      .slice(0, 60);
    if (!ids.length) return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    const { data, error } = await supa
      .from('questions')
      .select('id, question_number, question_text, parts, solution, answer, solution_images')
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
    let missing = 0;
    const items: SolutionsItem[] = [];
    for (const qid of ids) {
      const row = byId.get(qid) as Row | undefined;
      if (!row) continue;
      // Rollup: since the 2026-08-27 canonicalisation the worked solution may
      // live only in parts[].solution — never read the top-level column alone.
      const solution = rollupSolution(row.solution, row.parts);
      const solutionImages = Array.isArray(row.solution_images)
        ? (row.solution_images as string[]).filter(isPlausibleImagePath).map(imgSrc).slice(0, 6)
        : [];
      if (!solution && !solutionImages.length) missing++;
      items.push({
        qnum: (row.question_number as string | null) ?? null,
        questionText: ((row.question_text as string | null) ?? '').trim(),
        solution,
        answer: ((row.answer as string | null) ?? '').trim(),
        parts: (row.parts as SolutionsPart[] | null) ?? null,
        solutionImages,
      });
    }
    if (!items.length) return NextResponse.json({ error: 'no questions found' }, { status: 400 });
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'Selected questions';
    try {
      const pdf = await renderSolutionsPDF({
        title, items,
        includeStems: body.includeQuestions !== false,
      });
      const blob = await put(`mark-paper/solutions-pdfs/${Date.now()}.pdf`, pdf, {
        access: 'public', contentType: 'application/pdf', token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return NextResponse.json({ url: blob.url, count: items.length, missingSolutions: missing });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'render failed' }, { status: 500 });
    }
  }

  // Reconstructed paper PDF — the whole (school, year, level, paper, exam_type)
  // group as a sit-able exam paper: questions in reading order with their
  // figures, optional marks-proportional working space (the create-exam-paper
  // skill's 2.5-lines-per-mark rule), optional answer key, optional original
  // numbering. Admin-only school papers for Adrian's own teaching use.
  if (body.action === 'paper-pdf') {
    const school = typeof body.school === 'string' ? body.school.trim() : '';
    const year = Number(body.year);
    if (!school || !Number.isFinite(year)) {
      return NextResponse.json({ error: 'school and year required' }, { status: 400 });
    }
    let q = supa
      .from('questions')
      .select('*')
      .is('deleted_at', null)
      .eq('school', school)
      .eq('year', year);
    const level = typeof body.level === 'string' && body.level ? body.level : null;
    const paper = typeof body.paper === 'string' && body.paper ? body.paper : null;
    const examType = typeof body.examType === 'string' && body.examType ? body.examType : null;
    if (level) q = q.eq('level', level);
    if (paper) q = q.eq('paper', paper);
    if (examType) q = q.eq('exam_type', examType);
    const { data, error } = await q.limit(120);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = ((data ?? []) as Row[]).sort((a, b) =>
      compareQnum(a.question_number as string | null, b.question_number as string | null));
    if (!rows.length) return NextResponse.json({ error: 'no questions in this paper' }, { status: 404 });

    const workingSpace = body.workingSpace !== false;
    const answerKey = body.answerKey !== false;
    const originalNumbering = body.originalNumbering !== false;

    const partHasImage = (list: Part[] | null | undefined): boolean =>
      (list ?? []).some((pt) =>
        isPlausibleImagePath(pt.image_url) || isPlausibleImagePath(pt.image_url_after) || partHasImage(pt.subparts));
    const warnings: string[] = [];
    const questions: PaperPdfQuestion[] = rows.map((row, i) => {
      const images = resolveImages(row);
      const parts = resolveParts(row.parts) as Part[];
      const missingFigure = row.has_image === true && !images.length && !partHasImage(parts);
      const storedNum = typeof row.question_number === 'string' ? row.question_number.trim() : '';
      if (missingFigure) warnings.push(`Q${storedNum || i + 1}: figure flagged but not in the bank — placeholder printed`);
      return {
        qnum: originalNumbering && storedNum ? storedNum : String(i + 1),
        marks: (row.total_marks as number | null) ?? null,
        stem: (row.question_text as string | null) ?? '',
        images,
        missingFigure,
        parts,
        answerLines: answerKeyLines(parts as AnswerPart[], (row.answer as string | null) ?? null),
      };
    });

    const marksTotal = rows.reduce((s, r) => {
      const m = r.total_marks as number | null;
      return s + (typeof m === 'number' && m > 0 ? m : 0);
    }, 0);
    const cov = assessCoverage(marksTotal, rows.length, level);
    const answerless = questions.filter((qq) => !qq.answerLines.length).length;
    if (answerKey && answerless > 0) warnings.push(`${answerless} question${answerless === 1 ? '' : 's'} with no stored answer — "—" in the key`);

    const autoTitle = [
      `${school} ${year}`, level,
      paper ? `Paper ${String(paper).replace(/^P/i, '')}` : null, examType,
    ].filter(Boolean).join(' · ');
    // Adrian can type his own title on the print card; blank falls back to the
    // auto title (which the UI shows as the input's placeholder).
    const titleBits = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : autoTitle;

    // Cache: the render is ~20s of Puppeteer, so same content + same options
    // returns the stored Blob URL instantly. The key hashes the FULL question
    // content (text, parts, marks, figures) plus options and the renderer
    // version — so editing a question, replacing a figure, or changing any
    // toggle misses naturally, with no manual invalidation to forget.
    const cacheKey = createHash('sha256').update(JSON.stringify({
      v: PAPER_PDF_RENDER_VERSION,
      opts: { workingSpace, answerKey, originalNumbering, title: titleBits },
      rows: rows.map((r) => [r.id, r.question_number, r.total_marks, r.question_text, r.parts, r.answer, r.image_url, r.figure_url, r.has_image]),
    })).digest('hex');
    const payload = {
      count: rows.length, marksTotal,
      coverage: { status: cov.status, missingMarks: cov.missingMarks, label: cov.label },
      warnings,
    };
    const { data: hit } = await supa.from('paper_pdf_cache').select('url').eq('key', cacheKey).maybeSingle();
    if (hit?.url) return NextResponse.json({ url: hit.url, cached: true, ...payload });

    try {
      const pdf = await renderPaperPDF({
        title: titleBits,
        metaLine: `${rows.length} question${rows.length === 1 ? '' : 's'} · ${marksTotal} marks`,
        questions,
        workingSpace,
        answerKey,
        coverageWarning: cov.label || null,
      });
      const blob = await put(`mark-paper/paper-pdfs/${Date.now()}.pdf`, pdf, {
        access: 'public', contentType: 'application/pdf', token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      await supa.from('paper_pdf_cache').upsert({ key: cacheKey, url: blob.url, meta: { title: titleBits, ...payload } });
      return NextResponse.json({ url: blob.url, cached: false, ...payload });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'render failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
