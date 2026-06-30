import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';

// Diagnostic: confirms Sentry initialised at runtime without exposing the DSN.
// serverClientInitialized = the instrumentation register() hook ran and Sentry
// has a live client; *DsnPresent = the env vars are visible to the process.
export async function GET() {
  return NextResponse.json({
    serverClientInitialized: !!Sentry.getClient(),
    serverDsnPresent: !!process.env.SENTRY_DSN,
    publicDsnPresent: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
