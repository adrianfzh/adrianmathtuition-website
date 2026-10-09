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
import { figureWidthMm } from '@/lib/print-paper';
import { createHash } from 'crypto';
import { assessCoverage, answerKeyLines, type AnswerPart } from '@/lib/paper-reconstruction';
import { KIOSK_LEVELS } from '@/lib/kiosk-session';
import { storeBankFile } from '@/lib/bank-pdf-store';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { isOurBlobUrl } from '@/lib/blob-url';
import { paperFileNames } from '@/lib/paper-filename';
import Anthropic from '@anthropic-ai/sdk';
import { cleanScan } from '@/lib/figure-clean';
import { solutionImageAllowed, partImagePaths, type SolutionImageGate } from '@/lib/bank-question-markdown';
import { solutionImageGateFor } from '@/lib/solution-image-gate';
import { fromDetail, ansLine, questionMarkdown, type DetailRow } from '@/lib/pick-worksheet';
import { brandForLevels } from '@/lib/worksheet-brand';
import { applyPartMark, likelyDependents, normLabel, parsePartRef, studentRows, studentView } from '@/lib/part-syllabus';

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

/** Part image paths → public URLs, recursively, so the client renders them directly.
 *  `gate` (lib/solution-image-gate.ts) drops a part's `solution_image` when it
 *  is flagged, so the admin detail shows what a student's reveal would. */
function resolveParts(parts: unknown, gate?: SolutionImageGate, questionId?: string): unknown {
  if (!Array.isArray(parts)) return [];
  return parts.map((pt) => {
    if (!pt || typeof pt !== 'object') return pt;
    const o = { ...(pt as Record<string, unknown>) };
    if (typeof o.solution_image === 'string' && !solutionImageAllowed(o.solution_image, gate, questionId)) delete o.solution_image;
    for (const k of ['image_url', 'image_url_after', 'solution_image'] as const) {
      if (typeof o[k] === 'string' && o[k] && !/^https?:/i.test(o[k] as string) && isPlausibleImagePath(o[k])) {
        // A part's figure is sometimes stored as a JSON list — '["question_images/x.png"]'
        // (29 questions, e.g. GCE 2023 EM P1 Q22(b)'s Venn diagram). Treating that text as
        // one path glued the brackets into the URL and printed a broken image (26 Sep 2026).
        const first = partImagePaths(o[k]).find(isPlausibleImagePath);
        if (first) o[k] = imgSrc(first); else delete o[k];
      }
    }
    if (o.subparts) o.subparts = resolveParts(o.subparts, gate, questionId);
    // Solutions stay in — this is the ADMIN detail view; every other consumer
    // of parts (kiosk, worksheets) must keep using flattenParts, never this.
    return o;
  });
}

/** Part marks (lib/part-syllabus.ts) for the ADMIN detail: which parts students never see
 *  and why, and what they get instead. The parts themselves stay in the detail, greyed. */
