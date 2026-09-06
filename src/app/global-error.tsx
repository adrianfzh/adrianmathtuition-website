'use client';
// Root-level error boundary (a failure inside the root layout itself). Same
// promise as app/error.tsx: report it, say so plainly, offer a way back.
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error, { tags: { surface: 'global' } }); }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18 }}>Something went wrong on our side</h1>
        <p style={{ color: '#555' }}>Adrian has been told. Try again, or come back in a minute.</p>
        <button onClick={reset} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 10, background: '#1e2a4a', color: '#fff', border: 0 }}>Try again</button>
      </body>
    </html>
  );
}
