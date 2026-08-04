'use client';
// Admin gate for the notes portal (Phase 1). Student auth is Phase 3 — this is
// deliberately the same `ensureAdminSession` / `loginAdminSession` pattern the
// other admin pages use, so one login covers /admin and /notes alike.
//
// The layout also refuses to render any content server-side without a valid
// session, so this form is the door, not merely a curtain.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';

export default function NotesLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A legacy plaintext cookie can be silently upgraded to a signed session —
  // if that succeeds the page re-renders authed without Adrian typing anything.
  useEffect(() => {
    ensureAdminSession().then(ok => {
      if (ok) router.refresh();
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await loginAdminSession(password);
    setBusy(false);
    if (ok) {
      setPassword('');
      router.refresh();
    } else {
      setError('Wrong password.');
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-fd-border bg-fd-card p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-fd-foreground">Notes</h1>
        <p className="mt-1 text-sm text-fd-muted-foreground">
          Admin only for now. Student access is coming later.
        </p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          aria-label="Admin password"
          className="mt-4 w-full rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm
                     text-fd-foreground focus:border-fd-primary focus:outline-none focus:ring-1
                     focus:ring-fd-primary"
        />
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password === ''}
          className="mt-4 w-full rounded-lg bg-fd-primary px-3 py-2 text-sm font-medium
                     text-fd-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  );
}
