import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolveGradingModel, MATH_SYSTEM } from '@/lib/learn/prompts';
import { parseJson } from '@/lib/learn/parse';
import { getRubric, buildEnglishSystem } from '@/lib/learn/rubric';
import { verifyAdminAuth } from '@/lib/schedule-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  // Admin-gated: caller-supplied image + caller-chosen model against
  // ANTHROPIC_API_KEY, no rate limit — /solo is Adrian's unlinked prototype,
  // so the admin session cookie (or Bearer ADMIN_PASSWORD) is the only
  // intended caller. If /solo ever goes student-facing it needs its own
  // auth + caps first (see /api/tools/vision for the compensating-controls bar).
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'unauthorized — log in at /admin first' }, { status: 401 });
  }

  let body: { mode?: string; text?: string; image?: string; level?: string; paper?: string; essayType?: string; question?: string; model?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }); }

  const mode = body.mode === 'math' ? 'math' : 'english';
  const system = mode === 'math'
    ? MATH_SYSTEM
    : buildEnglishSystem(await getRubric({ level: body.level, paper: body.paper, essayType: body.essayType }));

  // Build the user message.
  const content: Anthropic.ContentBlockParam[] = [];
  if (mode === 'math') {
    if (!body.image) return NextResponse.json({ error: 'image required for math mode' }, { status: 400 });
    const m = body.image.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
    if (!m) return NextResponse.json({ error: 'image must be a base64 data URL (png/jpeg/webp)' }, { status: 400 });
    const media = (m[1] === 'image/jpg' ? 'image/jpeg' : m[1]) as 'image/png' | 'image/jpeg' | 'image/webp';
    content.push({ type: 'image', source: { type: 'base64', media_type: media, data: m[2] } });
    content.push({ type: 'text', text: body.question?.trim() ? `The question is: ${body.question.trim()}\n\nGrade my working in the image.` : 'Grade my working in the image.' });
  } else {
    if (!body.text?.trim()) return NextResponse.json({ error: 'text required for english mode' }, { status: 400 });
    const ctx = body.question?.trim() ? `Essay question / prompt: ${body.question.trim()}\n\n` : '';
    content.push({ type: 'text', text: `${ctx}Here is my writing:\n\n${body.text.trim()}` });
  }

  const model = resolveGradingModel(body.model);
  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 3500,
      system,
      messages: [{ role: 'user', content }],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
    let parsed: any;
    try { parsed = parseJson(raw); }
    catch { return NextResponse.json({ error: 'Could not parse feedback', raw: raw.slice(0, 400) }, { status: 502 }); }
    parsed.mode = mode;
    parsed.model = model;
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('[learn/grade]', err?.message);
    return NextResponse.json({ error: err?.message || 'grading failed' }, { status: 500 });
  }
}
