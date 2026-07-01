import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { generatePracticeQuestion } from '@/lib/learn/generate-practice';

export const runtime = 'nodejs';
export const maxDuration = 60; // code execution is slow

// POST /api/portal/practice/generate  { level, topic, maxRetries?, cache? }
// ADMIN-ONLY test harness for Stage 2. Generates one question and reports whether
// it passed the code-verify gate — so we can measure the reject rate on a topic
// before wiring generation into the student /next flow. maxRetries defaults to 0
// here (raw single-shot pass rate); the student flow will use >=1.
export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { level, topic } = body as { level?: string; topic?: string };
  if (!level || !topic) return NextResponse.json({ error: 'level and topic required' }, { status: 400 });

  const t0 = Date.now();
  try {
    const result = await generatePracticeQuestion({
      level, topic,
      maxRetries: typeof body.maxRetries === 'number' ? body.maxRetries : 0,
      cacheOnPass: body.cache !== false,
    });
    return NextResponse.json({ ...result, ms: Date.now() - t0 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'generation failed', ms: Date.now() - t0 }, { status: 500 });
  }
}
