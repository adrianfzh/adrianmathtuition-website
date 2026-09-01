// POST /api/bot/practice-pdf — typeset a "Practice Again" sheet for the bot's
// 📝 button on a returned marked paper (22 Aug 2026). The bot assembles the
// items (one practice question per dropped-marks question, from the run's
// enrichment pass); this route only renders the house-style PDF and parks it in
// Blob. Auth: x-render-secret, the same pair /api/explanations and
// /api/bot/worksheet use. `dry: true` answers without touching Puppeteer.
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';
import { put } from '@vercel/blob';
import { renderPracticePDF, type PracticeItem } from '@/lib/render-practice-pdf';
import { getSupabaseAdmin } from '@/lib/supabase';
import { imgSrc, isPlausibleImagePath, cropUrls } from '@/lib/kiosk-worksheet-images';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bad = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status });

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-render-secret');
  if (!secret || !process.env.RENDER_MARKING_SECRET || !safeEqual(secret, process.env.RENDER_MARKING_SECRET)) {
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
  // Generated figures arrive as direct Blob URLs (host-checked); QB picks arrive
  // as qb_id and are resolved server-side, so the bot never has to know how
  // question images are stored.
  const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;
  const safeUrl = (u: unknown): string | null => {
    if (typeof u !== 'string') return null;
    try { const p = new URL(u); return p.protocol === 'https:' && BLOB_HOST.test(p.hostname) ? u : null; }
    catch { return null; }
  };
  const items: (PracticeItem & { qbId?: string })[] = rawItems
    .map((it) => {
      const o = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      return {
        heading: String(o.heading ?? '').slice(0, 160),
        question: String(o.question ?? '').slice(0, 8000),
        answer: String(o.answer ?? '').slice(0, 8000),
        imageUrls: (Array.isArray(o.imageUrls) ? o.imageUrls : []).map(safeUrl).filter((u): u is string => !!u).slice(0, 3),
        qbId: typeof o.qb_id === 'string' && /^[0-9a-f-]{36}$/.test(o.qb_id) ? o.qb_id : undefined,
      };
    })
    .filter((it) => it.heading && it.question);
  if (!items.length) return bad(400, { error: 'items[] with heading+question is required' });
  if (items.length > 30) return bad(400, { error: 'too many items (max 30)' });

  const dateLabel = new Date().toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore',
  });

  // Resolve QB figures for picked questions: figure_url first (the clean
  // rendered figure when one exists), else the crop set derived from image_url,
  // else stored images[] paths. Capped at 3 per question; failures degrade to a
  // text-only item, never a dead render.
  const qbIds = items.map((it) => it.qbId).filter((id): id is string => !!id);
  if (qbIds.length) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('questions')
        .select('id, figure_url, image_url, images, has_image, image_watermark_status')
        .in('id', qbIds);
      const byId = new Map((data || []).map((r) => [r.id, r]));
      for (const it of items) {
        const row = it.qbId ? byId.get(it.qbId) : null;
        if (!row || !row.has_image || row.image_watermark_status !== 'clean') continue;
        const urls: string[] = [];
        if (typeof row.figure_url === 'string' && row.figure_url) urls.push(row.figure_url);
        else {
          for (const u of cropUrls(row.image_url ?? null)) urls.push(u);
          if (!urls.length && Array.isArray(row.images)) {
            for (const p of row.images) if (isPlausibleImagePath(p)) urls.push(imgSrc(p));
          }
        }
        if (urls.length) it.imageUrls = [...(it.imageUrls || []), ...urls].slice(0, 3);
      }
    } catch (e) {
      console.warn('[practice-pdf] qb image resolve failed:', (e as Error).message);
    }
  }

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
