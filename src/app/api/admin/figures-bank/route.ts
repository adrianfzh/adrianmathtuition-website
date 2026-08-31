// /api/admin/figures-bank — data plane for the bank-figure review grid
// (/admin/figures-bank). Distinct from /api/admin/figures, which reviews
// learning-unit SVGs for Fable regeneration (figure_regen_flags).
// Adrian eyeballs every bank figure and flags the ones needing rectification;
// flags land in Supabase `figure_flags` (path pk, status open|fixed) and form
// the work queue for targeted fixes (♻️ replace-figure, cleans, redraws).
//
//   GET  ?page=0&pageSize=60&level=AM        → page of questions-with-figures,
//        each with its stem figures, thumb URLs and flag state
//   GET  ?flagged=1                          → every open flag, with the figure
//        AS FLAGGED and the question's figure AS IT IS NOW
//   POST { path, questionId, flag: boolean } → set/clear a flag
//   POST { path, resolve: true }             → mark 'fixed' (releases the question)
//
// A flag records the bucket path at the moment it was raised. Cleaning a figure
// writes a NEW bucket object and repoints the question, so that path goes stale
// — which is useful, not a bug: it is the BEFORE. The serving gate keys on
// question_id, so a stale path never breaks the exclusion.
//
// ADMIN ONLY. Thumbs live at question_images/thumbs/<basename>.jpg (pre-built
// batch job); the client falls back to the full image if a thumb 404s.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { imgSrc, isPlausibleImagePath } from '@/lib/kiosk-worksheet-images';
import { inspectFigure } from '@/lib/figure-checks';

export const runtime = 'nodejs';

type Row = Record<string, unknown>;

function stemPaths(row: Row): string[] {
  const out: string[] = [];
  if (typeof row.figure_url === 'string' && row.figure_url && !/^https?:/i.test(row.figure_url)) out.push(row.figure_url);
  if (typeof row.image_url === 'string' && row.image_url) {
    try {
      const arr = JSON.parse(row.image_url);
      if (Array.isArray(arr)) {
        for (const e of arr) {
          const p = e && typeof e === 'object' ? (e as { url?: unknown }).url : e;
          if (isPlausibleImagePath(p) && !/^https?:/i.test(p)) out.push(p);
        }
      }
    } catch { /* unparseable */ }
  }
  return [...new Set(out.map((p) => p.replace(/^question_images\//, '')))];
}

function thumbUrl(path: string): string {
  return imgSrc(`question_images/thumbs/${path.replace(/\.[a-z]+$/i, '')}.jpg`);
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  const sp = req.nextUrl.searchParams;

  if (sp.get('flagged') === '1') {
    const { data: allFlags, error } = await supa
      .from('figure_flags').select('path, question_id, status, created_at')
      .eq('status', 'open').order('created_at', { ascending: true }).limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Paginated, because every item is MEASURED — the checks below need the
    // pixels, and 493 image fetches in one request is not a page load.
    const fPage = Math.max(0, Number(sp.get('page') ?? 0) || 0);
    const fSize = Math.min(40, Math.max(6, Number(sp.get('pageSize') ?? 20) || 20));
    const total = (allFlags ?? []).length;
    const flags = (allFlags ?? []).slice(fPage * fSize, fPage * fSize + fSize);
    const qids = [...new Set(flags.map((f) => f.question_id))];
    const meta: Record<string, Row> = {};
    if (qids.length) {
      for (let i = 0; i < qids.length; i += 200) {
        const { data: qs } = await supa
          .from('questions')
          .select('id, level, school, year, question_number, image_url, figure_url, question_text, has_image, image_watermark_status')
          .in('id', qids.slice(i, i + 200));
        for (const q of qs ?? []) meta[q.id as string] = q;
      }
    }

    const items = await Promise.all(flags.map(async (f) => {
      const q = meta[f.question_id as string];
      // What the question shows TODAY. Differs from f.path wherever the figure
      // has been cleaned or replaced since it was flagged.
      const now = q ? stemPaths(q as Row)[0] ?? null : null;
      let checks: Awaited<ReturnType<typeof inspectFigure>> | null = null;
      if (now) {
        try {
          const dl = await supa.storage.from('question_images').download(now.replace(/^question_images\//, ''));
          if (dl.data) checks = await inspectFigure(Buffer.from(await dl.data.arrayBuffer()));
        } catch { /* a measurement is evidence, not a precondition */ }
      }
      const stem = ((q?.question_text as string) ?? '').replace(/\s+/g, ' ').trim();
      return {
        path: f.path, qid: f.question_id, flagged: true,
        url: imgSrc(`question_images/${f.path}`), thumb: thumbUrl(f.path),
        currentUrl: now ? imgSrc(`question_images/${now}`) : null,
        changed: !!now && now !== f.path,
        level: q?.level ?? null, school: q?.school ?? null,
        year: q?.year ?? null, qnum: q?.question_number ?? null,
        stem: stem.slice(0, 700), stemEmpty: !stem,
        figureMissing: q?.has_image === true && !now,
        watermark: (q?.image_watermark_status as string | null) ?? null,
        checks,
      };
    }));

    return NextResponse.json({ items, total, page: fPage, pageSize: fSize, withheld: total });
  }

  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0);
  const pageSize = Math.min(120, Math.max(12, Number(sp.get('pageSize') ?? 60) || 60));
  const level = sp.get('level') || null;

  let cq = supa.from('questions')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('image_url', 'is', null).neq('image_url', '[]');
  if (level) cq = cq.eq('level', level);
  const { count } = await cq;

  let q = supa.from('questions')
    .select('id, level, school, year, question_number, image_url, figure_url')
    .is('deleted_at', null)
    .not('image_url', 'is', null).neq('image_url', '[]')
    .order('id')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (level) q = q.eq('level', level);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).flatMap((row) =>
    stemPaths(row as Row).map((path) => ({
      path, qid: row.id, level: row.level, school: row.school, year: row.year, qnum: row.question_number,
      url: imgSrc(`question_images/${path}`), thumb: thumbUrl(path), flagged: false,
    })));
  const paths = items.map((i) => i.path);
  if (paths.length) {
    const { data: flags } = await supa.from('figure_flags').select('path').in('path', paths).eq('status', 'open');
    const flaggedSet = new Set((flags ?? []).map((f) => f.path));
    for (const it of items) it.flagged = flaggedSet.has(it.path);
  }
  const { count: flaggedCount } = await supa
    .from('figure_flags').select('path', { count: 'exact', head: true }).eq('status', 'open');
  return NextResponse.json({ items, page, pageSize, totalQuestions: count ?? 0, flaggedCount: flaggedCount ?? 0 });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const path = typeof body.path === 'string' ? body.path.replace(/^question_images\//, '') : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId : '';
  if (!path || !questionId) return NextResponse.json({ error: 'path and questionId required' }, { status: 400 });
  // Resolve, don't delete: 'fixed' releases the question to every serving pool
  // (the gate excludes only status='open') AND keeps the record that it was
  // once looked at — which is how the 76 from 28 Aug are recorded.
  if (body.resolve === true) {
    const { error } = await supa.from('figure_flags')
      .update({ status: 'fixed', note: typeof body.note === 'string' ? body.note.slice(0, 500) : null })
      .eq('path', path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'fixed' });
  }
  if (body.flag === true) {
    const { error } = await supa.from('figure_flags')
      .upsert({ path, question_id: questionId, status: 'open' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supa.from('figure_flags').delete().eq('path', path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
