'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase-client';

// Two modes:
//  - default: "enter your email" → sends the reset email
//  - ?mode=update: user arrived via the emailed link (session established by
//    /auth/callback) → "set a new password" form
function ResetPasswordInner() {
  const router = useRouter();
  const isUpdate = useSearchParams().get('mode') === 'update';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await getSupabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password?mode=update')}`,
    });
    // Always show success — never reveal whether the email exists.
    setSent(true);
    setBusy(false);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { error } = await getSupabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError('Could not update password — the link may have expired. Request a new one.');
      setBusy(false);
      return;
    }
    router.replace('/app');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[hsl(45,100%,97%)]">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md border border-black/5 p-8">
        <h1 className="text-xl font-bold text-navy text-center mb-6">
          {isUpdate ? 'Set a new password' : 'Reset password'}
        </h1>

        {isUpdate ? (
          <form onSubmit={handleUpdate} className="space-y-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="Repeat new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              If an account exists for <span className="font-semibold">{email}</span>, a reset link is on
              its way. Check your inbox (and spam folder).
            </p>
            <Link href="/login" className="block text-sm text-navy underline underline-offset-2">
              Back to log in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRequest} className="space-y-3">
            <p className="text-sm text-gray-600 mb-1">
              Enter your account email and we&apos;ll send you a link to set a new password.
            </p>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-navy text-[hsl(45,100%,96%)] rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/login" className="block text-center text-sm text-navy underline underline-offset-2">
              Back to log in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}