function partSyllabusOf(row: Row) {
  const v = studentView(row);
  const canMark = Array.isArray(row.parts) && row.parts.some((p) => p && typeof p === 'object');
  if (!v.changed) return { canMark, hidden: [], needs: {}, marks: null, originalMarks: null, servable: true, notes: [] };
  const needs: Record<string, string[]> = {};
  const walk = (ps: unknown, prefix: string) => {
    if (!Array.isArray(ps)) return;
    ps.forEach((p, i) => {
      if (!p || typeof p !== 'object') return;
      const o = p as Record<string, unknown>;
      const key = `${prefix}${normLabel(o.label) || `#${i + 1}`}`;
      if (Array.isArray(o.needs) && o.needs.length) needs[key] = o.needs.map((n) => parsePartRef(n));
      walk(o.subparts, `${key}.`);
    });
  };
  walk(row.parts, '');
  return { canMark, hidden: v.hidden, needs, marks: v.marks, originalMarks: v.originalMarks, servable: v.servable, notes: v.notes };
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

/** The worked-solution items for a set of question rows, in the order given.
 *  Shared so solutions appended to a paper and the standalone solutions
 *  document can never drift apart. Also reports how many had nothing to show. */
function solutionItemsFrom(rows: Row[], gate?: SolutionImageGate): { items: SolutionsItem[]; missing: number } {
  let missing = 0;
  const items: SolutionsItem[] = [];
  for (const row of rows) {
    // Rollup: since the 2026-08-27 canonicalisation the worked solution may
    // live only in parts[].solution — never read the top-level column alone.
    const solution = rollupSolution(row.solution as string | null, row.parts);
    // A flagged (watermarked) solution scan stays out of the handout too.
    const solutionImages = Array.isArray(row.solution_images)
      ? (row.solution_images as string[]).filter(isPlausibleImagePath).filter((u) => solutionImageAllowed(u, gate, String(row.id ?? ''))).map(imgSrc).slice(0, 6)
      : [];
    if (!solution && !solutionImages.length) missing++;
    items.push({
      qnum: (row.question_number as string | null) ?? null,
      questionText: ((row.question_text as string | null) ?? '').trim(),
      solution,
      solutionFromParts: !(typeof row.solution === 'string' && row.solution.trim()),
      answer: ((row.answer as string | null) ?? '').trim(),
      parts: (row.parts as SolutionsPart[] | null) ?? null,
      solutionImages,
    });
  }
  return { items, missing };
}

/** Glue PDFs end to end. The solutions section is rendered by its OWN renderer
 *  and appended, rather than reimplemented inside the paper template — one
 *  solutions layout, used by both documents. */
async function concatPdfs(parts: Buffer[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const p of parts) {
    const doc = await PDFDocument.load(new Uint8Array(p));
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const pg of pages) out.addPage(pg);
  }
  return Buffer.from(await out.save());
}

/** Bucket object names with an OPEN redraw flag (kind='question' — solution-
 *  image flags belong to lib/solution-image-gate, not the redraw queue), for
 *  these questions. Fails open: a flags outage costs the 🚩 highlight, never
 *  the question itself. */
