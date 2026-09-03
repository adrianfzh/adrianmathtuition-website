// /api/admin/figures-bank — data plane for the bank-figure review grid
// (/admin/figures-bank). Distinct from /api/admin/figures, which reviews
// learning-unit SVGs for Fable regeneration (figure_regen_flags).
// Adrian eyeballs every bank figure and flags the ones needing rectification;
// flags land in Supabase `figure_flags` (path pk, status open|fixed) and form
// the work queue for targeted fixes (♻️ replace-figure, cleans, redraws).
// Since 2026-09-03 the same table also holds kind='solution' rows (watermarked
// SOLUTION images, served through lib/solution-image-gate.ts) — every read
// here filters kind='question' so a redraw session never receives one.
//
//   GET  ?page=0&pageSize=60&level=AM        → page of questions-with-figures,
//        each with its stem figures, thumb URLs and flag state
//   GET  ?flagged=1                          → every open flag, with the figure
//        AS FLAGGED and the question's figure AS IT IS NOW
//   GET  ?kind=solution                      → the SOLUTION VET LANE (below)
//   POST { path, questionId, flag: boolean } → set/clear a flag
//   POST { path, resolve: true }             → mark 'fixed' (releases the question)
//   POST { kind:'solution', action, … }      → the vet lane's five actions
//
// A flag records the bucket path at the moment it was raised. Cleaning a figure
// writes a NEW bucket object and repoints the question, so that path goes stale
// — which is useful, not a bug: it is the BEFORE. The serving gate keys on
// question_id, so a stale path never breaks the exclusion.
//
// ADMIN ONLY. Thumbs live at question_images/thumbs/<basename>.jpg (pre-built
// batch job); the client falls back to the full image if a thumb 404s.
//
// ── The solution vet lane (2026-09-03) ────────────────────────────────────────
// 152 solution images sit switched off as figure_flags kind='solution'
// status='held' (never 'open' — an open row of ANY kind drops the whole question
// out of the serving pools; 'held' blocks only in the render gate). Adrian:
// "i do want to see them and if approve, or amended, put them back into
// solutions." This lane is that surface. Putting an image back follows the
// binding write contract mirrored in lib/solution-image-apply.ts — new object,
// recursive ref swap, absence proof, clean-log row, THEN the flag flip.
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { imgSrc, isPlausibleImagePath } from '@/lib/kiosk-worksheet-images';
import { inspectFigure } from '@/lib/figure-checks';
import {
  replaceSolutionImageRefs, containsImageRef, partLabelFor, cleanedObjectKey,
} from '@/lib/solution-image-apply';

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

/* ── solution vet lane ──────────────────────────────────────────────────────── */

const BUCKET = 'question_images';
const VET_BATCH = 'admin-vet-lane';
/** Vercel hard-caps the request body at 4.5MB; leave room for the JSON envelope. */
const MAX_AMEND_BYTES = 3.5 * 1024 * 1024;

type Candidate = {
  url: string;
  /** From the sidecar written by the cleaning session. 'unknown' = no sidecar. */
  verdict: string;
  route: string | null;
  note: string | null;
  /** 'residue' | 'unverified' — EXPLICIT only. Never inferred from prose: a
   *  guessed hold_kind once labelled an uninspected image as inspected. */
  holdKind: string | null;
  holdReason: string | null;
};

const step = (name: string, message: string) =>
  NextResponse.json({ error: message, step: name }, { status: 500 });

/** Every candidate object name under candidates/, including the sub-prefixes a
 *  handful of flag paths carry (`solutions/<uuid>-1.png`). One list per prefix. */
async function listCandidateNames(supa: SupabaseClient, paths: string[]): Promise<Set<string>> {
  const prefixes = new Set<string>(['']);
  for (const p of paths) { const i = p.lastIndexOf('/'); if (i > 0) prefixes.add(p.slice(0, i)); }
  const names = new Set<string>();
  for (const pre of prefixes) {
    const { data } = await supa.storage.from(BUCKET).list(pre ? `candidates/${pre}` : 'candidates', { limit: 1000 });
    for (const o of data ?? []) if (o?.name) names.add(pre ? `${pre}/${o.name}` : o.name);
  }
  return names;
}

