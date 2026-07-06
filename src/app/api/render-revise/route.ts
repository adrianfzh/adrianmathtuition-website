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
import { createClient } from '@supabase/supabase-js';
import { put } from '@vercel/blob';
import { renderRevisePNG, RenderType, ReviseRenderInput } from '@/lib/render-revise';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_TYPES: RenderType[] = ['question', 'question_with_answer', 'solution'];
const TYPE_TO_FIELD: Record<RenderType, string> = {
  question:              'question_image_url',
  question_with_answer:  'question_with_answer_image_url',
  solution:              'solution_image_url',
};

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cron  = process.env.CRON_SECRET;
  const admin = process.env.ADMIN_PASSWORD;
  return (!!cron && auth === `Bearer ${cron}`) || (!!admin && auth === `Bearer ${admin}`);
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

  // Fetch practice question + subgroup name in one query
  const { data: row, error: fetchErr } = await supabase
    .from('practice_questions')
    .select('*, subgroups(name)')
    .eq('id', practice_question_id)
    .single();

  if (fetchErr || !row) {
    console.error('[render-revise] fetch failed:', fetchErr?.message);
    return NextResponse.json({ error: 'Practice question not found' }, { status: 404 });
  }

  // Cache hit — return existing URL
  if (row[urlField]) {
    return NextResponse.json({ url: row[urlField] });
  }

  // Build render input
  const input: ReviseRenderInput = {
    topic:          row.topic ?? '',
    subgroup_name:  (row.subgroups as { name: string } | null)?.name ?? '',
    question_text:  row.question_text ?? '',
    marks:          row.marks ?? null,
    answer:         row.answer ?? '',
    solution:       row.solution ?? '',
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
    .from('practice_questions')
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
