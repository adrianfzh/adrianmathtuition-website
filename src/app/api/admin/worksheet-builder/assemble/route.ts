// POST /api/admin/worksheet-builder/assemble
// Renders the worksheet (Worked Examples + Practice) to a house-styled A4 PDF
// via Puppeteer + KaTeX, uploads it to Vercel Blob, and logs a
// worksheet_exports row.
//
// Body: { title, subtitle, level, items: [{ id, role:'we'|'practice', text,
//         marks, answer, annotated?, imageUrl? }], format: 'pdf' }
// Returns: { url, exportId }

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { put } from '@vercel/blob';
import { verifyAdminAuth } from '@/lib/schedule-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { closeBrowser } from '@/lib/generate-pdf';
import { renderWorksheetPDF, WorksheetItem } from '@/lib/render-worksheet';

export const runtime = 'nodejs';
export const maxDuration = 60;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'worksheet'
  );
}

export async function POST(req: NextRequest) {
  if (!verifyAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    title?: string;
    subtitle?: string;
    level?: string;
    items?: WorksheetItem[];
    format?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, subtitle, level, items, format } = body;
  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  if (format && format !== 'pdf') {
    return NextResponse.json({ error: 'Only format=pdf is supported (DOCX via the chat clerk for now)' }, { status: 400 });
  }
  for (const it of items) {
    if (!it || typeof it.text !== 'string' || !['we', 'practice'].includes(it.role)) {
      return NextResponse.json({ error: 'Each item needs text and role we|practice' }, { status: 400 });
    }
  }

  // ── Render PDF ──────────────────────────────────────────────────────────────
  let pdf: Buffer;
  try {
    pdf = await renderWorksheetPDF({
      title: title.trim(),
      subtitle: subtitle?.trim() ?? '',
      level: level ?? '',
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'PDF render failed';
    console.error('[worksheet-builder/assemble] render failed:', message);
    return NextResponse.json({ error: `PDF render failed: ${message}` }, { status: 500 });
  } finally {
    // Single-shot render per request — release Chromium (matches batch PDF pattern).
    try {
      await closeBrowser();
    } catch {
      /* ignore */
    }
  }

  // ── Upload to Vercel Blob ───────────────────────────────────────────────────
  const uuid = crypto.randomUUID();
  const path = `worksheets/${uuid}/${slugify(title)}.pdf`;
  let url: string;
  try {
    const blob = await put(path, pdf, {
      access: 'public',
      contentType: 'application/pdf',
      allowOverwrite: true,
    });
    url = blob.url;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Blob upload failed';
    console.error('[worksheet-builder/assemble] blob upload failed:', message);
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }

  // ── Log worksheet_exports row ──────────────────────────────────────────────
  const totalMarks = items.reduce((s, i) => s + (i.marks ?? 0), 0);
  let exportId: string | null = null;
  try {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa
      .from('worksheet_exports')
      .insert({
        title: title.trim(),
        subtitle: subtitle?.trim() ?? null,
        level: level ?? null,
        mode: 'mixed',
        format: 'pdf',
        question_ids: items.map(i => i.id),
        question_count: items.length,
        total_marks: totalMarks,
        template_id: 'worksheet-builder-v1',
        file_urls: { pdf: url },
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    exportId = data?.id ?? null;
  } catch (err: unknown) {
    // Non-fatal — the PDF exists either way.
    console.error('[worksheet-builder/assemble] export log failed:', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ url, exportId });
}
