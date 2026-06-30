import * as Sentry from '@sentry/nextjs';

// Server + edge error tracking. No-op unless a DSN is set, so this is safe to
// ship before the Sentry project exists. Add SENTRY_DSN (server) in the env to
// turn it on. Source-map upload (readable client traces) is a later step that
// needs SENTRY_AUTH_TOKEN — errors are captured regardless.
export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || 'development',
      tracesSampleRate: 0.1,
    });
  }
}

// Captures errors thrown in nested React Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
