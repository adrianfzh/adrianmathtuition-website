'use client';
// 🚪 /admin/open?file=/api/files/… — sign in, then open the file (7 Oct 2026).
// Reached when a private file's link is opened in a browser with no session — the
// "🖼 Images" button under a marking message, opened inside Telegram (lib/file-door).
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ensureAdminSession, loginAdminSession } from '@/lib/admin-client';
import { safeFilePath } from '@/lib/file-door';

function OpenFile() {
  const file = safeFilePath(useSearchParams().get('file'));
  const [state, setState] = useState<'checking' | 'ask' | 'busy' | 'opening'>('checking');
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (!file) return;
    ensureAdminSession().then(ok => { if (ok) { setState('opening'); window.location.replace(file); } else setState('ask'); });
  }, [file]);

  if (!file) return <p className="text-sm text-gray-600">This link is not a file.</p>;
  if (state === 'checking' || state === 'opening') return <p className="text-sm text-gray-600">Opening the file…</p>;

  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setState('busy'); setWrong(false);
      if (await loginAdminSession(password)) { setState('opening'); window.location.replace(file); }
      else { setWrong(true); setState('ask'); }
    }}>
      <h1 className="text-lg font-bold text-navy">Sign in to open this file</h1>
      <p className="text-sm text-gray-600">This browser is not signed in. You only need to do this once here.</p>
      <input type="password" autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Admin password" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base" />
      {wrong && <p className="text-sm text-red-700">That password was not accepted.</p>}
      <button type="submit" disabled={state === 'busy' || !password} className="w-full rounded-xl bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {state === 'busy' ? 'Signing in…' : 'Sign in and open'}
      </button>
      <p className="text-xs text-gray-500">A student? <a href="/login" className="underline">Sign in to the app</a> and open the paper from Papers.</p>
    </form>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-[hsl(45,100%,98%)] flex items-start justify-center p-6 pt-16">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm border border-black/5">
        <Suspense fallback={<p className="text-sm text-gray-600">Opening the file…</p>}><OpenFile /></Suspense>
      </div>
    </main>
  );
}
