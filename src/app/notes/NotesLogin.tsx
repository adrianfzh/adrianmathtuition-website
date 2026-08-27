'use client';
// Login door for the notes portal. Admin enters the shared admin password
// (same `ensureAdminSession` / `loginAdminSession` pattern as /admin, so one
// login covers both); portal students sign in at /login and come back — the
// layout accepts either session (isNotesViewer).
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
        className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold text-navy">Notes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Students: <a href="/login?next=/notes" className="font-semibold text-navy underline underline-offset-2">log in to your portal</a> to
          read the notes. The password box below is for Adrian.
        </p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          aria-label="Admin password"
          className="mt-4 w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[15px]
                     text-gray-900 placeholder:text-gray-400 focus:border-navy/40 focus:outline-none
                     focus:ring-2 focus:ring-navy/15"
        />
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password === ''}
          className="mt-4 w-full rounded-2xl bg-navy px-4 py-3 text-sm font-semibold
                     text-[hsl(45,100%,96%)] shadow-sm transition-opacity hover:opacity-90
                     disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </main>
  );
}
