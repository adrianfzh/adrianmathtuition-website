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
import { renderPaperPDF, type PaperPdfQuestion } from '@/lib/render-paper-pdf';
import {
  paperKey, groupPapers, assessCoverage, answerKeyLines,
  type PaperKeyRow, type AnswerPart,
} from '@/lib/paper-reconstruction';
import { put } from '@vercel/blob';

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

/** Part image paths → public URLs, recursively, so the client renders them directly. */
function resolveParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return [];
  return parts.map((pt) => {
    if (!pt || typeof pt !== 'object') return pt;
    const o = { ...(pt as Record<string, unknown>) };
    for (const k of ['image_url', 'image_url_after'] as const) {
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
    excerpt: excerptText(row.question_text as string),
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

/** One question, everything the detail panel shows. */
function detail(row: Row) {
  return {
    ...card(row),
    questionMd: row.question_text ?? '',
    parts: resolveParts(row.parts),
    solution: row.solution ?? null,
    answer: row.answer ?? null,
    difficulty: row.difficulty ?? null,
    sourceFile: row.source_file ?? null,
    watermarkStatus: row.image_watermark_status ?? null,
    images: resolveImages(row),
    solutionImages: Array.isArray(row.solution_images)
      ? row.solution_images.filter(isPlausibleImagePath).map(imgSrc).slice(0, 6)
      : [],
  };
}

/**
 * Coverage sweep for the papers index: every groupable question's
 * (paper key, total_marks, question_number) — the aggregate PostgREST won't do
 * for us (aggregates are disabled on this project, and the paper_index view
 * only carries count). A minimal 7-column projection over ~26k rows fetched as
 * PARALLEL 1000-row pages lands in ~1s; sequential paging is the 14-second
 * trap the view was built to avoid. Cached per warm lambda — papers only
 * change on ingest, and the index merge fails soft if this sweep errors.
 */
const COVERAGE_TTL_MS = 120_000;
let coverageCache: { at: number; rows: PaperKeyRow[] } | null = null;

async function fetchCoverageRows(supa: ReturnType<typeof getSupabaseAdmin>): Promise<PaperKeyRow[]> {
  if (coverageCache && Date.now() - coverageCache.at < COVERAGE_TTL_MS) return coverageCache.rows;
  const base = () =>
    supa
      .from('questions')
      .select('school, year, level, paper, exam_type, total_marks, question_number')
      .is('deleted_at', null)
      .not('school', 'is', null)
      .not('year', 'is', null);
  const head = await supa
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('school', 'is', null)
    .not('year', 'is', null);
  if (head.error) throw new Error(head.error.message);
  const total = head.count ?? 0;
  const PAGE = 1000;
  const chunks = await Promise.all(
    Array.from({ length: Math.max(1, Math.ceil(total / PAGE)) }, async (_, i) => {
      const { data, error } = await base().order('id').range(i * PAGE, i * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as PaperKeyRow[];
    }),
  );
  const rows = chunks.flat();
  coverageCache = { at: Date.now(), rows };
  return rows;
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
    return NextResponse.json({ question: detail(row) });
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
    return NextResponse.json({
      paper: { school, year: Number(year), level, paper, examType },
      questions: rows.map(withDetails ? detail : card),
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
    let pq = supa.from('paper_index').select('school, year, level, paper, exam_type, count');
    if (level) pq = pq.eq('level', level);
    if (year) pq = pq.eq('year', Number(year));
    if (filter) pq = pq.ilike('school', `%${filter.replace(/[%_]/g, '')}%`);
    const { data, error } = await pq.order('year', { ascending: false }).order('school').limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Coverage (marks sum, numbered count, honest-gap status) rides along from
    // the cached sweep; the index still renders (counts only) if the sweep dies.
    let coverage: ReturnType<typeof groupPapers> | null = null;
    try { coverage = groupPapers(await fetchCoverageRows(supa)); } catch { coverage = null; }
    const papers = (data ?? []).map(r => {
      const g = coverage?.get(paperKey(r)) ?? null;
      const assessed = g ? assessCoverage(g.marksTotal, g.count, r.level as string | null) : null;
      return {
        school: r.school as string,
        year: r.year as number,
        level: r.level as string,
        paper: (r.paper as string | null) ?? null,
        examType: (r.exam_type as string | null) ?? null,
        count: Number(r.count) || 0,
        marksTotal: g?.marksTotal ?? null,
        numbered: g?.numbered ?? null,
        coverage: assessed
          ? { status: assessed.status, missingMarks: assessed.missingMarks, label: assessed.label }
          : null,
      };
    }).sort((a, b) =>
      b.year - a.year || a.school.localeCompare(b.school) || String(a.paper).localeCompare(String(b.paper)));
    return NextResponse.json({ papers: papers.slice(0, 400), total: papers.length });
  }

  // ── search cards ──────────────────────────────────────────────────────────
  let q = supa.from('questions').select(LIST_COLUMNS).is('deleted_at', null);
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
      const { data, error } = await supa.from('questions').select(LIST_COLUMNS).in('id', ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
      const results = ids.map((qid) => byId.get(qid)).filter(Boolean).map((row) => card(row as Row));
      return NextResponse.json({ results, extractedText: d.extractedText ?? null });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
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
      const solution = ((row.solution as string | null) ?? '').trim();
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

    const titleBits = [
      `${school} ${year}`, level,
      paper ? `Paper ${String(paper).replace(/^P/i, '')}` : null, examType,
    ].filter(Boolean).join(' · ');
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
      return NextResponse.json({
        url: blob.url, count: rows.length, marksTotal,
        coverage: { status: cov.status, missingMarks: cov.missingMarks, label: cov.label },
        warnings,
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'render failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