async function readSidecar(supa: SupabaseClient, path: string): Promise<Record<string, unknown>> {
  try {
    const dl = await supa.storage.from(BUCKET).download(`candidates/${path}.json`);
    if (!dl.data) return {};
    const parsed = JSON.parse(await dl.data.text());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch { return {}; }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function solutionLaneGet(supa: SupabaseClient, sp: URLSearchParams) {
  const { data: flags, error } = await supa
    .from('figure_flags').select('path, question_id, note, claimed_by, created_at')
    .eq('kind', 'solution').eq('status', 'held')
    .order('created_at', { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const all = flags ?? [];

  // One prefix listing per request — not one existence probe per card.
  const names = await listCandidateNames(supa, all.map((f) => f.path as string));
  const withCandidate = all.filter((f) => names.has(f.path as string)).length;

  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0);
  const pageSize = Math.min(60, Math.max(1, Number(sp.get('pageSize') ?? 20) || 20));
  const slice = all.slice(page * pageSize, page * pageSize + pageSize);

  const qids = [...new Set(slice.map((f) => f.question_id as string))];
  const meta: Record<string, Row> = {};
  if (qids.length) {
    const { data: qs } = await supa.from('questions')
      .select('id, level, school, year, paper, question_number, parts, solution_images, solution')
      .in('id', qids);
    for (const q of qs ?? []) meta[q.id as string] = q as Row;
  }

  const items = await Promise.all(slice.map(async (f) => {
    const path = f.path as string;
    const q = meta[f.question_id as string];
    let candidate: Candidate | null = null;
    if (names.has(path)) {
      const side = names.has(`${path}.json`) ? await readSidecar(supa, path) : {};
      candidate = {
        url: imgSrc(`${BUCKET}/candidates/${path}`),
        verdict: str(side.verdict) ?? 'unknown',
        route: str(side.route),
        note: str(side.note),
        holdKind: str(side.hold_kind),
        holdReason: str(side.hold_reason),
      };
    }
    return {
      path, qid: f.question_id,
      level: q?.level ?? null, school: q?.school ?? null, year: q?.year ?? null,
      paper: q?.paper ?? null, qnum: q?.question_number ?? null,
      partLabel: q ? partLabelFor(q, path) : null,
      note: (f.note as string | null) ?? null,
      claimedBy: (f.claimed_by as string | null) ?? null,
      liveUrl: imgSrc(`${BUCKET}/${path}`),
      candidateUrl: candidate?.url ?? null,
      candidate,
    };
  }));

  return NextResponse.json({ items, page, pageSize, totals: { held: all.length, withCandidate } });
}

/**
 * The binding write contract (lib/solution-image-apply.ts): NEW object → recursive
 * ref swap → absence proof on the whole re-read row → clean-log → flag flip.
 * Every failure past the upload reverts the row, so nothing is ever half-applied;
 * the uploaded object is left behind (inert — originals are never deleted either).
 */
async function applyCleanedSolutionImage(
  supa: SupabaseClient,
  o: { path: string; questionId: string; bytes: Buffer; contentType: string; note: string },
) {
  const { data: rows, error: readErr } = await supa.from('questions')
    .select('id, parts, solution_images, solution').eq('id', o.questionId).limit(1);
  if (readErr || !rows?.length) return step('read', readErr?.message ?? 'question row not found');
  const row = rows[0] as Row;
  const before = {
    parts: row.parts ?? null,
    solution_images: row.solution_images ?? null,
    solution: row.solution ?? null,
  };
  if (!containsImageRef(row, o.path)) {
    return step('locate', 'the old key is not in parts/solution_images/solution — nothing to replace');
  }

  const partLabel = partLabelFor(row, o.path);
  const sha8 = createHash('sha256').update(o.bytes).digest('hex').slice(0, 8);
  const ext = /jpe?g/i.test(o.contentType) ? 'jpg' : 'png';
  const dest = cleanedObjectKey(o.questionId, partLabel, sha8, ext);

  const up = await supa.storage.from(BUCKET).upload(dest, o.bytes, {
    contentType: o.contentType, upsert: false, cacheControl: '3600',
  });
  if (up.error) return step('upload', up.error.message);
  const newUrl = imgSrc(`${BUCKET}/${dest}`);

  const swap = replaceSolutionImageRefs(row, o.path, newUrl);
  if (!swap.replaced) return step('replace', 'no reference matched the old key');
  const patch = await supa.from('questions').update(swap.row).eq('id', o.questionId);
  if (patch.error) return step('patch', patch.error.message);

  const { data: fresh, error: reReadErr } = await supa.from('questions')
    .select('*').eq('id', o.questionId).limit(1);
  if (reReadErr || !fresh?.length || containsImageRef(fresh[0], o.path)) {
    await supa.from('questions').update(before).eq('id', o.questionId);
    return step('verify', 'the old key survived the re-read — the write was reverted');
  }

  const field = swap.fields.some((f) => f.startsWith('parts')) ? 'part'
    : swap.fields.some((f) => f.startsWith('solution_images')) ? 'solution_images' : 'solution';
  const log = await supa.from('figure_clean_log')
    .insert({ question_id: o.questionId, field, old_path: o.path, new_path: `${BUCKET}/${dest}`, batch: VET_BATCH })
    .select('id').single();
  if (log.error) {
    await supa.from('questions').update(before).eq('id', o.questionId);
    return step('clean_log', log.error.message);
  }

  const flag = await supa.from('figure_flags')
    .update({ status: 'fixed', note: o.note.slice(0, 500) })
    .eq('path', o.path).eq('kind', 'solution');
  if (flag.error) {
    await supa.from('questions').update(before).eq('id', o.questionId);
    if (log.data?.id) await supa.from('figure_clean_log').delete().eq('id', log.data.id);
    return step('flag', flag.error.message);
  }

  return NextResponse.json({
    ok: true, status: 'fixed', partLabel,
    newPath: `${BUCKET}/${dest}`, newUrl, replaced: swap.replaced, fields: swap.fields,
  });
}

async function noteOnly(supa: SupabaseClient, path: string, note: string, status?: 'fixed') {
  const patch: Record<string, unknown> = { note: note.slice(0, 500) };
  if (status) patch.status = status;
  const { error } = await supa.from('figure_flags').update(patch)
    .eq('path', path).eq('kind', 'solution');
  if (error) return step('flag', error.message);
  return NextResponse.json({ ok: true, status: status ?? 'held', note });
}

async function solutionLanePost(
  supa: SupabaseClient, body: Record<string, unknown>, path: string, questionId: string,
) {
  const action = typeof body.action === 'string' ? body.action : '';
  const extra = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
  const suffix = extra ? ` · ${extra}` : '';

  if (action === 'approve-as-is') {
    // The render gate serves 'fixed' — including at unjudged levels, where only
    // 'fixed' paths render at all. Nothing else to do: the image is fine as it is.
    return noteOnly(supa, path, `Adrian approved as-is${suffix}`, 'fixed');
  }
  if (action === 'keep-hidden') return noteOnly(supa, path, `kept hidden${suffix}`);
  if (action === 'redraw') return noteOnly(supa, path, 'redraw requested');

  if (action === 'approve-candidate') {
    const dl = await supa.storage.from(BUCKET).download(`candidates/${path}`);
    if (dl.error || !dl.data) return step('candidate', dl.error?.message ?? 'no cleaned candidate stored');
    const bytes = Buffer.from(await dl.data.arrayBuffer());
    if (!bytes.length) return step('candidate', 'the stored candidate is empty');
    const contentType = /jpe?g/i.test(dl.data.type ?? '') ? 'image/jpeg' : 'image/png';
    return applyCleanedSolutionImage(supa, {
      path, questionId, bytes, contentType, note: 'Adrian approved cleaned candidate',
    });
  }

  if (action === 'amend') {
    const b64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/^data:[^,]+,/, '') : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    if (!b64) return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
    if (!/^image\/(png|jpe?g)$/i.test(contentType)) {
      return NextResponse.json({ error: 'contentType must be image/png or image/jpeg' }, { status: 400 });
    }
    const bytes = Buffer.from(b64, 'base64');
    if (!bytes.length) return NextResponse.json({ error: 'imageBase64 did not decode' }, { status: 400 });
    if (bytes.length > MAX_AMEND_BYTES) {
      return NextResponse.json({ error: 'image too large — 3.5MB max', bytes: bytes.length }, { status: 413 });
    }
    return applyCleanedSolutionImage(supa, {
      path, questionId, bytes, contentType: contentType.toLowerCase(), note: 'Adrian amended',
    });
  }

  return NextResponse.json({ error: `unknown solution action: ${action || '(none)'}` }, { status: 400 });
}

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supa = getSupabaseAdmin();
  const sp = req.nextUrl.searchParams;

  if (sp.get('kind') === 'solution') return solutionLaneGet(supa, sp);

  if (sp.get('flagged') === '1') {
    const { data: allFlags, error } = await supa
      .from('figure_flags').select('path, question_id, status, created_at')
      .eq('status', 'open').eq('kind', 'question').order('created_at', { ascending: true }).limit(1000);
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
    const { data: flags } = await supa.from('figure_flags').select('path').in('path', paths).eq('status', 'open').eq('kind', 'question');
    const flaggedSet = new Set((flags ?? []).map((f) => f.path));
    for (const it of items) it.flagged = flaggedSet.has(it.path);
  }
  const { count: flaggedCount } = await supa
    .from('figure_flags').select('path', { count: 'exact', head: true }).eq('status', 'open').eq('kind', 'question');
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
  // The solution vet lane is a separate verb set on the same table; every
  // question-figure behaviour below is untouched.
  if (body.kind === 'solution') return solutionLanePost(supa, body, path, questionId);
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
