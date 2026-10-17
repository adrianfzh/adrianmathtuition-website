// /api/portal/humanities/transcribe — type out a photographed handwritten answer (15 Oct 2026,
// lib/humanities-photo.ts). POST { questionId | questionText, mode?, images: [{ data, mediaType }] } → { text, unsure }.
// mode 'question' | 'sources' types out a printed question from school, or its sources (lib/humanities-own).
// The text goes back into the answer box for the student to check; nothing is handed in here and
// no photo is stored. Anonymous → 401 (the health-check probes this). Door: humanitiesOwnOpen().
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sessionAccount, portalIdentity } from '@/lib/portal-auth';
import { humanitiesOwnOpen, humanitiesWholePaperOpen } from '@/lib/portal-beta';
import { getSupabaseAdmin } from '@/lib/supabase';
import { questionById } from '@/lib/humanities-questions';
import { transcribePrompt, parseTranscript, parseWholeQuestion, parsePaperItems, isPhotoMode, MAX_PHOTO_PAGES, DAILY_PHOTO_CAP, PHOTO_READ_MODEL, PHOTO_FIGURE_MODEL } from '@/lib/humanities-photo';
import { sgtDayStartISO } from '@/lib/sgt';
import { anthropicText } from '@/lib/claude-models';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const KIND = 'humanities:transcribe';
type Media = 'image/jpeg' | 'image/png' | 'image/webp';
const MEDIA: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: NextRequest) {
  const account = await sessionAccount();
  if (!account) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!(await humanitiesOwnOpen())) return NextResponse.json({ error: 'Humanities feedback is not open yet.' }, { status: 403 });
  const sid = portalIdentity(account);

  const body = await req.json().catch(() => ({})) as { questionId?: unknown; questionText?: unknown; mode?: unknown; images?: unknown; after?: unknown };
  const mode = isPhotoMode(body.mode) ? body.mode : 'answer';
  // Whole paper is closed to students (HUMANITIES_WHOLE_PAPER_OPEN_TO_STUDENTS).
  if (mode === 'paper' && !(await humanitiesWholePaperOpen())) return NextResponse.json({ error: 'Send one question at a time.' }, { status: 403 });
  const bankQ = body.questionId ? questionById(String(body.questionId))?.question.question : null;
  const questionText = bankQ ?? String(body.questionText ?? '').slice(0, 1500).trim();
  if (mode === 'answer' && !questionText) return NextResponse.json({ error: 'That question is not in the bank.' }, { status: 400 });
  const raw = Array.isArray(body.images) ? body.images as { data?: unknown; mediaType?: unknown }[] : [];
  if (raw.length === 0) return NextResponse.json({ error: 'Add a photo of your answer.' }, { status: 400 });
  if (raw.length > MAX_PHOTO_PAGES) return NextResponse.json({ error: `Up to ${MAX_PHOTO_PAGES} photos for one answer.` }, { status: 400 });
  const images: { data: string; mediaType: Media }[] = [];
  for (const im of raw) {
    const mediaType = String(im.mediaType ?? '');
    const data = String(im.data ?? '').replace(/^data:[^,]+,/, '');
    if (!MEDIA.includes(mediaType) || !data) return NextResponse.json({ error: 'That file is not a photo.' }, { status: 400 });
    if (data.length > 2_000_000) return NextResponse.json({ error: 'That photo is too large.' }, { status: 413 });
    images.push({ data, mediaType: mediaType as Media });
  }

  const sb = getSupabaseAdmin();
  const { count } = await sb.from('portal_event_log').select('id', { count: 'exact', head: true })
    .eq('identity', sid).eq('kind', KIND).gte('created_at', sgtDayStartISO());
  if ((count ?? 0) >= DAILY_PHOTO_CAP) {
    return NextResponse.json({ error: 'You have sent a lot of photos today. Type this one, or send it tomorrow.' }, { status: 429 });
  }

  let reply = '';
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      // Handwriting: the mid-size model. A printed question with its figures: the large one (exact graph numbers).
      model: mode === 'answer' ? PHOTO_READ_MODEL : PHOTO_FIGURE_MODEL,
      max_tokens: mode === 'paper' ? 16000 : 3000,
      messages: [{
        role: 'user',
        content: [
          ...images.map(im => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType, data: im.data } })),
          // A whole paper's later batch: the question the pages before ended on (an answer may run on).
          { type: 'text' as const, text: transcribePrompt(images.length, questionText, mode, String((body as { after?: unknown }).after ?? '').replace(/[^0-9A-Za-z()]/g, '').slice(0, 8)) },
        ],
      }],
    });
    reply = anthropicText(msg);
  } catch (e) {
    console.error('[humanities-transcribe]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'We could not read the photo just now. Try again in a minute.' }, { status: 503 });
  }

  // The whole question: the question for the box, its sources/figures as material for the marker.
  const whole = mode === 'question' ? parseWholeQuestion(reply) : null;
  // Pages of a whole paper: the items on these pages, merged by the page across batches (lib/humanities-paper).
  if (mode === 'paper') {
    const items = parsePaperItems(reply);
    await sb.from('portal_event_log').insert({ identity: sid, kind: KIND, detail: { questionId: 'paper', mode, pages: images.length, ok: !!items, items: items?.length ?? 0 } }).then(() => {});
    if (!items) return NextResponse.json({ error: 'We could not read those pages. Take them again, close up, in good light.' }, { status: 422 });
    return NextResponse.json({ items });
  }
  const out = parseTranscript(whole ? whole.question : reply, mode);
  await sb.from('portal_event_log').insert({
    identity: sid, kind: KIND,
    detail: { questionId: body.questionId ? String(body.questionId) : 'own', mode, pages: images.length, ok: out.ok, ...(out.ok ? { words: out.text.split(/\s+/).length, unsure: out.unsure } : {}) },
  }).then(() => {});
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ text: out.text, unsure: out.unsure, ...(whole ? { material: whole.material } : {}) });
}
