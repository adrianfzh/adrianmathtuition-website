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
import { compareQnum, excerptText, searchTerms } from '@/lib/qb-browser';

export const runtime = 'nodejs';

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
    if (typeof o.image_url === 'string' && o.image_url && !/^https?:/i.test(o.image_url) && isPlausibleImagePath(o.image_url)) {
      o.image_url = imgSrc(o.image_url);
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

// The papers index scans one light row per paper-tagged question; cache it —
// the bank changes a few times a day, the button gets tapped far more often.
let _papersCache: { at: number; rows: Row[] } | null = null;
const PAPERS_TTL = 10 * 60 * 1000;

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
    return NextResponse.json({
      question: {
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
      },
    });
  }

  // ── a whole paper, in reading order ───────────────────────────────────────
  const school = p.get('school');
  const year = p.get('year');
  if (school && year && !p.get('papers') && !p.get('q') && p.get('paperView') === '1') {
    let q = supa
      .from('questions')
      .select(LIST_COLUMNS)
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
    return NextResponse.json({ paper: { school, year: Number(year), level, paper, examType }, questions: rows.map(card) });
  }

  // ── the papers index ──────────────────────────────────────────────────────
  if (p.get('papers') === '1') {
    if (!_papersCache || Date.now() - _papersCache.at > PAPERS_TTL) {
      const { data, error } = await supa
        .from('questions')
        .select('school, year, level, paper, exam_type')
        .is('deleted_at', null)
        .not('school', 'is', null)
        .not('year', 'is', null)
        .limit(40000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      _papersCache = { at: Date.now(), rows: data ?? [] };
    }
    const level = p.get('level');
    const year = p.get('year');
    const filter = (p.get('q') || '').toLowerCase();
    const groups = new Map<string, { school: string; year: number; level: string; paper: string | null; examType: string | null; count: number }>();
    for (const r of _papersCache.rows) {
      if (level && r.level !== level) continue;
      if (year && String(r.year) !== year) continue;
      if (filter && !String(r.school).toLowerCase().includes(filter)) continue;
      const key = `${r.school}|${r.year}|${r.level}|${r.paper ?? ''}|${r.exam_type ?? ''}`;
      const g = groups.get(key);
      if (g) g.count += 1;
      else groups.set(key, {
        school: r.school as string, year: r.year as number, level: r.level as string,
        paper: (r.paper as string | null) ?? null, examType: (r.exam_type as string | null) ?? null, count: 1,
      });
    }
    const papers = [...groups.values()].sort((a, b) =>
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
    q = q.or(`question_text.ilike.%${term}%,school.ilike.%${term}%`);
  }
  const offset = Math.max(0, Number(p.get('offset')) || 0);
  const { data, error } = await q
    .order('year', { ascending: false, nullsFirst: false })
    .order('school', { ascending: true, nullsFirst: false })
    .range(offset, offset + 29);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: (data ?? []).map(card), offset, pageSize: 30 });
}
