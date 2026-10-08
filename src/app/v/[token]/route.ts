// GET /v/<token> — what a "View" button in one of our WhatsApp messages opens
// (Adrian, 8 Oct 2026). PUBLIC: the signed token in the address is the only
// proof, and it opens exactly one record (lib/view-token.ts).
//
// ⚠ READ-ONLY, always. Link previewers fetch this before a parent taps it.
//
// Kinds: invoice → the invoice PDF, streamed from here so the parent stays on
// our own address. paper and note are not built yet — they say so plainly.
import { NextRequest, NextResponse } from 'next/server';
import { airtableRequest } from '@/lib/airtable';
import { verifyViewToken } from '@/lib/view-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One plain page for every "no" — a parent never sees a stack trace or a JSON blob. */
function plainPage(title: string, line: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family: -apple-system, system-ui, sans-serif; max-width: 28rem; margin: 18vh auto; padding: 0 1.25rem; color: #111827; line-height: 1.5;">
<h1 style="font-size: 1.25rem; margin: 0 0 0.75rem;">${title}</h1>
<p style="margin: 0; color: #4b5563;">${line}</p>
</body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

const EXPIRED = () => plainPage('This link no longer works', 'It may have expired. Please message us on WhatsApp and we will send you a new one.', 401);
const TRY_AGAIN = () => plainPage('Please try again in a moment', 'We could not open this just now. If it keeps happening, message us on WhatsApp.', 503);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const secret = process.env.SIGNUP_SECRET || '';
  if (!secret) {
    console.error('[view] SIGNUP_SECRET is not set — every link is dead');
    return TRY_AGAIN();
  }
  const what = verifyViewToken(token, secret);
  if (!what) return EXPIRED();

  if (what.kind !== 'invoice') {
    return plainPage('Coming soon', 'This page is not ready yet. Please message us on WhatsApp if you need it now.', 404);
  }

  try {
    const rec = await airtableRequest('Invoices', `/${what.id}`);
    const url = String(rec?.fields?.['PDF URL'] || '');
    if (!/^https:\/\//.test(url)) return TRY_AGAIN();
    const pdf = await fetch(url, { cache: 'no-store' });
    if (!pdf.ok || !pdf.body) return TRY_AGAIN();
    return new NextResponse(pdf.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="AdrianMath-invoice.pdf"',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (e) {
    console.error('[view] invoice open failed:', e instanceof Error ? e.message : e);
    return TRY_AGAIN();
  }
}
