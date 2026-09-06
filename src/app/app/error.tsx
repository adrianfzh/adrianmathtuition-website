'use client';
// The student app's error boundary (Adrian, 7 Sep 2026: "error tracking for the
// student side, so a broken page is seen by us before a parent reports it").
// Reports to Sentry when a DSN is configured, and shows a calm page with a
// retry — never a stack trace, never a blank screen.
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error, { tags: { surface: 'student-app' } }); }, [error]);
  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-black/5 p-6 text-center">
        <p className="text-3xl mb-2" aria-hidden>😬</p>
        <h1 className="text-lg font-bold text-navy">Something went wrong on our side</h1>
        <p className="text-sm text-gray-600 mt-2">Nothing you did. Adrian has been told. Try again, or come back in a minute.</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={reset} className="text-sm font-semibold bg-navy text-white rounded-xl px-4 py-2">Try again</button>
          <Link href="/app" className="text-sm font-semibold text-navy underline underline-offset-2">Home</Link>
        </div>
        {error.digest && <p className="text-[11px] text-gray-400 mt-4">Ref {error.digest}</p>}
      </div>
    </main>
  );
}
