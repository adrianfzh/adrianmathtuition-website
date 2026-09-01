/**
 * POST /api/render-revise
 *
 * Body: { type: "question"|"question_with_answer"|"solution", practice_question_id: uuid }
 * Auth: Bearer CRON_SECRET or ADMIN_PASSWORD
 *
 * 1. Fetches the practice_question row from Supabase
 * 2. Returns cached URL if already rendered
 * 3. Renders HTML→PNG via Puppeteer + KaTeX
 * 4. Uploads to Vercel Blob under revise/{id}/{type}.png
 * 5. Updates practice_questions with the URL
 * 6. Returns { url }
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { createClient } from '@supabase/supabase-js';
import { put } from '@vercel/blob';
import { renderRevisePNG, RenderType, ReviseRenderInput } from '@/lib/render-revise';
import { rollupSolution, rollupAnswer } from '@/lib/solution-rollup';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_TYPES: RenderType[] = ['question', 'question_with_answer', 'solution'];
const TYPE_TO_FIELD = {
  question:              'question_image_url',
  question_with_answer:  'question_with_answer_image_url',
  solution:              'solution_image_url',
} as const satisfies Record<RenderType, string>;

function checkAuth(req: NextRequest): boolean {
  // CRON_SECRET Bearer (bot/cron callers) or standard admin auth
  // (signed session cookie or legacy ADMIN_PASSWORD Bearer).
  const cron = process.env.CRON_SECRET;
  if (cron && safeEqual(req.headers.get('authorization') ?? '', `Bearer ${cron}`)) return true;
  return verifyAdminAuth(req);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { type?: string; practice_question_id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { type, practice_question_id } = body;
  if (!type || !VALID_TYPES.includes(type as RenderType) || !practice_question_id) {
    return NextResponse.json({ error: 'Missing or invalid type / practice_question_id' }, { status: 400 });
  }

  const rType = type as RenderType;
  const urlField = TYPE_TO_FIELD[rType];

  // Diagnostic: log which env vars are available
  console.log('[render-revise] env check — SUPABASE_URL:', !!process.env.SUPABASE_URL,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'secret key:', !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

  // Read with anon key, write with service_role (anon has no UPDATE without RLS policy)
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  );
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  );

  // ONE STORE: practice questions now live in `questions` (same ids as the old
  // pool). Sub-group name comes via the question_subgroups join table.
  // Explicit columns — select('*') dragged the 1536-dim embedding along
  // (~9.5KB of JSON, ~80% of the row payload) on every render fetch.
  const { data: row, error: fetchErr } = await supabase
    .from('questions')
    .select('question_image_url, question_with_answer_image_url, solution_image_url, topics, question_text, total_marks, answer, solution, parts')
    .eq('id', practice_question_id)
    .single();

  if (fetchErr || !row) {
    console.error('[render-revise] fetch failed:', fetchErr?.message);
    return NextResponse.json({ error: 'Practice question not found' }, { status: 404 });
  }
  const { data: sgLink } = await supabase
    .from('question_subgroups')
    .select('subgroups(name)')
    .eq('question_id', practice_question_id)
    .eq('is_primary', true)
    .limit(1);

  // Cache hit — return existing URL
  if (row[urlField]) {
    return NextResponse.json({ url: row[urlField] });
  }

  // Build render input
  const input: ReviseRenderInput = {
    topic:          (Array.isArray(row.topics) ? row.topics[0] : null) ?? '',
    subgroup_name:  (() => { const sg = sgLink?.[0]?.subgroups as unknown; return (Array.isArray(sg) ? (sg[0] as { name?: string })?.name : (sg as { name?: string } | null)?.name) ?? ''; })(),
    question_text:  row.question_text ?? '',
    marks:          row.total_marks ?? null,
    // Parts are canonical since the 2026-08-27 canonicalisation: ~20.3k rows
    // hold their worked solution ONLY inside parts[]. Reading the top-level
    // column alone rendered a BLANK solution image for every one of them.
    answer:         rollupAnswer(row.answer, row.parts),
    solution:       rollupSolution(row.solution, row.parts),
  };

  // Render PNG
  let png: Buffer;
  try {
    png = await renderRevisePNG(input, rType);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[render-revise] Puppeteer render failed:', msg);
    return NextResponse.json({ error: 'Render failed', detail: msg }, { status: 500 });
  }

  // Upload to Vercel Blob
  const blobPath = `revise/${practice_question_id}/${rType}.png`;
  let blobUrl: string;
  try {
    const blob = await put(blobPath, png, {
      access: 'public',
      contentType: 'image/png',
      allowOverwrite: true,
    });
    blobUrl = blob.url;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[render-revise] blob upload failed:', msg);
    return NextResponse.json({ error: 'Blob upload failed', detail: msg }, { status: 500 });
  }

  // Cache the URL in Supabase before returning — must await, or Vercel kills the function first
  const { data: updateData, error: updateErr } = await supabaseAdmin
    .from('questions')
    .update({ [urlField]: blobUrl })
    .eq('id', practice_question_id)
    .select(urlField);
  console.log('[render-revise] UPDATE result:', JSON.stringify({
    urlField,
    blobUrl,
    practice_question_id,
    data: updateData,
    error: updateErr ? { message: updateErr.message, code: updateErr.code, details: updateErr.details } : null,
  }));

  return NextResponse.json({ url: blobUrl });
}
