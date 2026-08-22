// POST /api/bot/practice-pdf — typeset a "Practice Again" sheet for the bot's
// 📝 button on a returned marked paper (22 Aug 2026). The bot assembles the
// items (one practice question per dropped-marks question, from the run's
// enrichment pass); this route only renders the house-style PDF and parks it in
// Blob. Auth: x-render-secret, the same pair /api/explanations and
// /api/bot/worksheet use. `dry: true` answers without touching Puppeteer.
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { renderPracticePDF, type PracticeItem } from '@/lib/render-practice-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bad = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });

export async function POST(req: NextRequest) {
  if (req.headers.get('x-render-secret') !== process.env.RENDER_MARKING_SECRET) {
    return bad(401, { error: 'Unauthorized' });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad(400, { error: 'invalid JSON body' });
  }

  if (body.dry === true) return NextResponse.json({ ok: true });

  const forLine = typeof body.forLine === 'string' && body.forLine.trim() ? body.forLine.trim().slice(0, 80) : 'for you';
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: PracticeItem[] = rawItems
    .map((it) => {
      const o = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      return {
        heading: String(o.heading ?? '').slice(0, 160),
        question: String(o.question ?? '').slice(0, 8000),
        answer: String(o.answer ?? '').slice(0, 8000),
      };
    })
    .filter((it) => it.heading && it.question);
  if (!items.length) return bad(400, { error: 'items[] with heading+question is required' });
  if (items.length > 30) return bad(400, { error: 'too many items (max 30)' });

  const dateLabel = new Date().toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
  });

  try {
    const pdf = await renderPracticePDF({ forLine, dateLabel, items });
    const runId = typeof body.runId === 'string' ? body.runId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) : 'adhoc';
    const blob = await put(`mark-paper/practice-pdf/${runId}-${Date.now()}.pdf`, pdf, {
      access: 'public', contentType: 'application/pdf', token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url, count: items.length });
  } catch (e) {
    console.warn('[practice-pdf] render failed:', (e as Error).message);
    return bad(500, { error: (e as Error).message || 'render failed' });
  }
}
