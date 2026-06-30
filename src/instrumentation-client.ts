import * as Sentry from '@sentry/nextjs';

// Browser error tracking for the client (e.g. /solo). No-op unless
// NEXT_PUBLIC_SENTRY_DSN is set. Session Replay is off to keep it light.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
