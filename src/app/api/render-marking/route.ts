import { NextRequest, NextResponse } from 'next/server';
import { renderMarkingPNG } from '@/lib/render-marking';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // 1. Validate secret
  const secret = request.headers.get('x-render-secret');
  if (!secret || secret !== process.env.RENDER_MARKING_SECRET) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  // 2. Parse body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // 3. Validate minimal shape
  if (!body?.marking?.lines || !Array.isArray(body.marking.lines)) {
    return NextResponse.json({ error: 'missing or invalid marking.lines' }, { status: 400 });
  }
  if (!body?.student?.name) {
    return NextResponse.json({ error: 'missing student.name' }, { status: 400 });
  }

  // 4. Render
  try {
    const png = await renderMarkingPNG(body);
    return new NextResponse(png as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="marking-${body.marking.question?.number ?? 'unknown'}.png"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[render-marking] render failed:', err);
    return NextResponse.json({ error: 'render failed', detail: err.message }, { status: 500 });
  }
}