async function openFlagPaths(
  supa: ReturnType<typeof getSupabaseAdmin>, questionIds: string[],
): Promise<Set<string>> {
  if (!questionIds.length) return new Set();
  try {
    const { data } = await supa.from('figure_flags')
      .select('path').eq('status', 'open').eq('kind', 'question').in('question_id', questionIds);
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
function detail(row: Row, flagged: Set<string> = new Set(), gate?: SolutionImageGate) {
  const images = resolveImages(row);
  return {
    ...card(row),
    ...historyDepth(row),
    flaggedFigures: images.filter((u) => {
      const n = storageObjectName(u);
      return !!n && flagged.has(n);
    }),
    questionMd: row.question_text ?? '',
    partSyllabus: partSyllabusOf(row),
    parts: resolveParts(row.parts, gate, String(row.id ?? '')),
    solution: row.solution ?? null,
    answer: row.answer ?? null,
    difficulty: row.difficulty ?? null,
    sourceFile: row.source_file ?? null,
    watermarkStatus: row.image_watermark_status ?? null,
    images,
    solutionImages: Array.isArray(row.solution_images)
      ? row.solution_images.filter(isPlausibleImagePath).filter((u: string) => solutionImageAllowed(u, gate, String(row.id ?? ''))).map(imgSrc).slice(0, 6)
      : [],
  };
}

/** The bank levels one level filter reads. H2 Set papers are filed under the
 *  blueprint family 'JC' (publish.mjs; students reach them through
 *  PRINT_POOL_SCOPE), so a JC1 / JC2 filter shows them too — Adrian picked JC2
 *  and could not see H2 Set 1 (3 Oct 2026). */
function bankLevelsFor(level: string): string[] {
  return level === 'JC1' || level === 'JC2' ? [level, 'JC'] : [level];
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
    const [flagged, gate] = await Promise.all([openFlagPaths(supa, [id]), solutionImageGateFor([id])]);
    return NextResponse.json({ question: detail(row, flagged, gate) });
  }

  // ── several questions in full, in the order asked (the worksheet picker) ──
  const idsParam = p.get('ids');
  if (idsParam) {
    const ids = [...new Set(idsParam.split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/.test(s)))].slice(0, 60);
    if (!ids.length) return NextResponse.json({ error: 'ids= needs uuids' }, { status: 400 });
    const { data, error } = await supa.from('questions').select('*').in('id', ids).is('deleted_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // `solutions=all` (the worksheet picker, 9 Oct 2026 — Adrian: "there are no
    // diagrams for solutions?"): show every stored solution sketch. The gate
    // exists so a watermarked scan never reaches a STUDENT; the picker is
    // admin-only and prints questions, never solutions. Absent gate = all render.
    const ungated = p.get('solutions') === 'all';
    const [flagged, gate] = await Promise.all([openFlagPaths(supa, ids), ungated ? Promise.resolve(undefined) : solutionImageGateFor(ids)]);
    const byId = new Map((data ?? []).map((row) => [row.id as string, row as Row]));
    const questions = ids.map((qid) => byId.get(qid)).filter((r): r is Row => !!r).map((row) => detail(row, flagged, gate));
    const missing = ids.filter((qid) => !byId.has(qid));
    return NextResponse.json({ questions, missing });
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
    if (level) q = q.in('level', bankLevelsFor(level));
    if (paper) q = q.eq('paper', paper);
    if (examType) q = q.eq('exam_type', examType);
    const { data, error } = await q.limit(120);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []).sort((a, b) => compareQnum(a.question_number as string, b.question_number as string));
    const paperIds = rows.map(r => r.id as string);
    const flagged = withDetails ? await openFlagPaths(supa, paperIds) : new Set<string>();
    const gate = withDetails ? await solutionImageGateFor(paperIds) : undefined;
    return NextResponse.json({
      paper: { school, year: Number(year), level, paper, examType },
      questions: withDetails ? rows.map(r => detail(r as Row, flagged, gate)) : rows.map(r => card(r as Row)),
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
    if (level) pq = pq.in('level', bankLevelsFor(level));
    if (year) pq = pq.eq('year', Number(year));
    // Word by word (29 Sep 2026, the shared search box): a four-digit word is the year
    // when no year was picked, every other word must appear in the school's name —
    // so "crescent 2024" and "adrian" both find their papers.
    for (const w of filter.split(/\s+/).map(x => x.replace(/[%_,]/g, '')).filter(Boolean)) {
      if (/^(19|20)\d{2}$/.test(w) && !year) pq = pq.eq('year', Number(w));
      else pq = pq.ilike('school', `%${w}%`);
    }
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
    // One sitting's papers sit together, Paper 1 then Paper 2 (29 Sep 2026, Adrian: "should this
    // be in the order of the same year together, then paper 1 then paper 2 next?") — so level and
    // exam type (a Set's "Set 1", a school's Prelim / EOY) group BEFORE the paper number.
    }).sort((a, b) =>
      b.year - a.year || a.school.localeCompare(b.school)
      || String(a.level ?? '').localeCompare(String(b.level ?? ''))
      || String(a.examType ?? '').localeCompare(String(b.examType ?? ''), undefined, { numeric: true })
      || String(a.paper).localeCompare(String(b.paper), undefined, { numeric: true }));
    return NextResponse.json({ papers: papers.slice(0, 400), total: papers.length });
  }

  // ── search cards ──────────────────────────────────────────────────────────
  let q = supa.from('questions').select(`${LIST_COLUMNS}, parts`).is('deleted_at', null);
  const level = p.get('level');
  if (level) q = q.in('level', bankLevelsFor(level));
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
    return data ? detail(data as Row, undefined, await solutionImageGateFor([id])) : null;
  };

  // ── 🚫 one part out of syllabus (SPEC-PART-SYLLABUS.md) ─────────────────────
  // { action:'part-syllabus', id, part:'(b)(ii)', legacy:true|false, reason?, needs?:[…] }
  // Sets or clears the mark on ONE part inside `parts`; every other key on every
  // part is written back exactly as read. Students stop seeing the part at once.
  if (body.action === 'part-syllabus') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: row, error } = await supa.from('questions').select('id, parts, total_marks, answer, solution').eq('id', id).maybeSingle();
    if (error || !row) return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
    const res = applyPartMark(row as Row, {
      part: typeof body.part === 'string' ? body.part : '',
      legacy: typeof body.legacy === 'boolean' ? body.legacy : undefined,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
      needs: Array.isArray(body.needs) ? body.needs.filter((x): x is string => typeof x === 'string') : undefined,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    const upd = await supa.from('questions').update({ parts: res.parts }).eq('id', id).select('id');
    if (upd.error || !upd.data?.length) return NextResponse.json({ error: upd.error?.message || 'not saved' }, { status: 500 });
    const part = typeof body.part === 'string' ? body.part : '';
    return NextResponse.json({ ok: true, question: await freshDetail(id), check: body.legacy === true ? likelyDependents(row.parts, part) : [] });
  }

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

  // ── Describe-search (9 Oct 2026, Adrian: "can I search for questions based on
  // their skills? or even generically? put an appropriate model behind it … I
  // won't know the ids, just searching based on description") ─────────────────
  // The worksheet picker's search box. Pool = bank rows whose topic, sub-skill
  // name or text matches the description's words, plus the semantic index when
  // the bot is reachable; a model then reads the excerpts and returns the best
  // matches with a one-line reason each. Ids come only from the pool.
  if (body.action === 'describe-search') {
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'describe-search not configured' }, { status: 503 });
    const level = typeof body.level === 'string' ? body.level : '';
    const q = typeof body.q === 'string' ? body.q.trim().slice(0, 400) : '';
    const count = Math.min(20, Math.max(1, parseInt(String(body.count ?? 10), 10) || 10));
    const exclude = new Set((Array.isArray(body.exclude) ? body.exclude : []).filter((x): x is string => typeof x === 'string'));
    if (!q) return NextResponse.json({ error: 'describe what you want' }, { status: 400 });
    if (!level) return NextResponse.json({ error: 'level required' }, { status: 400 });

    const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'that', 'this', 'question', 'questions', 'involving', 'like', 'kind', 'some', 'type', 'about', 'using', 'which', 'where', 'into', 'from', 'more', 'hard', 'harder', 'easy', 'any', 'need', 'want', 'find', 'me']);
    const words = [...new Set(q.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 8);
    const stem = (w: string) => w.replace(/(ies|es|s)$/i, (m) => (m === 'ies' ? 'y' : ''));
    const levels = bankLevelsFor(level);
    const like = (t: string) => t.replace(/[%_,.()]/g, '');

    const pool = new Map<string, Row>();
    const add = (rows: Row[] | null | undefined) => { for (const r of rows ?? []) if (!exclude.has(r.id as string)) pool.set(r.id as string, r); };
    const base = () => supa.from('questions').select(`${LIST_COLUMNS}, parts`).is('deleted_at', null).in('level', levels).eq('national', false).eq('legacy_syllabus', false);

    const sgLevel = level.startsWith('JC') ? 'JC' : level.replace(/^S3_/, '');
    // 1. Sub-skill names/descriptions → their questions (the bank's own "skills").
    {
      const { data: sgs } = await supa.from('subgroups').select('id, name').eq('level', sgLevel)
        .or(words.flatMap((t) => [`name.ilike.%${like(stem(t))}%`, `description.ilike.%${like(stem(t))}%`]).join(',')).limit(30);
      const sgIds = (sgs ?? []).map((g) => g.id as number);
      if (sgIds.length) {
        const { data: links } = await supa.from('question_subgroups').select('question_id').in('subgroup_id', sgIds).limit(300);
        const qids = [...new Set((links ?? []).map((l) => l.question_id as string))].slice(0, 150);
        if (qids.length) { const { data } = await base().in('id', qids); add((data ?? []) as Row[]); }
      }
    }
    // 2. Plain text match on the stems.
    for (const w of words.slice(0, 4)) {
      const { data } = await base().ilike('search_text', `%${like(stem(w))}%`).order('year', { ascending: false }).limit(60);
      add((data ?? []) as Row[]);
    }
    // 3. The semantic index, when the bot is up (often sparse; never relied on).
    try {
      const botBase = process.env.BOT_BASE_URL, botSecret = process.env.BOT_INTERNAL_SECRET;
      if (botBase && botSecret) {
        const r = await fetch(`${botBase}/api/mark-paper`, { method: 'POST', headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: 'qb-search', q, level: level.replace(/^S3_/, ''), count: 15 }), signal: AbortSignal.timeout(12_000) });
        const d = await r.json();
        const ids: string[] = Array.isArray(d.ids) ? d.ids : [];
        if (ids.length) { const { data } = await base().in('id', ids); add((data ?? []) as Row[]); }
      }
    } catch { /* optional */ }

    const targeted = pool.size;
    // 4. Topic words → the topic's rows, LAST so the targeted hits above survive the sampling. `topics` is an array, so the topic NAMES
    //    are matched first (the sub-skill table lists them per level), then the
    //    rows are sampled evenly so the whole topic is represented.
    {
      const { data: tops } = await supa.from('subgroups').select('topic').eq('level', sgLevel)
        .or(words.map((t) => `topic.ilike.%${like(stem(t))}%`).join(',')).limit(200);
      const topics = [...new Set((tops ?? []).map((t) => t.topic as string).filter(Boolean))].slice(0, 6);
      for (const topic of topics) {
        const { data } = await base().overlaps('topics', [topic]).order('id').limit(400);
        const rows = (data ?? []) as Row[];
        const take = 90;
        add(rows.length <= take ? rows : Array.from({ length: take }, (_, i) => rows[Math.floor((i * rows.length) / take)]));
      }
    }
    const cands = [...pool.values()];
    if (!cands.length) return NextResponse.json({ results: [], pool: 0, note: 'nothing in the bank matched those words' });

    // Prompt-sized pool: the targeted hits (first in the map) stay whole, the
    // broad topic tail is sampled evenly to fill the rest.
    const MAXC = 150;
    const head = cands.slice(0, Math.min(cands.length, targeted));
    const tail = cands.slice(head.length);
    const room = Math.max(0, MAXC - head.length);
    const sampled = tail.length <= room ? [...head, ...tail] : [...head, ...Array.from({ length: room }, (_, i) => tail[Math.floor((i * tail.length) / room)])];
    const lines = sampled.map((r) => {
      const flat = flattenParts((r.question_text as string) ?? '', (r.parts as Part[] | null) ?? null);
      return `id:${r.id} marks:${r.total_marks ?? '?'} topics:${Array.isArray(r.topics) ? (r.topics as string[]).slice(0, 2).join('/') : ''} :: ${flat.text.replace(/\s+/g, ' ').replace(/<[^>]+>/g, '').slice(0, 380)}`;
    });
    const anthropic = new Anthropic();
    // Thinking off: with a 60k-token candidate list the model spent the whole
    // output budget thinking and never wrote the JSON (9 Oct 2026).
    const ask = (strict: boolean) => anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      system:
        (strict ? 'Output must be raw JSON only — no prose, no code fence. ' : '') +
        'You help a Singapore maths tutor find bank questions that match a description, for a revision worksheet. ' +
        'Read the candidate excerpts and choose the ones that genuinely fit the description — the skill, the setting, the ' +
        'difficulty asked for. Prefer variety of technique over near-duplicates. For H2 (JC) never pick a question whose point is ' +
        'a locus (loci are out of the 9758 syllabus). Reply with ONLY a JSON object: {"picks":[{"id":"<uuid>","reason":"<≤14 words, what in it matches>"}]} ' +
        'best match first. Use only ids from the list; fewer picks than asked is fine when few fit.',
      messages: [{ role: 'user', content: `Level: ${level}. Description: ${q}. Pick up to ${count}.\n\nCandidates:\n${lines.join('\n')}` }],
    });
    const parsePicks = (raw: string): { id: string; reason: string }[] | null => {
      const clean = raw.replace(/```(?:json)?/g, '');
      const start = clean.indexOf('{"picks"') >= 0 ? clean.indexOf('{"picks"') : clean.indexOf('{');
      try { const parsed = JSON.parse(clean.slice(start, clean.lastIndexOf('}') + 1)); return Array.isArray(parsed.picks) ? parsed.picks : null; } catch { return null; }
    };
    let msg = await ask(false);
    let rawText = msg.content.find((b) => b.type === 'text')?.text ?? '';
    let picks = parsePicks(rawText);
    if (!picks) { msg = await ask(true); rawText = msg.content.find((b) => b.type === 'text')?.text ?? ''; picks = parsePicks(rawText); }
    if (!picks) {
      const diag = `stop=${msg.stop_reason} blocks=${msg.content.map((b) => b.type).join(',')} in=${msg.usage?.input_tokens} out=${msg.usage?.output_tokens}`;
      return NextResponse.json({ error: `model returned unparseable picks (twice) [${diag}]: ${rawText.slice(0, 300).replace(/\s+/g, ' ')}` }, { status: 502 });
    }
    const byId = new Map(sampled.map((r) => [r.id as string, r]));
    const seen = new Set<string>();
    const results = picks
      .filter((pk) => pk && typeof pk.id === 'string' && byId.has(pk.id) && !seen.has(pk.id) && seen.add(pk.id))
      .slice(0, count)
      .map((pk) => ({ ...card(byId.get(pk.id) as Row), reason: String(pk.reason || '').slice(0, 140) }));
    return NextResponse.json({ results, pool: cands.length, words });
  }

  // Worksheet basket → house-style PDF of exactly the picked questions, in order.
  if (body.action === 'worksheet') {
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x))
      .slice(0, 40);
    if (!ids.length) return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    const { data, error } = await supa
      .from('questions')
      .select(`${LIST_COLUMNS}, parts, answer, images, image_watermark_status`)
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Part marks: a sheet is for students — every row through the one door (lib/part-syllabus.ts).
    const byId = new Map(studentRows((data ?? []) as Row[]).map((row) => [row.id as string, row]));
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
      // The plain sheet (the picker) prints from the picker's OWN model —
      // the same parts, marks and ONE [Ans:] line (shown/proved parts left
      // out, top-level answer as the fallback) as its Word file — so the two
      // files never disagree (a parent part stamped with its sub-parts' total
      // printed "[5]" over "[1] [1] [3]" through the kiosk flattening, 9 Oct 2026).
      const pick = body.style === 'plain' ? fromDetail(detail(row) as unknown as DetailRow) : null;
      const plainAns = pick ? ansLine(pick) : null;
      questions.push({
        id: qid,
        markdown: pick ? questionMarkdown(pick) : flat.text,
        marks: (row.total_marks as number | null) ?? null,
        figureUrl,
        imageUrls,
        answer: plainAns !== null ? plainAns : (flat.answer || ((row.answer as string | null) ?? '') || '—'),
      });
    }
    if (!questions.length) return NextResponse.json({ error: 'no usable questions' }, { status: 400 });
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'Selected Questions';
    const dateLabel = new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });
    // style:'plain' = the create-worksheet skill's regular format (navy title,
    // italic subtitle, one orange [Ans:] line per question) — the worksheet
    // picker's Done button. The branded masthead stays the default.
    const plain = body.style === 'plain';
    const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim().slice(0, 120) : '';
    // The brand header switch (off unless asked): the series comes from the
    // picked rows' levels, the same way the picker's Word file chooses it.
    const brandLv = body.brand === 'colour' || body.brand === 'mono' ? brandForLevels(ids.map((id) => (byId.get(id) as Row | undefined)?.level as string | null)) : null;
    if ((body.brand === 'colour' || body.brand === 'mono') && !brandLv) warnings.push('no brand design for these levels — printed in the regular format');
    try {
      const pdf = await renderBotWorksheetPDF({
        title, levelLabel: 'Custom', topic: title, tier: null, dateLabel, questions, answers: body.answers === true,
        workspace: body.workspace !== false,
        ...(plain ? { plain: { subtitle }, answersInline: body.answers !== false } : {}),
        ...(brandLv ? { brand: { mode: body.brand as 'colour' | 'mono', level: brandLv.level } } : {}),
      });
      const blob = await storeBankFile(`custom-worksheets/${Date.now()}.pdf`, pdf, 'application/pdf');
      return NextResponse.json({ url: blob.url, count: questions.length, warnings });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'render failed' }, { status: 500 });
    }
  }

  // Worked-solutions PDF — a whole paper (in reading order) or the basket.
  // Teacher document: stems in grey, solutions in ink, [Ans:] fallback where
  // no worked solution is on file. Admin-authed above; solutions never leave
  // admin auth except inside this generated PDF.
  // ── one zip of several built PDFs ────────────────────────────────────────
  // A browser will not reliably save six files from six clicks — it blocks the
  // repeats or buries them in prompts. One archive is one save, and it is also
  // the only place the files get PROPER NAMES: a Blob URL ends in a timestamp,
  // so a paper downloaded straight from the link arrives as 1756...pdf.
  if (body.action === 'zip-pdfs') {
    const raw = (Array.isArray(body.files) ? body.files : []).slice(0, 40) as { url?: unknown; label?: unknown }[];
    const files = raw
      .filter(f => typeof f?.url === 'string' && isOurBlobUrl(f.url as string))
      .map(f => ({ url: f.url as string, label: typeof f.label === 'string' ? f.label : 'paper' }));
    if (!files.length) return NextResponse.json({ error: 'no files to zip' }, { status: 400 });

    const names = paperFileNames(files.map(f => f.label));
    const zip = new JSZip();
    let added = 0;
    const failed: string[] = [];
    await Promise.all(files.map(async (f, i) => {
      try {
        const r = await fetch(f.url);
        if (!r.ok) { failed.push(names[i]); return; }
        zip.file(names[i], Buffer.from(await r.arrayBuffer()));
        added++;
      } catch { failed.push(names[i]); }
    }));
    if (!added) return NextResponse.json({ error: 'could not fetch any of the PDFs' }, { status: 502 });

    // A PDF is already compressed; level 1 keeps the archive quick and the
    // saving would be a rounding error at level 9.
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } });
    const zipName = typeof body.zipName === 'string' && body.zipName.trim()
      ? paperFileNames([body.zipName.trim()], '.zip')[0] : 'papers.zip';
    const blob = await storeBankFile(`paper-zips/${Date.now()}-${zipName}`, buf, 'application/zip');
    return NextResponse.json({ url: blob.url, count: added, failed, name: zipName });
  }

  if (body.action === 'solutions-pdf') {
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x))
      .slice(0, 60);
    if (!ids.length) return NextResponse.json({ error: 'ids[] required' }, { status: 400 });
    const { data, error } = await supa
      .from('questions')
      .select('id, question_number, question_text, parts, solution, answer, solution_images, total_marks')
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Part marks: picked questions' solutions print for students — the one door (lib/part-syllabus.ts).
    const byId = new Map(studentRows((data ?? []) as Row[]).map((row) => [row.id as string, row]));
    const ordered = ids.map(qid => byId.get(qid)).filter(Boolean) as Row[];
    const { items, missing } = solutionItemsFrom(ordered, await solutionImageGateFor(ids));
    if (!items.length) return NextResponse.json({ error: 'no questions found' }, { status: 400 });
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'Selected questions';
    try {
      const pdf = await renderSolutionsPDF({
        title, items,
        includeStems: body.includeQuestions !== false,
      });
      const blob = await storeBankFile(`solutions-pdfs/${Date.now()}.pdf`, pdf, 'application/pdf');
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
    const tReq = Date.now();
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
    if (level) q = q.in('level', bankLevelsFor(level));
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
    // Worked solutions appended after the paper (and after the answer key, when
    // both are asked for) — so one file is the paper, its answers and its
    // solutions in the order you would hand them out. Opt-in: a sit-able paper
    // with the solutions stapled on is not what you give a student.
    // The answer key ALONE (Adrian, 25 Sep 2026) — no questions, no solutions.
    const answersOnly = body.answersOnly === true;
    const withSolutions = !answersOnly && body.solutions === true;

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
        // A Set paper's authored figure with a stored print width (a graph-paper grid
        // whose squares must print at 1 cm) keeps its true size instead of the 80 mm
        // cap (Adrian, 28 Sep 2026: "graph too small. make it to scale").
        uncappedFigures: !!figureWidthMm((row.gen_meta as { figure?: { print_width_mm?: unknown } } | null)?.figure?.print_width_mm as string | number | null | undefined),
        figureWidthMm: (() => { const n = Number((row.gen_meta as { figure?: { width_mm?: unknown } } | null)?.figure?.width_mm); return Number.isFinite(n) && n > 0 && n <= 166 ? n : null; })(),
      };
    });

    const marksTotal = rows.reduce((s, r) => {
      const m = r.total_marks as number | null;
      return s + (typeof m === 'number' && m > 0 ? m : 0);
    }, 0);
    const cov = assessCoverage(marksTotal, rows.length, level);
    const answerless = questions.filter((qq) => !qq.answerLines.length).length;
    if ((answerKey || answersOnly) && answerless > 0) warnings.push(`${answerless} question${answerless === 1 ? '' : 's'} with no stored answer — "—" in the key`);

    const autoTitle = [
      `${school} ${year}`, level, examType,
      paper ? `Paper ${String(paper).replace(/^P/i, '')}` : null,
    ].filter(Boolean).join(' · ');
    // Adrian can type his own title on the print card; blank falls back to the
    // auto title (which the UI shows as the input's placeholder).
    const baseTitle = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : autoTitle;
    const titleBits = answersOnly ? `${baseTitle} — answers` : baseTitle;

    // Cache: the render is ~20s of Puppeteer, so same content + same options
    // returns the stored Blob URL instantly. The key hashes the FULL question
    // content (text, parts, marks, figures) plus options and the renderer
    // version — so editing a question, replacing a figure, or changing any
    // toggle misses naturally, with no manual invalidation to forget.
    const cacheKey = createHash('sha256').update(JSON.stringify({
      v: PAPER_PDF_RENDER_VERSION,
      opts: { workingSpace, answerKey, originalNumbering, withSolutions, answersOnly, title: titleBits },
      // The stored print width decides a grid's size, so it is part of the key (28 Sep 2026).
      rows: rows.map((r) => [r.id, r.question_number, r.total_marks, r.question_text, r.parts, r.answer, r.image_url, r.figure_url, r.has_image, (r.gen_meta as { figure?: { print_width_mm?: unknown } } | null)?.figure?.print_width_mm ?? null, (r.gen_meta as { figure?: { width_mm?: unknown } } | null)?.figure?.width_mm ?? null]),
    })).digest('hex');
    const payload = {
      count: rows.length, marksTotal,
      coverage: { status: cov.status, missingMarks: cov.missingMarks, label: cov.label },
      warnings,
    };
    const { data: hit } = await supa.from('paper_pdf_cache').select('url').eq('key', cacheKey).maybeSingle();
    if (hit?.url) return NextResponse.json({ url: hit.url, cached: true, ...payload });

    // Timings ride the response (5 Sep 2026): the cold/warm split told Adrian
    // where a 15s build went; these say where the remaining seconds go.
    const tStart = Date.now();
    const timings: Record<string, number> = { query_ms: tStart - tReq };
    try {
      let pdf = await renderPaperPDF({
        title: titleBits,
        metaLine: `${rows.length} question${rows.length === 1 ? '' : 's'} · ${marksTotal} marks`,
        questions,
        workingSpace,
        answerKey,
        answersOnly,
        // No "partial — N marks missing" banner on the printout (Adrian, 26 Sep 2026: "that's not
        // necessary"); the bank page still shows the coverage chip.
        coverageWarning: null,
      });
      timings.render_ms = Date.now() - tStart;
      if (withSolutions) {
        const { items, missing } = solutionItemsFrom(rows as Row[], await solutionImageGateFor((rows as Row[]).map(r => r.id as string)));
        if (missing) warnings.push(`${missing} question${missing === 1 ? '' : 's'} with no worked solution — the answer alone is printed`);
        const solPdf = await renderSolutionsPDF({
          title: `${titleBits} — worked solutions`,
          items,
          // The questions are already in this file; repeating each stem above
          // its solution would double the paper's length for nothing.
          includeStems: false,
        });
        pdf = await concatPdfs([pdf, solPdf]);
      }
      const tUp = Date.now();
      timings.solutions_ms = withSolutions ? tUp - tStart - timings.render_ms : 0;
      const blob = await storeBankFile(`paper-pdfs/${Date.now()}.pdf`, pdf, 'application/pdf');
      timings.upload_ms = Date.now() - tUp;
      timings.pdf_bytes = pdf.length;
      await supa.from('paper_pdf_cache').upsert({ key: cacheKey, url: blob.url, meta: { title: titleBits, ...payload } });
      timings.total_ms = Date.now() - tReq;
      return NextResponse.json({ url: blob.url, cached: false, ...payload, timings });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'render failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
