// DEPRECATED: replaced by upload-start / upload-chunk / upload-complete (server-side multipart).
// Kept for one release cycle in case rollback is needed. Safe to delete after next deploy.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/safe-equal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // clientPayload carries the admin password from the upload() call.
        // Unset ADMIN_PASSWORD must fail CLOSED — the old `pw && …` guard
        // handed out upload tokens to anyone when the env var was missing.
        const pw = process.env.ADMIN_PASSWORD;
        if (!pw || !safeEqual(String(clientPayload ?? ''), pw)) {
          throw new Error('Unauthorized');
        }
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 50 * 1024 * 1024,
          access: 'private',
          tokenPayload: JSON.stringify({ uploadedBy: 'admin' }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[upload-token] upload completed:', blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = msg === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
